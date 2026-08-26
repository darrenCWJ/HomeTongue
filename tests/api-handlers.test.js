// @vitest-environment node
import { describe, test, expect, beforeEach, vi } from "vitest";
import chatHandler from "../api/chat.js";
import transcribeHandler from "../api/transcribe.js";
import ttsHandler from "../api/tts.js";

function mockRes() {
  const res = {
    statusCode: 0,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end() {
      return this;
    },
  };
  return res;
}

// Distinct IPs avoid tripping the per-IP rate limiter across tests
let ipCounter = 0;
function mockReq(body, method = "POST") {
  ipCounter++;
  return {
    method,
    body,
    headers: { "x-forwarded-for": `10.0.0.${ipCounter % 250}, 1.2.3.4` },
    socket: { remoteAddress: "127.0.0.1" },
  };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("api/chat validation", () => {
  test("rejects non-POST", async () => {
    const res = mockRes();
    await chatHandler(mockReq({}, "GET"), res);
    expect(res.statusCode).toBe(405);
  });

  test("returns 503 when no key configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("VITE_OPENAI_API_KEY", "");
    const res = mockRes();
    await chatHandler(mockReq({ messages: [{ role: "user", content: "hi" }] }), res);
    expect(res.statusCode).toBe(503);
  });

  test("rejects empty and oversized message arrays", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    for (const messages of [[], undefined, Array(21).fill({ role: "user", content: "x" })]) {
      const res = mockRes();
      await chatHandler(mockReq({ messages }), res);
      expect(res.statusCode).toBe(400);
    }
  });

  test("rejects invalid roles and non-string content", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    for (const messages of [[{ role: "tool", content: "x" }], [{ role: "user", content: 42 }], [null]]) {
      const res = mockRes();
      await chatHandler(mockReq({ messages }), res);
      expect(res.statusCode).toBe(400);
    }
  });

  test("rejects requests over the character budget", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const res = mockRes();
    await chatHandler(mockReq({ messages: [{ role: "user", content: "x".repeat(25_000) }] }), res);
    expect(res.statusCode).toBe(400);
  });

  test("forwards valid requests and returns content, clamping max_tokens", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: "hello" } }] }), { status: 200 })
      );
    const res = mockRes();
    await chatHandler(
      mockReq({ messages: [{ role: "user", content: "hi" }], max_tokens: 99999, temperature: 5 }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ content: "hello" });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.max_tokens).toBeLessThanOrEqual(2000);
    expect(sent.temperature).toBeLessThanOrEqual(2);
  });

  test("hides upstream error details behind a 502", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("secret upstream detail", { status: 401 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = mockRes();
    await chatHandler(mockReq({ messages: [{ role: "user", content: "hi" }] }), res);
    expect(res.statusCode).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain("secret upstream detail");
  });
});

describe("api/transcribe validation", () => {
  test("rejects missing audio", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const res = mockRes();
    await transcribeHandler(mockReq({}), res);
    expect(res.statusCode).toBe(400);
  });

  test("rejects disallowed model and language", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    for (const body of [
      { audio: "AAAA", model: "gpt-4o" },
      { audio: "AAAA", language: "fr" },
      { audio: "AAAA", prompt: "x".repeat(501) },
    ]) {
      const res = mockRes();
      await transcribeHandler(mockReq(body), res);
      expect(res.statusCode).toBe(400);
    }
  });

  test("rejects audio over the decoded-size cap", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    // 3.3MB decoded > 3.2MB cap
    const big = Buffer.alloc(3.3 * 1024 * 1024).toString("base64");
    const res = mockRes();
    await transcribeHandler(mockReq({ audio: big }), res);
    expect(res.statusCode).toBe(400);
  });

  test("accepts valid audio and returns trimmed text", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ text: "  你好  " }), { status: 200 })
    );
    const res = mockRes();
    await transcribeHandler(
      mockReq({ audio: Buffer.from("fake-wav").toString("base64"), language: "zh" }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ text: "你好" });
  });
});

describe("api/tts validation", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_API_JSON", JSON.stringify({ private_key: "k", client_email: "e@e.com" }));
  });

  test("rejects text over 500 chars", async () => {
    const res = mockRes();
    await ttsHandler(
      mockReq({ text: "x".repeat(501), voiceName: "yue-HK-Chirp3-HD-Zephyr", languageCode: "yue-HK" }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  test("rejects voices outside the allowlist pattern", async () => {
    for (const voiceName of ["en-US-Standard-A", "yue-HK-Chirp3-HD-Zephyr; DROP", ""]) {
      const res = mockRes();
      await ttsHandler(mockReq({ text: "你好", voiceName, languageCode: "yue-HK" }), res);
      expect(res.statusCode).toBe(400);
    }
  });

  test("rejects unsupported language codes", async () => {
    const res = mockRes();
    await ttsHandler(
      mockReq({ text: "你好", voiceName: "yue-HK-Chirp3-HD-Zephyr", languageCode: "en-US" }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  test("returns 500 when service account JSON is missing", async () => {
    vi.stubEnv("GOOGLE_API_JSON", "");
    vi.stubEnv("VITE_GOOGLE_API_JSON", "");
    const res = mockRes();
    await ttsHandler(
      mockReq({ text: "你好", voiceName: "yue-HK-Chirp3-HD-Zephyr", languageCode: "yue-HK" }),
      res
    );
    expect(res.statusCode).toBe(500);
  });
});

describe("CORS for native webviews", () => {
  test("answers an allowlisted OPTIONS preflight with 204 and reflects the origin", async () => {
    const res = mockRes();
    await chatHandler(
      { method: "OPTIONS", headers: { origin: "https://localhost" }, socket: { remoteAddress: "127.0.0.1" } },
      res
    );
    expect(res.statusCode).toBe(204);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("https://localhost");
    expect(res.headers["Access-Control-Allow-Methods"]).toBe("POST, OPTIONS");
  });

  test("gives web origins no allow-origin header and leaves POST handling unchanged", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "hello" } }] }), { status: 200 })
    );
    const res = mockRes();
    const req = mockReq({ messages: [{ role: "user", content: "hi" }] });
    req.headers.origin = "https://home-tongue.vercel.app";
    await chatHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});

describe("rate limiting", () => {
  test("chat returns 429 after exceeding the per-IP window", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 })
    );
    const fixedIpReq = () => ({
      method: "POST",
      body: { messages: [{ role: "user", content: "hi" }] },
      headers: { "x-forwarded-for": "203.0.113.99" },
      socket: { remoteAddress: "203.0.113.99" },
    });
    let last;
    for (let i = 0; i < 61; i++) {
      last = mockRes();
      await chatHandler(fixedIpReq(), last);
    }
    expect(last.statusCode).toBe(429);
  });
});

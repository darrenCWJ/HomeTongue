import { afterEach, describe, expect, it, vi } from "vitest";
import { chatCore } from "./chatCore.js";

const ENV = { OPENAI_API_KEY: "test-key" };

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => data, text: async () => JSON.stringify(data) };
}

function stubFetch(impl) {
  const mock = vi.fn(impl);
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("chatCore", () => {
  it("returns 503 when no API key is configured (offline-mock contract)", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({}));

    const result = await chatCore({ messages: [{ role: "user", content: "hi" }] }, {});

    expect(result.status).toBe(503);
    expect(result.body).toEqual({ error: "Translation service is not configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 when messages is missing or not an array", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({}));

    const result = await chatCore({ messages: "nope" }, ENV);

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "messages must be a non-empty array (max 20)" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 when messages exceeds the 20-message cap", async () => {
    stubFetch(async () => jsonResponse({}));
    const messages = Array.from({ length: 21 }, () => ({ role: "user", content: "hi" }));

    const result = await chatCore({ messages }, ENV);

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "messages must be a non-empty array (max 20)" });
  });

  it("returns 400 when a message has an invalid role or non-string content", async () => {
    stubFetch(async () => jsonResponse({}));

    const result = await chatCore({ messages: [{ role: "tool", content: "hi" }] }, ENV);

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Each message needs a valid role and string content" });
  });

  it("returns 400 when total content exceeds the 24k character cap", async () => {
    stubFetch(async () => jsonResponse({}));
    const messages = [{ role: "user", content: "x".repeat(24_001) }];

    const result = await chatCore({ messages }, ENV);

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Request too large" });
  });

  it("returns 200 with content and clamps temperature and max_tokens", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ choices: [{ message: { content: "你好" } }] }));

    const result = await chatCore(
      {
        messages: [{ role: "user", content: "hello" }],
        temperature: 9,
        max_tokens: 999_999,
        response_format: { type: "json_object" },
      },
      ENV
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ content: "你好" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const sent = JSON.parse(init.body);
    expect(sent.temperature).toBe(2);
    expect(sent.max_tokens).toBe(2_000);
    expect(sent.model).toBe("gpt-4o-mini");
    expect(sent.response_format).toEqual({ type: "json_object" });
  });

  it("honors LLM_BASE_URL and OPENAI_MODEL overrides", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ choices: [] }));

    await chatCore(
      { messages: [{ role: "user", content: "hi" }] },
      { ...ENV, LLM_BASE_URL: "https://llm.example.com/v1/", OPENAI_MODEL: "custom-model" }
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://llm.example.com/v1/chat/completions");
    expect(JSON.parse(init.body).model).toBe("custom-model");
  });

  describe("per-language model routing", () => {
    const MESSAGES = [{ role: "user", content: "hi" }];

    it("routes to the per-language base URL when its env var is set (trailing slash stripped)", async () => {
      const fetchMock = stubFetch(async () => jsonResponse({ choices: [] }));

      await chatCore(
        { messages: MESSAGES, language: "yue-HK" },
        {
          ...ENV,
          LLM_BASE_URL: "https://global.example.com/v1",
          LLM_BASE_URL_YUE_HK: "https://yue.example.com/v1/",
        }
      );

      expect(fetchMock.mock.calls[0][0]).toBe("https://yue.example.com/v1/chat/completions");
    });

    it("falls back to the global LLM_BASE_URL when no per-language var is set", async () => {
      const fetchMock = stubFetch(async () => jsonResponse({ choices: [] }));

      await chatCore(
        { messages: MESSAGES, language: "yue-HK" },
        { ...ENV, LLM_BASE_URL: "https://global.example.com/v1" }
      );

      expect(fetchMock.mock.calls[0][0]).toBe("https://global.example.com/v1/chat/completions");
    });

    it("falls back to the OpenAI default when neither base URL is set", async () => {
      const fetchMock = stubFetch(async () => jsonResponse({ choices: [] }));

      await chatCore({ messages: MESSAGES, language: "yue-HK" }, ENV);

      expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/chat/completions");
    });

    it("ignores an unknown language and keeps global routing (no rejection)", async () => {
      const fetchMock = stubFetch(async () => jsonResponse({ choices: [{ message: { content: "ok" } }] }));

      const result = await chatCore(
        { messages: MESSAGES, language: "xx-XX" },
        {
          ...ENV,
          LLM_BASE_URL: "https://global.example.com/v1",
          LLM_BASE_URL_YUE_HK: "https://yue.example.com/v1",
        }
      );

      expect(result.status).toBe(200);
      expect(fetchMock.mock.calls[0][0]).toBe("https://global.example.com/v1/chat/completions");
    });

    it("ignores a non-string language field", async () => {
      const fetchMock = stubFetch(async () => jsonResponse({ choices: [{ message: { content: "ok" } }] }));

      const result = await chatCore({ messages: MESSAGES, language: 42 }, ENV);

      expect(result.status).toBe(200);
      expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/chat/completions");
    });
  });

  it("returns 502 when the upstream responds with an error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch(async () => jsonResponse({ error: "boom" }, { ok: false, status: 500 }));

    const result = await chatCore({ messages: [{ role: "user", content: "hi" }] }, ENV);

    expect(result.status).toBe(502);
    expect(result.body).toEqual({ error: "Translation request failed" });
  });

  it("returns 504 when the upstream request times out", async () => {
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    stubFetch(async () => {
      throw abortErr;
    });

    const result = await chatCore({ messages: [{ role: "user", content: "hi" }] }, ENV);

    expect(result.status).toBe(504);
    expect(result.body).toEqual({ error: "Translation request timed out" });
  });
});

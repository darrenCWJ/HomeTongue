import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "crypto";
import { ttsCore } from "./ttsCore.js";

// Real RSA key so the core's JWT signing works without mocking crypto.
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});

// The token cache inside ttsCore is keyed by client_email and persists for
// the lifetime of the module, so each test that reaches the token exchange
// uses a distinct email to stay isolated.
function saEnv(clientEmail) {
  return {
    GOOGLE_API_JSON: JSON.stringify({ private_key: privateKey, client_email: clientEmail }),
  };
}

const VALID_BODY = { text: "你好", voiceName: "yue-HK-Chirp3-HD-Zephyr", languageCode: "yue-HK" };

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => data, text: async () => JSON.stringify(data) };
}

function stubGoogleFetch({ token = "tok-1", audioContent = "bXAz" } = {}) {
  const mock = vi.fn(async (url) => {
    if (String(url).includes("oauth2.googleapis.com")) {
      return jsonResponse({ access_token: token, expires_in: 3600 });
    }
    return jsonResponse({ audioContent });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ttsCore", () => {
  it("returns 500 when GOOGLE_API_JSON is not configured", async () => {
    const result = await ttsCore(VALID_BODY, {});

    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "TTS is not configured on the server" });
  });

  it("returns 500 when the service-account JSON is invalid", async () => {
    const result = await ttsCore(VALID_BODY, { GOOGLE_API_JSON: "not-json" });

    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "TTS server configuration is invalid" });
  });

  it("returns 400 when required fields are missing", async () => {
    const result = await ttsCore({ text: "你好" }, saEnv("svc-validate@test.iam"));

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Missing required fields: text, voiceName, languageCode" });
  });

  it("returns 400 when text exceeds the 500 character cap", async () => {
    const result = await ttsCore({ ...VALID_BODY, text: "好".repeat(501) }, saEnv("svc-validate@test.iam"));

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Text exceeds 500 character limit" });
  });

  it("returns 400 for a language code outside the allowlist", async () => {
    const result = await ttsCore({ ...VALID_BODY, languageCode: "en-US" }, saEnv("svc-validate@test.iam"));

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Unsupported language code" });
  });

  it("returns 400 for a voice name outside the allowed pattern", async () => {
    const result = await ttsCore(
      { ...VALID_BODY, voiceName: "en-US-Neural2-A" },
      saEnv("svc-validate@test.iam")
    );

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Unsupported voice" });
  });

  it("returns 200 with audioContent on the happy path", async () => {
    const fetchMock = stubGoogleFetch({ audioContent: "bXAz" });

    const result = await ttsCore(VALID_BODY, saEnv("svc-happy@test.iam"));

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ audioContent: "bXAz" });
    // token exchange + synthesis
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caches the access token across calls for the same service account", async () => {
    const fetchMock = stubGoogleFetch();

    await ttsCore(VALID_BODY, saEnv("svc-cache@test.iam"));
    await ttsCore(VALID_BODY, saEnv("svc-cache@test.iam"));

    const tokenCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("oauth2.googleapis.com"));
    const synthCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("texttospeech.googleapis.com")
    );
    expect(tokenCalls).toHaveLength(1);
    expect(synthCalls).toHaveLength(2);
  });

  it("returns 502 when synthesis fails upstream", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const mock = vi.fn(async (url) => {
      if (String(url).includes("oauth2.googleapis.com")) {
        return jsonResponse({ access_token: "tok", expires_in: 3600 });
      }
      return jsonResponse({ error: "boom" }, { ok: false, status: 500 });
    });
    vi.stubGlobal("fetch", mock);

    const result = await ttsCore(VALID_BODY, saEnv("svc-synth-fail@test.iam"));

    expect(result.status).toBe(502);
    expect(result.body).toEqual({ error: "Speech synthesis failed" });
  });

  it("returns 504 when the token exchange times out", async () => {
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    const mock = vi.fn(async () => {
      throw abortErr;
    });
    vi.stubGlobal("fetch", mock);

    const result = await ttsCore(VALID_BODY, saEnv("svc-timeout@test.iam"));

    expect(result.status).toBe(504);
    expect(result.body).toEqual({ error: "Speech synthesis timed out" });
  });
});

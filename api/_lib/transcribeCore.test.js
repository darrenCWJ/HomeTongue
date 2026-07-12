import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeCore } from "./transcribeCore.js";

const ENV = { OPENAI_API_KEY: "test-key" };
const VALID_AUDIO = Buffer.from("hello wav bytes").toString("base64");

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

describe("transcribeCore", () => {
  it("returns 503 when neither an API key nor STT_BASE_URL is configured", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({}));

    const result = await transcribeCore({ audio: VALID_AUDIO }, {});

    expect(result.status).toBe(503);
    expect(result.body).toEqual({ error: "Transcription service is not configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 when audio is missing", async () => {
    stubFetch(async () => jsonResponse({}));

    const result = await transcribeCore({}, ENV);

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Missing required field: audio (base64)" });
  });

  it("returns 400 for a model outside the allowlist", async () => {
    stubFetch(async () => jsonResponse({}));

    const result = await transcribeCore({ audio: VALID_AUDIO, model: "gpt-5-audio" }, ENV);

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Unsupported model" });
  });

  it("returns 400 for a language outside the allowlist", async () => {
    stubFetch(async () => jsonResponse({}));

    const result = await transcribeCore({ audio: VALID_AUDIO, language: "fr" }, ENV);

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Unsupported language" });
  });

  it("returns 400 for a prompt over 500 characters", async () => {
    stubFetch(async () => jsonResponse({}));

    const result = await transcribeCore({ audio: VALID_AUDIO, prompt: "p".repeat(501) }, ENV);

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Invalid prompt" });
  });

  it("returns 400 when the base64 decodes to zero bytes", async () => {
    stubFetch(async () => jsonResponse({}));

    const result = await transcribeCore({ audio: "!!!!" }, ENV);

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Audio must be between 1 byte and 4MB" });
  });

  it("returns 400 when the decoded audio exceeds the size cap", async () => {
    stubFetch(async () => jsonResponse({}));
    // 4,473,928 base64 chars decode to ~3.36MB, just over the 3.2MB cap.
    const oversized = "A".repeat(4_473_928);

    const result = await transcribeCore({ audio: oversized }, ENV);

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Audio must be between 1 byte and 4MB" });
  });

  it("returns 200 with trimmed text on the OpenAI path", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ text: "  你好  " }));

    const result = await transcribeCore({ audio: VALID_AUDIO, language: "zh" }, ENV);

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ text: "你好" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(init.headers.Authorization).toBe("Bearer test-key");
  });

  it("forwards JSON to a custom STT provider when STT_BASE_URL is set", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ text: "hi" }));

    const result = await transcribeCore(
      { audio: VALID_AUDIO, language: "en", prompt: "greeting" },
      { STT_BASE_URL: "https://stt.example.com/transcribe", STT_API_KEY: "stt-key" }
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ text: "hi" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://stt.example.com/transcribe");
    expect(init.headers.Authorization).toBe("Bearer stt-key");
    expect(JSON.parse(init.body)).toEqual({ audio: VALID_AUDIO, language: "en", prompt: "greeting" });
  });

  describe("per-language model routing", () => {
    it("routes a pack languageCode to its per-language STT base URL and maps the hint", async () => {
      const fetchMock = stubFetch(async () => jsonResponse({ text: "hi" }));

      const result = await transcribeCore(
        { audio: VALID_AUDIO, language: "yue-HK" },
        {
          STT_BASE_URL: "https://global-stt.example.com/transcribe",
          STT_BASE_URL_YUE_HK: "https://yue-stt.example.com/transcribe",
        }
      );

      expect(result.status).toBe(200);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://yue-stt.example.com/transcribe");
      // The hint forwarded upstream is the pack's primary STT language.
      expect(JSON.parse(init.body)).toEqual({ audio: VALID_AUDIO, language: "zh", prompt: null });
    });

    it("falls back to the global STT_BASE_URL when no per-language var is set", async () => {
      const fetchMock = stubFetch(async () => jsonResponse({ text: "hi" }));

      const result = await transcribeCore(
        { audio: VALID_AUDIO, language: "yue-HK" },
        { STT_BASE_URL: "https://global-stt.example.com/transcribe" }
      );

      expect(result.status).toBe(200);
      expect(fetchMock.mock.calls[0][0]).toBe("https://global-stt.example.com/transcribe");
    });

    it("falls back to OpenAI for a pack languageCode when no base URL is set", async () => {
      const fetchMock = stubFetch(async () => jsonResponse({ text: "ok" }));

      const result = await transcribeCore({ audio: VALID_AUDIO, language: "yue-HK" }, ENV);

      expect(result.status).toBe(200);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
      expect(init.body.get("language")).toBe("zh");
    });

    it("keeps plain STT hints on global routing (per-language vars do not apply)", async () => {
      const fetchMock = stubFetch(async () => jsonResponse({ text: "ok" }));

      const result = await transcribeCore(
        { audio: VALID_AUDIO, language: "zh" },
        { ...ENV, STT_BASE_URL_YUE_HK: "https://yue-stt.example.com/transcribe" }
      );

      expect(result.status).toBe(200);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
      expect(init.body.get("language")).toBe("zh");
    });

    it("treats a per-language STT base URL as configuration for that language (no 503)", async () => {
      const fetchMock = stubFetch(async () => jsonResponse({ text: "hi" }));

      const result = await transcribeCore(
        { audio: VALID_AUDIO, language: "yue-HK" },
        { STT_BASE_URL_YUE_HK: "https://yue-stt.example.com/transcribe" }
      );

      expect(result.status).toBe(200);
      expect(fetchMock.mock.calls[0][0]).toBe("https://yue-stt.example.com/transcribe");
    });

    it("still returns 503 for hint-only requests when only a per-language URL is configured", async () => {
      const fetchMock = stubFetch(async () => jsonResponse({}));

      const result = await transcribeCore(
        { audio: VALID_AUDIO, language: "en" },
        { STT_BASE_URL_YUE_HK: "https://yue-stt.example.com/transcribe" }
      );

      expect(result.status).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns 400 when a pack has no STT support yet", async () => {
      vi.resetModules();
      vi.doMock("./languageManifest.js", async () => {
        const actual = await vi.importActual("./languageManifest.js");
        const noSttEntry = {
          languageCode: "zz-ZZ",
          sttLanguages: [],
          ttsVoicePattern: /^$/,
          envSuffix: "ZZ_ZZ",
        };
        return {
          ...actual,
          findManifestEntry: (code) => (code === "zz-ZZ" ? noSttEntry : actual.findManifestEntry(code)),
        };
      });
      try {
        const { transcribeCore: mockedCore } = await import("./transcribeCore.js");
        const fetchMock = stubFetch(async () => jsonResponse({ text: "hi" }));

        const result = await mockedCore({ audio: VALID_AUDIO, language: "zz-ZZ" }, ENV);

        expect(result.status).toBe(400);
        expect(result.body).toEqual({
          error: "Speech recognition is not available for this language yet",
        });
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        vi.doUnmock("./languageManifest.js");
        vi.resetModules();
      }
    });
  });

  it("returns 502 when the upstream responds with an error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch(async () => jsonResponse({ error: "boom" }, { ok: false, status: 500 }));

    const result = await transcribeCore({ audio: VALID_AUDIO }, ENV);

    expect(result.status).toBe(502);
    expect(result.body).toEqual({ error: "Transcription failed" });
  });

  it("returns 504 when the upstream request times out", async () => {
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    stubFetch(async () => {
      throw abortErr;
    });

    const result = await transcribeCore({ audio: VALID_AUDIO }, ENV);

    expect(result.status).toBe(504);
    expect(result.body).toEqual({ error: "Transcription timed out" });
  });
});

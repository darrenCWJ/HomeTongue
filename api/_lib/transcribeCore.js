// Shared handler core for /api/transcribe. Used by api/transcribe.js (Vercel)
// and the vite.config.ts dev middleware so dev and production run identical
// logic: validation, allowlists, size caps, upstream call, and error mapping.
// Rate limiting stays in the production adapter (api/transcribe.js).
//
// Files under api/_lib are not exposed as routes by Vercel.

import { fetchWithTimeout, UpstreamTimeoutError } from "./fetchWithTimeout.js";
import { ALLOWED_STT_LANGUAGES } from "./languageManifest.js";

const OPENAI_URL = "https://api.openai.com/v1/audio/transcriptions";

// Decoded-audio cap. The base64 JSON body is ~33% larger than this, and must
// stay under Vercel's 4.5MB platform body limit: 3.2MB raw → ~4.3MB body.
// The client resamples to 16kHz mono WAV and pre-checks size (translationService).
const MAX_AUDIO_BYTES = 3.2 * 1024 * 1024;
const ALLOWED_MODELS = new Set(["gpt-4o-transcribe", "gpt-4o-mini-transcribe", "whisper-1"]);
const MAX_PROMPT_CHARS = 500;
const UPSTREAM_TIMEOUT_MS = 20_000;

/**
 * Pure request core: no req/res, no rate limiting, no process.env.
 *
 * @param {unknown} body parsed JSON request body
 * @param {Record<string, string | undefined>} env reads OPENAI_API_KEY,
 *   VITE_OPENAI_API_KEY, STT_BASE_URL, STT_API_KEY
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
export async function transcribeCore(body, env) {
  const apiKey = env.OPENAI_API_KEY ?? env.VITE_OPENAI_API_KEY;
  // Custom STT provider switch (docs/ML_TRAINING_PLAN.md step 2): when
  // STT_BASE_URL is set (e.g. a Modal endpoint serving fine-tuned Whisper),
  // forward the JSON payload there and expect { text } back. Defaults to OpenAI.
  const customSttUrl = env.STT_BASE_URL;
  if (!apiKey && !customSttUrl) {
    // 503 is a contract: src/services/translationService.ts uses it to
    // trigger the offline mock fallback. Do not change the status code.
    return { status: 503, body: { error: "Transcription service is not configured" } };
  }

  const { audio, model, language, prompt } = body ?? {};
  if (typeof audio !== "string" || audio.length === 0) {
    return { status: 400, body: { error: "Missing required field: audio (base64)" } };
  }
  if (model !== undefined && !ALLOWED_MODELS.has(model)) {
    return { status: 400, body: { error: "Unsupported model" } };
  }
  if (language !== undefined && language !== null && !ALLOWED_STT_LANGUAGES.has(language)) {
    return { status: 400, body: { error: "Unsupported language" } };
  }
  if (prompt !== undefined && (typeof prompt !== "string" || prompt.length > MAX_PROMPT_CHARS)) {
    return { status: 400, body: { error: "Invalid prompt" } };
  }

  let audioBuffer;
  try {
    audioBuffer = Buffer.from(audio, "base64");
  } catch {
    return { status: 400, body: { error: "audio must be valid base64" } };
  }
  if (audioBuffer.length === 0 || audioBuffer.length > MAX_AUDIO_BYTES) {
    return { status: 400, body: { error: "Audio must be between 1 byte and 4MB" } };
  }

  let upstream;
  try {
    if (customSttUrl) {
      upstream = await fetchWithTimeout(
        customSttUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(env.STT_API_KEY ? { Authorization: `Bearer ${env.STT_API_KEY}` } : {}),
          },
          body: JSON.stringify({ audio, language: language ?? null, prompt: prompt ?? null }),
        },
        UPSTREAM_TIMEOUT_MS
      );
    } else {
      const formData = new FormData();
      formData.append("file", new Blob([audioBuffer], { type: "audio/wav" }), "recording.wav");
      formData.append("model", model ?? "gpt-4o-transcribe");
      if (language) formData.append("language", language);
      if (prompt) formData.append("prompt", prompt);
      upstream = await fetchWithTimeout(
        OPENAI_URL,
        { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: formData },
        UPSTREAM_TIMEOUT_MS
      );
    }
  } catch (err) {
    if (err instanceof UpstreamTimeoutError) {
      return { status: 504, body: { error: "Transcription timed out" } };
    }
    throw err;
  }

  if (!upstream.ok) {
    console.error("[api/transcribe] upstream error:", upstream.status, await upstream.text());
    return { status: 502, body: { error: "Transcription failed" } };
  }

  const data = await upstream.json();
  return { status: 200, body: { text: typeof data.text === "string" ? data.text.trim() : "" } };
}

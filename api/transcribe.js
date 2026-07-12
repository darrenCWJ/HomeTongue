import { isRateLimited, requestIp } from "./_lib/rateLimit.js";

const OPENAI_URL = "https://api.openai.com/v1/audio/transcriptions";

// Decoded-audio cap. The base64 JSON body is ~33% larger than this, and must
// stay under Vercel's 4.5MB platform body limit: 3.2MB raw → ~4.3MB body.
// The client resamples to 16kHz mono WAV and pre-checks size (translationService).
const MAX_AUDIO_BYTES = 3.2 * 1024 * 1024;
const ALLOWED_MODELS = new Set(["gpt-4o-transcribe", "gpt-4o-mini-transcribe", "whisper-1"]);
const ALLOWED_LANGUAGES = new Set(["en", "zh"]);
const MAX_PROMPT_CHARS = 500;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

export const config = {
  api: {
    bodyParser: { sizeLimit: "6mb" },
  },
};

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (await isRateLimited("transcribe", requestIp(req), RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS)) {
      return res.status(429).json({ error: "Too many requests. Try again shortly." });
    }

    const apiKey = process.env.OPENAI_API_KEY ?? process.env.VITE_OPENAI_API_KEY;
    if (!apiKey && !process.env.STT_BASE_URL) {
      return res.status(503).json({ error: "Transcription service is not configured" });
    }

    const { audio, model, language, prompt } = req.body || {};
    if (typeof audio !== "string" || audio.length === 0) {
      return res.status(400).json({ error: "Missing required field: audio (base64)" });
    }
    if (model !== undefined && !ALLOWED_MODELS.has(model)) {
      return res.status(400).json({ error: "Unsupported model" });
    }
    if (language !== undefined && language !== null && !ALLOWED_LANGUAGES.has(language)) {
      return res.status(400).json({ error: "Unsupported language" });
    }
    if (prompt !== undefined && (typeof prompt !== "string" || prompt.length > MAX_PROMPT_CHARS)) {
      return res.status(400).json({ error: "Invalid prompt" });
    }

    let audioBuffer;
    try {
      audioBuffer = Buffer.from(audio, "base64");
    } catch {
      return res.status(400).json({ error: "audio must be valid base64" });
    }
    if (audioBuffer.length === 0 || audioBuffer.length > MAX_AUDIO_BYTES) {
      return res.status(400).json({ error: "Audio must be between 1 byte and 4MB" });
    }

    // Custom STT provider switch (docs/ML_TRAINING_PLAN.md step 2): when
    // STT_BASE_URL is set (e.g. a Modal endpoint serving fine-tuned Whisper),
    // forward the JSON payload there and expect { text } back. Defaults to OpenAI.
    const customSttUrl = process.env.STT_BASE_URL;
    let upstream;
    if (customSttUrl) {
      upstream = await fetch(customSttUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.STT_API_KEY ? { Authorization: `Bearer ${process.env.STT_API_KEY}` } : {}),
        },
        body: JSON.stringify({ audio, language: language ?? null, prompt: prompt ?? null }),
      });
    } else {
      const formData = new FormData();
      formData.append("file", new Blob([audioBuffer], { type: "audio/wav" }), "recording.wav");
      formData.append("model", model ?? "gpt-4o-transcribe");
      if (language) formData.append("language", language);
      if (prompt) formData.append("prompt", prompt);
      upstream = await fetch(OPENAI_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      });
    }

    if (!upstream.ok) {
      console.error("[api/transcribe] upstream error:", upstream.status, await upstream.text());
      return res.status(502).json({ error: "Transcription failed" });
    }

    const data = await upstream.json();
    return res.status(200).json({ text: typeof data.text === "string" ? data.text.trim() : "" });
  } catch (err) {
    console.error("[api/transcribe] error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

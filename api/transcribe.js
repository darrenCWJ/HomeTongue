const OPENAI_URL = "https://api.openai.com/v1/audio/transcriptions";

// ~4MB decoded audio (Vercel request body limit is 4.5MB)
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const ALLOWED_MODELS = new Set(["gpt-4o-transcribe", "gpt-4o-mini-transcribe", "whisper-1"]);
const ALLOWED_LANGUAGES = new Set(["en", "zh"]);
const MAX_PROMPT_CHARS = 500;

// Best-effort per-instance rate limiting (resets on cold start).
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const requestLog = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestLog.set(ip, timestamps);
    return true;
  }
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return false;
}

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

    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ?? req.socket?.remoteAddress ?? "unknown";
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: "Too many requests. Try again shortly." });
    }

    const apiKey = process.env.OPENAI_API_KEY ?? process.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
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

    const formData = new FormData();
    formData.append("file", new Blob([audioBuffer], { type: "audio/wav" }), "recording.wav");
    formData.append("model", model ?? "gpt-4o-transcribe");
    if (language) formData.append("language", language);
    if (prompt) formData.append("prompt", prompt);

    const upstream = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

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

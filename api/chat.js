import { isRateLimited, requestIp } from "./_lib/rateLimit.js";

// Model-provider switch (docs/ML_TRAINING_PLAN.md): point LLM_BASE_URL at any
// OpenAI-compatible endpoint (vLLM on Modal, Together, etc.) to serve a
// custom fine-tuned model. Defaults to OpenAI; the client never changes.
const LLM_BASE_URL = (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
const CHAT_URL = `${LLM_BASE_URL}/chat/completions`;

const MAX_TOTAL_CHARS = 24_000;
const MAX_TOKENS_CAP = 2_000;
const DEFAULT_MODEL = "gpt-4o-mini";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (await isRateLimited("chat", requestIp(req), RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS)) {
      return res.status(429).json({ error: "Too many requests. Try again shortly." });
    }

    const apiKey = process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "Translation service is not configured" });
    }

    const { messages, temperature, max_tokens, response_format } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) {
      return res.status(400).json({ error: "messages must be a non-empty array (max 20)" });
    }
    let totalChars = 0;
    for (const m of messages) {
      if (
        !m ||
        (m.role !== "system" && m.role !== "user" && m.role !== "assistant") ||
        typeof m.content !== "string"
      ) {
        return res.status(400).json({ error: "Each message needs a valid role and string content" });
      }
      totalChars += m.content.length;
    }
    if (totalChars > MAX_TOTAL_CHARS) {
      return res.status(400).json({ error: "Request too large" });
    }

    const model = process.env.OPENAI_MODEL ?? process.env.VITE_OPENAI_MODEL ?? DEFAULT_MODEL;

    const upstream = await fetch(CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        temperature: typeof temperature === "number" ? Math.min(Math.max(temperature, 0), 2) : 0.3,
        max_tokens: typeof max_tokens === "number" ? Math.min(max_tokens, MAX_TOKENS_CAP) : 1_000,
        ...(response_format?.type === "json_object" ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!upstream.ok) {
      console.error("[api/chat] upstream error:", upstream.status, await upstream.text());
      return res.status(502).json({ error: "Translation request failed" });
    }

    const data = await upstream.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    return res.status(200).json({ content });
  } catch (err) {
    console.error("[api/chat] error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

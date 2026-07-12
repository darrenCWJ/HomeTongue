// Shared handler core for /api/chat. Used by api/chat.js (Vercel) and the
// vite.config.ts dev middleware so dev and production run identical logic:
// validation, size caps, model resolution, upstream call, and error mapping.
// Rate limiting stays in the production adapter (api/chat.js).
//
// Files under api/_lib are not exposed as routes by Vercel.

import { fetchWithTimeout, UpstreamTimeoutError } from "./fetchWithTimeout.js";

// Model-provider switch (docs/ML_TRAINING_PLAN.md): point LLM_BASE_URL at any
// OpenAI-compatible endpoint (vLLM on Modal, Together, etc.) to serve a
// custom fine-tuned model. Defaults to OpenAI; the client never changes.
const DEFAULT_LLM_BASE_URL = "https://api.openai.com/v1";

const MAX_TOTAL_CHARS = 24_000;
const MAX_TOKENS_CAP = 2_000;
const DEFAULT_MODEL = "gpt-4o-mini";
const UPSTREAM_TIMEOUT_MS = 20_000;

/**
 * Pure request core: no req/res, no rate limiting, no process.env.
 *
 * @param {unknown} body parsed JSON request body
 * @param {Record<string, string | undefined>} env reads LLM_API_KEY,
 *   OPENAI_API_KEY, VITE_OPENAI_API_KEY, LLM_BASE_URL, OPENAI_MODEL,
 *   VITE_OPENAI_MODEL
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
export async function chatCore(body, env) {
  const apiKey = env.LLM_API_KEY ?? env.OPENAI_API_KEY ?? env.VITE_OPENAI_API_KEY;
  if (!apiKey) {
    // 503 is a contract: src/services/translationService.ts uses it to
    // trigger the offline mock fallback. Do not change the status code.
    return { status: 503, body: { error: "Translation service is not configured" } };
  }

  const { messages, temperature, max_tokens, response_format } = body ?? {};
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) {
    return { status: 400, body: { error: "messages must be a non-empty array (max 20)" } };
  }
  let totalChars = 0;
  for (const m of messages) {
    if (
      !m ||
      (m.role !== "system" && m.role !== "user" && m.role !== "assistant") ||
      typeof m.content !== "string"
    ) {
      return { status: 400, body: { error: "Each message needs a valid role and string content" } };
    }
    totalChars += m.content.length;
  }
  if (totalChars > MAX_TOTAL_CHARS) {
    return { status: 400, body: { error: "Request too large" } };
  }

  const llmBaseUrl = (env.LLM_BASE_URL ?? DEFAULT_LLM_BASE_URL).replace(/\/$/, "");
  const model = env.OPENAI_MODEL ?? env.VITE_OPENAI_MODEL ?? DEFAULT_MODEL;

  let upstream;
  try {
    upstream = await fetchWithTimeout(
      `${llmBaseUrl}/chat/completions`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          temperature: typeof temperature === "number" ? Math.min(Math.max(temperature, 0), 2) : 0.3,
          max_tokens: typeof max_tokens === "number" ? Math.min(max_tokens, MAX_TOKENS_CAP) : 1_000,
          ...(response_format?.type === "json_object" ? { response_format: { type: "json_object" } } : {}),
        }),
      },
      UPSTREAM_TIMEOUT_MS
    );
  } catch (err) {
    if (err instanceof UpstreamTimeoutError) {
      return { status: 504, body: { error: "Translation request timed out" } };
    }
    throw err;
  }

  if (!upstream.ok) {
    console.error("[api/chat] upstream error:", upstream.status, await upstream.text());
    return { status: 502, body: { error: "Translation request failed" } };
  }

  const data = await upstream.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  return { status: 200, body: { content } };
}

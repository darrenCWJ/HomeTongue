// Thin Vercel adapter: parse request, rate limit, delegate to the shared
// core (api/_lib/chatCore.js) that the vite dev middleware also runs.

import { isRateLimited, requestIp } from "./_lib/rateLimit.js";
import { chatCore } from "./_lib/chatCore.js";
import { applyCors } from "./_lib/cors.js";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;

export default async function handler(req, res) {
  try {
    if (applyCors(req, res)) return;
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (await isRateLimited("chat", requestIp(req), RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS)) {
      return res.status(429).json({ error: "Too many requests. Try again shortly." });
    }

    const result = await chatCore(req.body, process.env);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("[api/chat] error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

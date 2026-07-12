// Thin Vercel adapter: parse request, rate limit, delegate to the shared
// core (api/_lib/transcribeCore.js) that the vite dev middleware also runs.

import { isRateLimited, requestIp } from "./_lib/rateLimit.js";
import { transcribeCore } from "./_lib/transcribeCore.js";

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

    const result = await transcribeCore(req.body, process.env);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("[api/transcribe] error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

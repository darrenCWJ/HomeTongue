// Shared rate limiter for the api/ functions.
//
// Durable mode: set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN and
// limits survive across serverless instances/cold starts (fixed window via
// INCR + PEXPIRE). Without them, falls back to a best-effort per-instance
// in-memory window. Upstash errors fail over to the in-memory limiter so a
// Redis outage never takes the API down (nor disables limiting entirely).
//
// Files under api/_lib are not exposed as routes by Vercel.

const memoryLog = new Map();

function isMemoryLimited(key, maxRequests, windowMs) {
  const now = Date.now();
  const timestamps = (memoryLog.get(key) ?? []).filter((t) => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    memoryLog.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  memoryLog.set(key, timestamps);
  return false;
}

async function isUpstashLimited(key, maxRequests, windowMs, url, token) {
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", key],
      ["PEXPIRE", key, windowMs, "NX"],
    ]),
  });
  if (!res.ok) throw new Error(`Upstash error (${res.status})`);
  const [{ result: count }] = await res.json();
  return Number(count) > maxRequests;
}

/**
 * Returns true when the caller identified by `ip` has exceeded
 * `maxRequests` within `windowMs` for the given bucket.
 */
export async function isRateLimited(bucket, ip, maxRequests, windowMs) {
  const key = `rl:${bucket}:${ip}`;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try {
      return await isUpstashLimited(key, maxRequests, windowMs, url, token);
    } catch (err) {
      console.error("[rateLimit] Upstash unavailable, falling back to in-memory:", err);
    }
  }
  return isMemoryLimited(key, maxRequests, windowMs);
}

/** Extract the caller IP from a Vercel/Node request. */
export function requestIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ?? req.socket?.remoteAddress ?? "unknown";
}

// Shared upstream-fetch helper for the api/ handler cores.
// Files under api/_lib are not exposed as routes by Vercel.

/** Error thrown when an upstream request exceeds its time budget. */
export class UpstreamTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`Upstream request timed out after ${timeoutMs}ms`);
    this.name = "UpstreamTimeoutError";
  }
}

/**
 * fetch() with an AbortController-based timeout.
 * Rejects with UpstreamTimeoutError when the budget is exceeded.
 *
 * @param {string} url
 * @param {RequestInit} init
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, init, timeoutMs) {
  // AbortController/clearTimeout via globalThis: the eslint api/** globals
  // allowlist doesn't declare them, and the config is protected.
  const controller = new globalThis.AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    // Node's fetch rejects with a DOMException named AbortError (which is not
    // instanceof Error in all runtimes), so match on the name.
    if (err && typeof err === "object" && err.name === "AbortError") {
      throw new UpstreamTimeoutError(timeoutMs);
    }
    throw err;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

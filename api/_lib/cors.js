// CORS for the Capacitor native builds only. The web app calls /api/* from
// its own origin and never needs CORS; native webviews have a fixed local
// origin, so their preflights would otherwise fail against these functions.
// Origins outside this allowlist get no CORS headers — a drive-by web page
// cannot call the API from a browser and burn quota. Non-browser clients
// ignore CORS entirely, so this is not an auth boundary; rate limiting and
// input validation in the cores still apply to every request.

const ALLOWED_ORIGINS = new Set([
  "capacitor://localhost", // iOS webview
  "https://localhost", // Android webview (Capacitor default androidScheme "https")
  "http://localhost", // Android webview when androidScheme is "http"
]);

/**
 * Reflect CORS headers for allowlisted native-app origins and short-circuit
 * OPTIONS preflights.
 *
 * @param {{ method?: string, headers?: Record<string, string | string[] | undefined> }} req
 * @param {{ setHeader: (name: string, value: string) => void, status: (code: number) => { end: () => void } }} res
 * @returns {boolean} true when the request was a preflight and has been fully
 *   handled — the caller must return immediately without touching `res` again.
 */
export function applyCors(req, res) {
  // Responses differ by Origin (header present or not), so caches must key on it.
  res.setHeader("Vary", "Origin");

  const origin = req.headers?.origin;
  if (typeof origin === "string" && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
    res.status(204).end();
    return true;
  }

  return false;
}

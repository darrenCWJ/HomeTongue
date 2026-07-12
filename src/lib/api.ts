/**
 * Base URL for the app's own API endpoints (/api/*).
 *
 * - Web (Vercel or `pnpm dev`): leave VITE_API_BASE_URL unset — relative
 *   paths hit the same origin (Vercel functions in prod, Vite middleware in dev).
 * - Capacitor native builds: the webview has no origin, so set
 *   VITE_API_BASE_URL to the deployed web origin (e.g. https://hometongue.vercel.app).
 */
const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "").replace(/\/$/, "");

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Status used on ApiError when a request is aborted by the client-side timeout. */
export const TIMEOUT_STATUS = 408;

const DEFAULT_TIMEOUT_MS = 20_000;

export interface PostJsonOptions {
  /** Abort the request after this many milliseconds (default 20 000). */
  timeoutMs?: number;
}

export async function postJson<T>(path: string, body: unknown, options: PostJsonOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new ApiError(
        "The request took too long and was cancelled. Please check your connection and try again.",
        TIMEOUT_STATUS
      );
    }
    throw new ApiError(`Request to ${path} failed: ${e instanceof Error ? e.message : String(e)}`, 0);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let message = `Request to ${path} failed (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data?.error === "string") message = data.error;
    } catch {
      // non-JSON error body — keep generic message
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

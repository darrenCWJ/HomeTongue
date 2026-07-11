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

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new ApiError(
      `Request to ${path} failed: ${e instanceof Error ? e.message : String(e)}`,
      0
    );
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

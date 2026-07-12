/**
 * Shared helpers for parsing JSON out of LLM responses. Models sometimes
 * wrap their JSON output in markdown code fences despite instructions not
 * to, so every service that parses model output should go through here.
 */

/** Max characters of model output included in parse-failure logs. */
const LOG_SNIPPET_LENGTH = 200;

/** Strip markdown fences the model sometimes wraps around JSON output. */
export function parseModelJson<T>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(cleaned) as T;
}

/** Truncate model output to a log-safe snippet. */
export function truncateForLog(content: string, maxLength: number = LOG_SNIPPET_LENGTH): string {
  return content.length > maxLength ? `${content.slice(0, maxLength)}…` : content;
}

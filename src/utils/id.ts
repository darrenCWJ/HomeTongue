/**
 * Collision-safe ID generator. Prefer crypto.randomUUID (available in all
 * modern browsers and secure contexts); fall back to a timestamp+random
 * string for older webviews.
 */
export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

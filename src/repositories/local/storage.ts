export const STORAGE_KEYS = {
  PHRASES: "hometongue_phrases",
  SESSIONS: "hometongue_sessions",
  PROFILE: "hometongue_profile",
  LESSON_PROGRESS: "hometongue_lesson_progress",
} as const;

export function readStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function writeStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage quota exceeded or unavailable — silently skip
  }
}

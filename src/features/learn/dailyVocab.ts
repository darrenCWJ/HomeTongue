import { getLessonContent } from "../../data/lessons";
import type { VocabItem } from "../../types";

// Pre-multi-language cache key (implicitly yue-HK). Removed on first use of
// the scoped key so it does not linger in localStorage forever; worst case a
// user gets a fresh Word of the Day once after upgrading.
const LEGACY_DAILY_VOCAB_KEY = "hometongue_daily_vocab";

const dailyVocabKey = (languageCode: string) => `ht_daily_vocab_${languageCode}`;

/**
 * Deterministic-per-day random vocab pick, scoped per language so switching
 * languages yields that language's own Word of the Day. Returns null when the
 * language has no lesson vocabulary yet.
 */
export function getDailyVocab(languageCode: string): VocabItem | null {
  const allVocab = getLessonContent(languageCode).lessons.flatMap((l) => l.content.vocabulary);
  if (allVocab.length === 0) return null;

  const storageKey = dailyVocabKey(languageCode);
  const today = new Date().toISOString().slice(0, 10);
  try {
    localStorage.removeItem(LEGACY_DAILY_VOCAB_KEY);
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const { date, index } = JSON.parse(stored) as { date: string; index: number };
      if (date === today && index >= 0 && index < allVocab.length) {
        return allVocab[index];
      }
    }
  } catch {
    // ignore parse errors
  }
  const index = Math.floor(Math.random() * allVocab.length);
  try {
    localStorage.setItem(storageKey, JSON.stringify({ date: today, index }));
  } catch {
    // ignore storage errors
  }
  return allVocab[index];
}

import { LESSONS } from "../../data/lessons";
import type { VocabItem } from "../../types";

const DAILY_VOCAB_KEY = "hometongue_daily_vocab";

export function getDailyVocab(): VocabItem {
  const allVocab = LESSONS.flatMap((l) => l.content.vocabulary);
  const today = new Date().toISOString().slice(0, 10);
  try {
    const stored = localStorage.getItem(DAILY_VOCAB_KEY);
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
    localStorage.setItem(DAILY_VOCAB_KEY, JSON.stringify({ date: today, index }));
  } catch {
    // ignore storage errors
  }
  return allVocab[index];
}

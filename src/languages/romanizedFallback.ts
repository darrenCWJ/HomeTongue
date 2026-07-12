/**
 * Generic offline scoring fallback for romanized-script language packs
 * (Hokkien Tâi-lô, Teochew Peng'im, …) where the Han character-overlap
 * heuristic used by yue-HK is meaningless.
 *
 * Pure and network-free. Intended as (or inside) a pack's
 * `scoring.fallbackMatch` implementation:
 *
 *   scoring: { …, fallbackMatch: romanizedFallbackMatch }
 *
 * Pipeline: normalize (lowercase, strip diacritics via NFD, strip tone
 * digits and punctuation) → tokenize on whitespace/hyphens → token-level
 * Dice similarity scaled to 0–100.
 */

// After NFD, diacritics are standalone combining marks (\p{M}); stripping
// them makes matching insensitive to tone/vowel marks (â → a, ô → o, …).
const COMBINING_MARKS = /\p{M}+/gu;
const TONE_DIGITS = /\d+/g;
// After digit/diacritic stripping: keep letters, whitespace, and hyphens
// (hyphens are token separators); everything else becomes a space.
const NON_TOKEN_CHARS = /[^\p{L}\s-]+/gu;
const TOKEN_SEPARATORS = /[\s-]+/;

function normalizeRomanized(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(TONE_DIGITS, "")
    .replace(NON_TOKEN_CHARS, " ");
}

/**
 * Normalized syllable/word tokens of a romanized phrase. Exported for packs
 * that want to build stricter scorers on top of the same normalization.
 */
export function tokenizeRomanized(text: string): string[] {
  return normalizeRomanized(text)
    .split(TOKEN_SEPARATORS)
    .filter((token) => token.length > 0);
}

/**
 * Token-level Dice similarity between two romanized phrases, scaled to
 * 0–100. Multiset-aware (repeated tokens are only matched as often as they
 * occur on both sides) and order-insensitive. Returns 0 when either side
 * has no tokens after normalization.
 */
export function romanizedFallbackMatch(expected: string, actual: string): number {
  const expectedTokens = tokenizeRomanized(expected);
  const actualTokens = tokenizeRomanized(actual);
  if (expectedTokens.length === 0 || actualTokens.length === 0) return 0;

  // Multiset intersection: consume each matched token from a working pool so
  // repeats are not double-counted (same approach as yue-HK's char matcher).
  const pool = [...actualTokens];
  let shared = 0;
  for (const token of expectedTokens) {
    const i = pool.indexOf(token);
    if (i !== -1) {
      shared++;
      pool.splice(i, 1);
    }
  }

  const dice = (2 * shared) / (expectedTokens.length + actualTokens.length);
  return Math.round(dice * 100);
}

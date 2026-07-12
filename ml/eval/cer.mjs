// Character Error Rate with dialect-aware normalization, shared by the
// STT eval harness. Normalization mirrors the app's exam scorer: strip
// punctuation/whitespace, map Mandarin↔Cantonese equivalents, fold
// interchangeable sentence-final particles.

/** Build a char→char normalizer from the language pack's scoring data. */
export function createNormalizer({ charEquivalents, particleGroups }) {
  const particleMap = new Map();
  for (const group of particleGroups) {
    for (const ch of group) particleMap.set(ch, group[0]);
  }
  return (text) => {
    const chars = [];
    for (const ch of text) {
      if (/[\s\p{P}]/u.test(ch)) continue;
      const mapped = charEquivalents[ch] ?? ch;
      chars.push(particleMap.get(mapped) ?? mapped);
    }
    return chars;
  };
}

/** Levenshtein distance between two arrays of characters. */
export function editDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1) // substitution
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/**
 * CER of `hypothesis` against `reference` (0 = perfect; can exceed 1 when
 * the hypothesis is much longer than the reference). Returns null when the
 * normalized reference is empty (nothing to score).
 */
export function characterErrorRate(reference, hypothesis, normalize) {
  const ref = normalize(reference ?? "");
  const hyp = normalize(hypothesis ?? "");
  if (ref.length === 0) return null;
  return editDistance(ref, hyp) / ref.length;
}

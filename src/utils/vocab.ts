import type { Message, VocabItem } from "../types";

const hasTwoChinese = (s: string) => (s.match(/[一-鿿㐀-䶿]/g) ?? []).length >= 2;

export function extractVocabFromMessages(
  msgs: Message[],
  audioSource: "recorded" | "transcribed" = "transcribed"
): VocabItem[] {
  const items: VocabItem[] = [];
  const seen = new Set<string>();

  for (const msg of msgs) {
    if (msg.sender === "bot" && msg.text && msg.englishTranslation) {
      const dialect = msg.text.trim();
      if (hasTwoChinese(dialect) && !seen.has(dialect)) {
        seen.add(dialect);
        items.push({
          english: msg.englishTranslation,
          dialect,
          romanization: "",
          audioDataUrl: audioSource === "recorded" ? msg.audioDataUrls?.[0] : undefined,
        });
      }
    }
    if (msg.sender === "user" && msg.dialectText) {
      const dialect = msg.dialectText.trim();
      if (hasTwoChinese(dialect) && !seen.has(dialect)) {
        seen.add(dialect);
        items.push({
          english: msg.text,
          dialect,
          romanization: msg.pronunciation ?? "",
          audioDataUrl: msg.audioDataUrl,
        });
      }
    }
  }

  return items;
}

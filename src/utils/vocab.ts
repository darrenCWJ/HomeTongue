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
      const cantonese = msg.text.trim();
      if (hasTwoChinese(cantonese) && !seen.has(cantonese)) {
        seen.add(cantonese);
        items.push({
          english: msg.englishTranslation,
          cantonese,
          pronunciation: "",
          audioDataUrl: audioSource === "recorded" ? msg.audioDataUrls?.[0] : undefined,
        });
      }
    }
    if (msg.sender === "user" && msg.cantoneseText) {
      const cantonese = msg.cantoneseText.trim();
      if (hasTwoChinese(cantonese) && !seen.has(cantonese)) {
        seen.add(cantonese);
        items.push({
          english: msg.text,
          cantonese,
          pronunciation: msg.pronunciation ?? "",
          audioDataUrl: msg.audioDataUrl,
        });
      }
    }
  }

  return items;
}

import { describe, test, expect } from "vitest";
import { extractVocabFromMessages } from "./vocab";
import type { Message } from "../types";

const botMsg = (text: string, englishTranslation?: string, extra: Partial<Message> = {}): Message => ({
  id: text,
  sender: "bot",
  text,
  englishTranslation,
  ...extra,
});

const userMsg = (text: string, dialectText?: string, extra: Partial<Message> = {}): Message => ({
  id: text,
  sender: "user",
  text,
  dialectText,
  ...extra,
});

describe("extractVocabFromMessages", () => {
  test("extracts bot messages with an English translation", () => {
    const vocab = extractVocabFromMessages([botMsg("你好嗎", "How are you?")]);
    expect(vocab).toEqual([
      { english: "How are you?", cantonese: "你好嗎", pronunciation: "", audioDataUrl: undefined },
    ]);
  });

  test("skips bot messages without a translation", () => {
    expect(extractVocabFromMessages([botMsg("你好嗎")])).toEqual([]);
  });

  test("extracts user messages with dialectText and keeps pronunciation", () => {
    const vocab = extractVocabFromMessages([
      userMsg("I want tea", "我想飲茶", { pronunciation: "ngo5 soeng2 jam2 caa4" }),
    ]);
    expect(vocab).toEqual([
      {
        english: "I want tea",
        cantonese: "我想飲茶",
        pronunciation: "ngo5 soeng2 jam2 caa4",
        audioDataUrl: undefined,
      },
    ]);
  });

  test("requires at least two Chinese characters", () => {
    expect(extractVocabFromMessages([botMsg("好", "good")])).toEqual([]);
  });

  test("deduplicates repeated phrases", () => {
    const vocab = extractVocabFromMessages([
      botMsg("你好嗎", "How are you?"),
      userMsg("How are you?", "你好嗎"),
    ]);
    expect(vocab).toHaveLength(1);
  });

  test('uses recorded audio for bot messages only when audioSource is "recorded"', () => {
    const msgs = [botMsg("你好嗎", "How are you?", { audioDataUrls: ["data:audio/wav;base64,AAA"] })];
    expect(extractVocabFromMessages(msgs, "recorded")[0].audioDataUrl).toBe("data:audio/wav;base64,AAA");
    expect(extractVocabFromMessages(msgs, "transcribed")[0].audioDataUrl).toBeUndefined();
  });
});

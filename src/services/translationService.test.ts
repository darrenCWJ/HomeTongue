import { describe, test, expect } from "vitest";
import { charMatchScore, isPromptHallucination, parseModelJson } from "./translationService";

describe("charMatchScore", () => {
  test("returns 100 for an exact match", () => {
    expect(charMatchScore("你好嗎", "你好嗎")).toBe(100);
  });

  test("returns 0 when the answer has no Chinese characters", () => {
    expect(charMatchScore("你好嗎", "hello there")).toBe(0);
  });

  test("returns 0 when the expected phrase has no Chinese characters", () => {
    expect(charMatchScore("hello", "你好")).toBe(0);
  });

  test("scores partial overlap proportionally", () => {
    // 2 of 4 expected characters present
    expect(charMatchScore("我想食嘢", "我食飯啦")).toBe(50);
  });

  test("treats Mandarin↔Cantonese equivalents as matches", () => {
    // 是→係, 不→唔, 的→嘅 normalization
    expect(charMatchScore("係唔係", "是不是")).toBe(100);
  });

  test("treats interchangeable sentence-final particles as matches", () => {
    // 喇 normalizes to 啦 (same particle group)
    expect(charMatchScore("走啦", "走喇")).toBe(100);
  });

  test("does not double-count repeated characters in the answer", () => {
    // expected has two 好; answer has only one
    expect(charMatchScore("好好", "好")).toBe(50);
  });
});

describe("isPromptHallucination", () => {
  const PROMPT = "以下係廣東話口語，用繁體中文書寫。唔該晒，係咁㗎啦，我喺度等緊你。";

  test("flags text copied verbatim from the prompt", () => {
    expect(isPromptHallucination("唔該晒，係咁㗎啦", PROMPT)).toBe(true);
  });

  test("does not flag genuinely different speech", () => {
    expect(isPromptHallucination("今日想去飲茶食點心", PROMPT)).toBe(false);
  });

  test("ignores very short results (under 4 CJK chars)", () => {
    expect(isPromptHallucination("唔該", PROMPT)).toBe(false);
  });

  test("does not flag empty text", () => {
    expect(isPromptHallucination("", PROMPT)).toBe(false);
  });
});

describe("parseModelJson", () => {
  test("parses plain JSON", () => {
    expect(parseModelJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  test("strips ```json fences", () => {
    expect(parseModelJson<{ a: number }>('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  test("strips bare ``` fences", () => {
    expect(parseModelJson<{ a: number }>('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  test("throws on non-JSON content", () => {
    expect(() => parseModelJson("not json at all")).toThrow();
  });
});

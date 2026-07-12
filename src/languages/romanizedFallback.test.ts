import { describe, test, expect } from "vitest";
import { romanizedFallbackMatch, tokenizeRomanized } from "./romanizedFallback";

describe("tokenizeRomanized", () => {
  test("splits on whitespace and hyphens", () => {
    expect(tokenizeRomanized("li2-ho2 bo5")).toEqual(["li", "ho", "bo"]);
  });

  test("lowercases and strips diacritics and tone digits", () => {
    expect(tokenizeRomanized("Tâi-lô")).toEqual(["tai", "lo"]);
    expect(tokenizeRomanized("tai5 lo5")).toEqual(["tai", "lo"]);
  });

  test("drops punctuation", () => {
    expect(tokenizeRomanized("li2 ho2!?,")).toEqual(["li", "ho"]);
  });

  test("returns an empty array for empty or symbol-only input", () => {
    expect(tokenizeRomanized("")).toEqual([]);
    expect(tokenizeRomanized("!?! 123")).toEqual([]);
  });
});

describe("romanizedFallbackMatch", () => {
  test("returns 100 for identical strings", () => {
    expect(romanizedFallbackMatch("gua2 beh4 khi3", "gua2 beh4 khi3")).toBe(100);
  });

  test("returns 0 for fully disjoint phrases", () => {
    expect(romanizedFallbackMatch("gua2 beh4 khi3", "li2 ho2 bo5")).toBe(0);
  });

  test("returns 0 when either side is empty", () => {
    expect(romanizedFallbackMatch("", "li2 ho2")).toBe(0);
    expect(romanizedFallbackMatch("li2 ho2", "")).toBe(0);
    expect(romanizedFallbackMatch("", "")).toBe(0);
  });

  test("is order-insensitive", () => {
    expect(romanizedFallbackMatch("gua2 beh4 khi3", "khi3 gua2 beh4")).toBe(100);
  });

  test("scores partial overlap sensibly", () => {
    // 2 of 4 expected tokens present; Dice = 2*2/(4+4) = 0.5
    expect(romanizedFallbackMatch("gua beh khi chhi", "gua beh lai loh")).toBe(50);
  });

  test("penalizes extra tokens in the answer", () => {
    // all 2 expected present but 2 extras; Dice = 2*2/(2+4) ≈ 0.67
    expect(romanizedFallbackMatch("li ho", "li ho bo la")).toBe(67);
  });

  test("is insensitive to diacritics vs tone digits", () => {
    expect(romanizedFallbackMatch("Tâi-lô", "tai5 lo5")).toBe(100);
    expect(romanizedFallbackMatch("guá beh khì", "gua2 beh4 khi3")).toBe(100);
  });

  test("does not double-count repeated tokens", () => {
    // expected has two "ho"; answer has only one → shared=1, Dice = 2/(2+1)
    expect(romanizedFallbackMatch("ho ho", "ho")).toBe(67);
  });
});

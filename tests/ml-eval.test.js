// @vitest-environment node
import { describe, test, expect } from "vitest";
import { readFileSync } from "fs";
import { createNormalizer, editDistance, characterErrorRate } from "../ml/eval/cer.mjs";

const normalization = JSON.parse(readFileSync("ml/eval/normalization.json", "utf8"));
const normalize = createNormalizer(normalization);

describe("normalization.json stays in sync with the language pack", () => {
  test("matches the yue-HK pack scoring data", async () => {
    const { CANTONESE_PACK } = await import("../src/languages/yue-HK");
    expect(normalization.charEquivalents).toEqual(CANTONESE_PACK.scoring.charEquivalents);
    expect(normalization.particleGroups).toEqual(CANTONESE_PACK.scoring.particleGroups);
    expect(normalization.sttPrompt).toBe(CANTONESE_PACK.stt.prompt);
  });
});

describe("editDistance", () => {
  test("computes Levenshtein distance", () => {
    expect(editDistance([..."abc"], [..."abc"])).toBe(0);
    expect(editDistance([..."abc"], [..."axc"])).toBe(1);
    expect(editDistance([..."abc"], [..."ab"])).toBe(1);
    expect(editDistance([], [..."abc"])).toBe(3);
  });
});

describe("characterErrorRate", () => {
  test("0 for an exact match", () => {
    expect(characterErrorRate("你好嗎", "你好嗎", normalize)).toBe(0);
  });

  test("ignores punctuation and whitespace", () => {
    expect(characterErrorRate("你好嗎？", "你好 嗎", normalize)).toBe(0);
  });

  test("treats Mandarin↔Cantonese equivalents as matches (same as app scorer)", () => {
    expect(characterErrorRate("係唔係", "是不是", normalize)).toBe(0);
  });

  test("folds interchangeable particles", () => {
    expect(characterErrorRate("走啦", "走喇", normalize)).toBe(0);
  });

  test("counts real substitutions", () => {
    // one wrong char out of three
    expect(characterErrorRate("我想食", "我想飲", normalize)).toBeCloseTo(1 / 3);
  });

  test("null when reference is empty after normalization", () => {
    expect(characterErrorRate("？！", "你好", normalize)).toBeNull();
  });
});

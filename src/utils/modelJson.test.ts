import { describe, test, expect } from "vitest";
import { parseModelJson, truncateForLog } from "./modelJson";

describe("parseModelJson", () => {
  test("parses plain JSON objects", () => {
    expect(parseModelJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  test("parses plain JSON arrays", () => {
    expect(parseModelJson<number[]>("[1,2,3]")).toEqual([1, 2, 3]);
  });

  test("strips ```json fences", () => {
    expect(parseModelJson<{ a: number }>('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  test("strips uppercase ```JSON fences", () => {
    expect(parseModelJson<{ a: number }>('```JSON\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  test("strips bare ``` fences", () => {
    expect(parseModelJson<{ a: number }>('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  test("strips fences around arrays", () => {
    expect(parseModelJson<Array<{ english: string }>>('```json\n[{"english":"hi"}]\n```')).toEqual([
      { english: "hi" },
    ]);
  });

  test("tolerates surrounding whitespace", () => {
    expect(parseModelJson<{ a: number }>('  \n {"a":1} \n  ')).toEqual({ a: 1 });
  });

  test("throws on non-JSON content", () => {
    expect(() => parseModelJson("not json at all")).toThrow();
  });

  test("throws on truncated JSON", () => {
    expect(() => parseModelJson('{"a": [1, 2')).toThrow();
  });

  test("throws on empty input", () => {
    expect(() => parseModelJson("")).toThrow();
  });
});

describe("truncateForLog", () => {
  test("returns short content unchanged", () => {
    expect(truncateForLog("short")).toBe("short");
  });

  test("truncates long content to the default length with an ellipsis", () => {
    const long = "x".repeat(500);
    const result = truncateForLog(long);
    expect(result).toBe(`${"x".repeat(200)}…`);
  });

  test("respects a custom max length", () => {
    expect(truncateForLog("abcdef", 3)).toBe("abc…");
  });

  test("does not append an ellipsis at exactly the max length", () => {
    expect(truncateForLog("abc", 3)).toBe("abc");
  });
});

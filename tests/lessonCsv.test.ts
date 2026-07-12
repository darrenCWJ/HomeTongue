// Tests for the lesson spreadsheet pipeline (scripts/lib/lessonCsv.mjs).
//
// The headline guarantee is ROUND-TRIP FIDELITY: exporting the real lesson
// registry to CSV and importing it back must reproduce the registry content
// byte-for-byte (deep equality), for every shipped language. If this holds,
// the pipeline can never mangle authored content.

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseCsv,
  stringifyCsv,
  rowsToContent,
  contentToRows,
  generateModules,
  EXERCISE_TYPES,
  EXPORT_COLUMNS,
} from "../scripts/lib/lessonCsv.mjs";
import { getLessonContent } from "../src/data/lessons";

// ── Round-trip fidelity ─────────────────────────────────────────────────────

describe("round-trip fidelity", () => {
  for (const code of ["yue-HK", "nan-TW"]) {
    test(`${code}: contentToRows -> stringify -> parseCsv -> rowsToContent deep-equals the registry`, () => {
      const content = getLessonContent(code);
      expect(content.lessons.length).toBeGreaterThan(0);

      const records = contentToRows(code, content);
      const csv = stringifyCsv(records);
      const result = rowsToContent(parseCsv(csv));

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(Object.keys(result.byLanguage)).toEqual([code]);
      expect(result.byLanguage[code]).toEqual(content);
    });
  }
});

// ── CSV parser edge cases ───────────────────────────────────────────────────

describe("parseCsv", () => {
  test("keeps commas inside quoted fields", () => {
    expect(parseCsv('a,"b,c",d\n')).toEqual([["a", "b,c", "d"]]);
  });

  test("keeps embedded newlines inside quoted fields", () => {
    expect(parseCsv('a,"line1\nline2",c\r\nd,e,f\r\n')).toEqual([
      ["a", "line1\nline2", "c"],
      ["d", "e", "f"],
    ]);
  });

  test('unescapes doubled quotes ("")', () => {
    expect(parseCsv('a,"he said ""hi""",c\n')).toEqual([["a", 'he said "hi"', "c"]]);
  });

  test("accepts CRLF and LF line endings alike", () => {
    expect(parseCsv("a,b\r\nc,d\ne,f\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
    ]);
  });

  test("strips a leading UTF-8 BOM", () => {
    expect(parseCsv(String.fromCharCode(0xfeff) + "a,b\n")).toEqual([["a", "b"]]);
  });

  test("throws a plain-English error for an unclosed quote", () => {
    expect(() => parseCsv('a,"unterminated\n')).toThrow(/unclosed quoted field/);
  });

  test("stringifyCsv -> parseCsv round-trips tricky fields", () => {
    const record = ["comma, here", 'quote " here', "newline\nhere", "早晨！", "plain"];
    expect(parseCsv(stringifyCsv([record]))).toEqual([record]);
  });
});

// ── Validation ──────────────────────────────────────────────────────────────

type Row = Partial<Record<string, string>>;

const BASE_ROW: Row = {
  language: "nan-TW",
  category_id: "nan-basics",
  category_title: "Hokkien Basics",
  category_description: "Everyday phrases",
  category_icon: "🏮",
  lesson_id: "nan-test",
  lesson_title: "Test Lesson",
  lesson_description: "For tests",
  difficulty: "beginner",
  lesson_tags: "test",
  level: "1",
  level_title: "Level One",
  level_description: "First level",
  exercise_type: "flashcard",
  dialect_text: "你好",
  romanization: "lí hó",
  english: "Hello",
};

function toRecords(rows: Row[], extraColumns: string[] = []): string[][] {
  const header = [...EXPORT_COLUMNS, ...extraColumns];
  return [header, ...rows.map((row) => header.map((column: string) => row[column] ?? ""))];
}

function errorsOf(rows: Row[], extraColumns: string[] = []) {
  return rowsToContent(toRecords(rows, extraColumns));
}

describe("validation", () => {
  test("unknown exercise type is an error with the allowed list", () => {
    const { errors } = errorsOf([{ ...BASE_ROW, exercise_type: "quiz" }]);
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(2);
    expect(errors[0].message).toContain("exercise_type must be one of");
    expect(errors[0].message).toContain('"quiz"');
    expect(errors[0].message).toContain("fill-blank");
  });

  test("missing romanization is an error", () => {
    const { errors } = errorsOf([{ ...BASE_ROW, romanization: "" }]);
    expect(errors.some((e) => e.row === 2 && e.message.includes("romanization is empty"))).toBe(true);
  });

  test("non-contiguous levels are an error listing what was found", () => {
    const { errors } = errorsOf([
      BASE_ROW,
      {
        ...BASE_ROW,
        level: "3",
        level_title: "Level Three",
        dialect_text: "多謝",
        romanization: "to-siā",
        english: "Thanks",
      },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("levels must run 1, 2, 3");
    expect(errors[0].message).toContain("found 1, 3");
  });

  test("an inconsistent filled-down lesson_title names both rows", () => {
    const { errors } = errorsOf([
      BASE_ROW,
      {
        ...BASE_ROW,
        lesson_title: "Test Lessons",
        dialect_text: "多謝",
        romanization: "to-siā",
        english: "Thanks",
      },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(3);
    expect(errors[0].message).toContain('lesson_title "Test Lessons" does not match "Test Lesson"');
    expect(errors[0].message).toContain("row 2");
  });

  test("a duplicate word in the same lesson+level names the first row", () => {
    const { errors } = errorsOf([BASE_ROW, { ...BASE_ROW }]);
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(3);
    expect(errors[0].message).toContain('duplicate word "你好"');
    expect(errors[0].message).toContain("row 2");
  });

  test("the same word on different levels is NOT a duplicate", () => {
    const { errors } = errorsOf([
      BASE_ROW,
      { ...BASE_ROW, level: "0", level_title: "", level_description: "", exercise_type: "" },
    ]);
    expect(errors).toEqual([]);
  });

  test("an unprefixed nan-TW lesson id is an error", () => {
    const { errors } = errorsOf([{ ...BASE_ROW, lesson_id: "greetings" }]);
    expect(
      errors.some((e) => e.row === 2 && e.message.includes('lesson_id "greetings" must start with "nan-"'))
    ).toBe(true);
  });

  test("an unprefixed nan-TW category id is an error", () => {
    const { errors } = errorsOf([{ ...BASE_ROW, category_id: "basics" }]);
    expect(
      errors.some((e) => e.row === 2 && e.message.includes('category_id "basics" must start with "nan-"'))
    ).toBe(true);
  });

  test("yue-HK ids are exempt from the prefix rule", () => {
    const { errors } = errorsOf([
      { ...BASE_ROW, language: "yue-HK", category_id: "greetings", lesson_id: "greetings" },
    ]);
    expect(errors).toEqual([]);
  });

  test("a fill-blank level with no ___ sentence is an error", () => {
    const { errors } = errorsOf([
      { ...BASE_ROW, exercise_type: "fill-blank", example_sentence: "no blank in this sentence" },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("fill-blank");
    expect(errors[0].message).toContain("___");
  });

  test("a fill-blank level passes when one word has a ___ sentence (others act as distractors)", () => {
    const { errors } = errorsOf([
      { ...BASE_ROW, exercise_type: "fill-blank", example_sentence: "___，我是誰。" },
      {
        ...BASE_ROW,
        exercise_type: "fill-blank",
        dialect_text: "多謝",
        romanization: "to-siā",
        english: "Thanks",
      },
    ]);
    expect(errors).toEqual([]);
  });

  test("an unknown language code is an error", () => {
    const { errors } = errorsOf([{ ...BASE_ROW, language: "xx-XX" }]);
    expect(errors.some((e) => e.row === 2 && e.message.includes('unknown language "xx-XX"'))).toBe(true);
  });

  test("a mis-cased language code suggests the right one", () => {
    const { errors } = errorsOf([{ ...BASE_ROW, language: "yue-hk" }]);
    expect(errors.some((e) => e.message.includes('did you mean "yue-HK"?'))).toBe(true);
  });

  test("a reviewed column produces warnings (not errors) for rows not marked yes", () => {
    const { errors, warnings } = errorsOf(
      [
        { ...BASE_ROW, reviewed: "" },
        { ...BASE_ROW, dialect_text: "多謝", romanization: "to-siā", english: "Thanks", reviewed: "Yes" },
      ],
      ["reviewed"]
    );
    expect(errors).toEqual([]);
    const reviewWarnings = warnings.filter((w: { message: string }) =>
      w.message.includes("not marked as reviewed")
    );
    expect(reviewWarnings).toHaveLength(1);
    expect(reviewWarnings[0].row).toBe(2);
  });

  test("an invalid turn_speaker is an error", () => {
    const { errors } = errorsOf([
      { ...BASE_ROW, exercise_type: "conversation", turn_speaker: "me", turn_hint: "" },
    ]);
    expect(errors.some((e) => e.message.includes('turn_speaker must be "user" or "them"'))).toBe(true);
  });

  test("a conversation level without conversation lines is an error", () => {
    const { errors } = errorsOf([{ ...BASE_ROW, exercise_type: "conversation" }]);
    expect(errors.some((e) => e.message.includes("has no conversation"))).toBe(true);
  });

  test("a missing required column fails with a template pointer", () => {
    const { errors } = rowsToContent([
      ["language", "lesson_id"],
      ["nan-TW", "nan-test"],
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(1);
    expect(errors[0].message).toContain("missing required column(s)");
    expect(errors[0].message).toContain("dialect_text");
  });

  test("blank rows are skipped without errors", () => {
    const records = toRecords([BASE_ROW]);
    records.splice(
      1,
      0,
      EXPORT_COLUMNS.map(() => "")
    );
    const { errors } = rowsToContent(records);
    expect(errors).toEqual([]);
  });
});

// ── Generated modules ───────────────────────────────────────────────────────

describe("generateModules", () => {
  test("nan-TW: one file per category plus index, each under 800 lines", () => {
    const files = generateModules("nan-TW", getLessonContent("nan-TW"));
    expect(Object.keys(files).sort()).toEqual(["basics.ts", "index.ts"]);
    expect(files["basics.ts"]).toContain("export const NAN_BASICS_LESSONS: Lesson[] = [");
    expect(files["index.ts"]).toContain('import { NAN_BASICS_LESSONS } from "./basics";');
    expect(files["index.ts"]).toContain("export const NAN_TW_LESSON_CONTENT");
    for (const source of Object.values(files)) {
      expect(source.split("\n").length).toBeLessThan(800);
    }
  });

  test("yue-HK: category file names and const names match the historical layout", () => {
    const files = generateModules("yue-HK", getLessonContent("yue-HK"));
    expect(Object.keys(files).sort()).toEqual([
      "food.ts",
      "greetings.ts",
      "index.ts",
      "slang.ts",
      "transport.ts",
    ]);
    expect(files["greetings.ts"]).toContain("export const GREETINGS_LESSONS: Lesson[] = [");
    expect(files["index.ts"]).toContain(
      "...GREETINGS_LESSONS, ...FOOD_LESSONS, ...TRANSPORT_LESSONS, ...SLANG_LESSONS"
    );
  });

  test("an oversized category is chunked into numbered files", () => {
    const files = generateModules("nan-TW", getLessonContent("nan-TW"), { maxLines: 40 });
    expect(Object.keys(files).sort()).toEqual(["basics-2.ts", "basics.ts", "index.ts"]);
    expect(files["basics-2.ts"]).toContain("export const NAN_BASICS_LESSONS_2: Lesson[] = [");
    expect(files["index.ts"]).toContain("...NAN_BASICS_LESSONS, ...NAN_BASICS_LESSONS_2");
  });
});

// ── Contract with src/types.ts ──────────────────────────────────────────────

describe("schema drift guards", () => {
  test("EXERCISE_TYPES matches the ExerciseType union in src/types.ts", () => {
    // vitest runs with cwd = repo root; import.meta.url is not a file: URL under jsdom.
    const source = readFileSync(join(process.cwd(), "src", "types.ts"), "utf8");
    const match = source.match(/export type ExerciseType =([^;]+);/);
    expect(match).not.toBeNull();
    const fromTypes = [...match![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(EXERCISE_TYPES).toEqual(fromTypes);
  });
});

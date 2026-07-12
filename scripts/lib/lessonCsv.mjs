// Pure core of the lesson spreadsheet pipeline (no file I/O — unit-testable).
// This module is the single entry point; the pieces live in sibling files:
//
//   csv.mjs             parseCsv / stringifyCsv (hand-rolled RFC-4180-ish)
//   lessonSchema.mjs    column contract + allowed value sets
//   lessonImport.mjs    rowsToContent (CSV records -> registry shape + errors)
//   lessonRowChecks.mjs single-row field validation used by lessonImport
//   lessonModules.mjs   generateModules (registry shape -> TS module sources)
//
//   CSV records  --rowsToContent-->  { categories, lessons } per language
//   registry     --contentToRows-->  CSV records (header row first)
//
// The two directions are exact inverses: tests/lessonCsv.test.ts round-trips
// the real yue-HK and nan-TW registries through CSV and requires deep
// equality, so the pipeline can never mangle authored content.
//
// CSV format: one row per word (or per conversation line), category/lesson/
// level metadata repeated on every row (fill-down friendly). Rows with
// level 0 are the lesson's full word list (LessonContent.vocabulary); levels
// 1+ are the playable exercise levels. Conversation-exercise lines set
// turn_speaker ("user"/"them") and may set turn_hint.

import { parseCsv, stringifyCsv } from "./csv.mjs";
import { rowsToContent } from "./lessonImport.mjs";
import { generateModules } from "./lessonModules.mjs";
import {
  DIFFICULTIES,
  EXERCISE_TYPES,
  EXPORT_COLUMNS,
  KNOWN_LANGUAGE_CODES,
  REQUIRED_COLUMNS,
  WORD_LIST_LEVEL,
  joinTags,
} from "./lessonSchema.mjs";

export { parseCsv, stringifyCsv, rowsToContent, generateModules };
export { DIFFICULTIES, EXERCISE_TYPES, EXPORT_COLUMNS, KNOWN_LANGUAGE_CODES, REQUIRED_COLUMNS };

// ── Export direction ────────────────────────────────────────────────────────

/**
 * Turn one language's registry content into CSV records (header row first).
 * Throws when the content cannot be represented faithfully — every throw here
 * means "fix the data", never "silently drop something".
 *
 * @param {string} languageCode
 * @param {{ categories: Array<object>, lessons: Array<object> }} content
 * @returns {string[][]}
 */
export function contentToRows(languageCode, content) {
  const categoriesById = new Map(content.categories.map((category) => [category.id, category]));
  assertRoundTrippable(languageCode, content, categoriesById);

  const records = [EXPORT_COLUMNS.slice()];
  for (const lesson of content.lessons) {
    const category = categoriesById.get(lesson.categoryId);
    for (const item of lesson.content.vocabulary) {
      records.push(vocabRecord(languageCode, category, lesson, WORD_LIST_LEVEL, null, item));
    }
    for (const level of lesson.content.levels ?? []) {
      for (const item of level.vocabulary) {
        records.push(vocabRecord(languageCode, category, lesson, level.level, level, item));
      }
      for (const turn of level.conversation ?? []) {
        records.push(turnRecord(languageCode, category, lesson, level, turn));
      }
    }
  }
  return records;
}

function assertRoundTrippable(languageCode, content, categoriesById) {
  const firstAppearance = [];
  for (const lesson of content.lessons) {
    if (!categoriesById.has(lesson.categoryId)) {
      throw new Error(`lesson "${lesson.id}" references unknown category "${lesson.categoryId}"`);
    }
    if (!firstAppearance.includes(lesson.categoryId)) firstAppearance.push(lesson.categoryId);
    for (const tag of lesson.tags) {
      if (tag.includes(";")) {
        throw new Error(`lesson "${lesson.id}" tag "${tag}" contains ";" — CSV uses ";" to separate tags`);
      }
    }
    const levels = lesson.content.levels;
    if (levels && levels.length === 0) {
      throw new Error(`lesson "${lesson.id}" has an empty levels array — omit "levels" instead`);
    }
    for (const level of levels ?? []) {
      const turns = level.conversation;
      if (turns && turns.length === 0) {
        throw new Error(`lesson "${lesson.id}" level ${level.level} has an empty conversation array`);
      }
      if (level.vocabulary.length === 0 && !(turns && turns.length > 0)) {
        throw new Error(
          `lesson "${lesson.id}" level ${level.level} has no vocabulary and no conversation — nothing to export`
        );
      }
    }
  }
  const declaredOrder = content.categories.map((category) => category.id).join("\n");
  if (firstAppearance.join("\n") !== declaredOrder) {
    throw new Error(
      `${languageCode}: category order cannot round-trip — categories must appear in the same order as ` +
        `their lessons, and every category needs at least one lesson (declared: ${declaredOrder.replaceAll("\n", ", ")})`
    );
  }
}

function baseCells(languageCode, category, lesson, levelNumber, level) {
  return [
    languageCode,
    category.id,
    category.title,
    category.description,
    category.icon,
    lesson.id,
    lesson.title,
    lesson.description,
    lesson.difficulty,
    joinTags(lesson.tags),
    String(levelNumber),
    level ? level.title : "",
    level ? level.description : "",
    level ? level.exerciseType : "",
  ];
}

function vocabRecord(languageCode, category, lesson, levelNumber, level, item) {
  return [
    ...baseCells(languageCode, category, lesson, levelNumber, level),
    item.cantonese,
    item.pronunciation,
    item.english,
    item.exampleSentence ?? "",
    "",
    "",
  ];
}

function turnRecord(languageCode, category, lesson, level, turn) {
  return [
    ...baseCells(languageCode, category, lesson, level.level, level),
    turn.cantonese,
    turn.pronunciation,
    turn.english,
    "",
    turn.speaker,
    turn.hint ?? "",
  ];
}

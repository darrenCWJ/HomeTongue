// Shared constants for the lesson spreadsheet pipeline: the CSV column
// contract and the allowed value sets. Pure data — no file I/O.
//
// The CSV format is one row per word (or per conversation line), with the
// category/lesson/level details repeated on every row so the sheet stays
// fill-down friendly. See docs/LESSON_AUTHORING.md for the admin-facing
// description of every column.

import { LANGUAGE_MANIFEST } from "../../api/_lib/languageManifest.js";

/** Language codes the server (and therefore the CSV) accepts. */
export const KNOWN_LANGUAGE_CODES = LANGUAGE_MANIFEST.map((entry) => entry.languageCode);

/**
 * Mirrors the ExerciseType union in src/types.ts. tests/lessonCsv.test.ts
 * parses that union out of src/types.ts and fails if this list drifts.
 */
export const EXERCISE_TYPES = ["flashcard", "matching", "multiple-choice", "fill-blank", "conversation"];

/** Mirrors Lesson["difficulty"] in src/types.ts. */
export const DIFFICULTIES = ["beginner", "intermediate", "advanced"];

/** Mirrors ConversationTurn["speaker"] in src/types.ts. */
export const TURN_SPEAKERS = ["user", "them"];

/**
 * Rows with level 0 are the lesson's full word list (LessonContent.vocabulary,
 * shown on the lesson overview). Levels 1+ are the playable exercise levels.
 */
export const WORD_LIST_LEVEL = 0;

/** Columns every lesson CSV must have (order = export order). */
export const REQUIRED_COLUMNS = [
  "language",
  "category_id",
  "category_title",
  "category_description",
  "category_icon",
  "lesson_id",
  "lesson_title",
  "lesson_description",
  "difficulty",
  "lesson_tags",
  "level",
  "level_title",
  "level_description",
  "exercise_type",
  "dialect_text",
  "romanization",
  "english",
  "example_sentence",
];

/**
 * Optional columns. turn_speaker/turn_hint carry conversation-level lines
 * (only "conversation" levels use them); reviewed is the native-speaker
 * sign-off column — rows not marked "yes" import with a warning.
 */
export const OPTIONAL_COLUMNS = ["turn_speaker", "turn_hint", "reviewed"];

/** Columns the exporter writes (reviewed is left to the spreadsheet). */
export const EXPORT_COLUMNS = [...REQUIRED_COLUMNS, "turn_speaker", "turn_hint"];

/**
 * The id prefix every non-yue-HK lesson AND category id must carry, e.g.
 * "nan-" for nan-TW (mirrors the convention enforced by
 * src/languages/packs.test.ts and documented in src/data/lessons.ts).
 *
 * @param {string} languageCode
 */
export function languagePrefix(languageCode) {
  return `${languageCode.split("-")[0].toLowerCase()}-`;
}

/**
 * Env-style suffix used for generated const names ("yue-HK" -> "YUE_HK"),
 * same derivation as api/_lib/languageManifest.js.
 *
 * @param {string} languageCode
 */
export function constSuffix(languageCode) {
  return languageCode.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

/** Split a semicolon-separated lesson_tags cell into a clean tags array. */
export function splitTags(cell) {
  return cell
    .split(";")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/** Join a tags array back into the lesson_tags cell format. */
export function joinTags(tags) {
  return tags.join("; ");
}

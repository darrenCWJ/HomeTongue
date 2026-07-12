// Per-row field validation for the lesson spreadsheet pipeline: checks one
// CSV row's cell values in isolation (cross-row consistency, level
// contiguity, duplicates etc. live in lessonImport.mjs). Pure — no file I/O.

import {
  DIFFICULTIES,
  EXERCISE_TYPES,
  KNOWN_LANGUAGE_CODES,
  TURN_SPEAKERS,
  WORD_LIST_LEVEL,
  languagePrefix,
} from "./lessonSchema.mjs";

const FIELD_HINTS = {
  dialect_text: "the word or phrase in the dialect's own script",
  romanization: "how to pronounce it (e.g. Jyutping or Tâi-lô)",
  english: "the English meaning",
};

const ALWAYS_REQUIRED_CELLS = [
  "category_id",
  "category_title",
  "category_description",
  "category_icon",
  "lesson_id",
  "lesson_title",
  "lesson_description",
  "difficulty",
  "dialect_text",
  "romanization",
  "english",
];

/**
 * Validate one row's cells. Reports every problem it finds via error()/warn()
 * — never stops at the first one.
 *
 * @param {Record<string, string> & { level_number: number | null, is_turn: boolean }} cells
 * @param {number} row 1-based CSV row number
 * @param {boolean} hasReviewed whether the CSV has a reviewed column
 * @param {(row: number, message: string) => void} error
 * @param {(row: number, message: string) => void} warn
 */
export function validateRow(cells, row, hasReviewed, error, warn) {
  const known = KNOWN_LANGUAGE_CODES;
  if (cells.language === "") {
    error(row, `language is empty — use one of: ${known.join(", ")}`);
  } else if (!known.includes(cells.language)) {
    const match = known.find((code) => code.toLowerCase() === cells.language.toLowerCase());
    const hint = match ? ` — did you mean "${match}"?` : ` — known languages: ${known.join(", ")}`;
    error(row, `unknown language "${cells.language}"${hint}`);
  }

  for (const column of ALWAYS_REQUIRED_CELLS) {
    if (cells[column] === "") {
      const hint = FIELD_HINTS[column] ? ` (${FIELD_HINTS[column]})` : "";
      error(row, `${column} is empty — every row needs it${hint}`);
    }
  }
  if (cells.difficulty !== "" && !DIFFICULTIES.includes(cells.difficulty)) {
    error(row, `difficulty must be ${DIFFICULTIES.join(", ")} (got "${cells.difficulty}")`);
  }

  if (cells.level_number === null) {
    error(
      row,
      `level must be a whole number — 0 for the lesson word list, 1, 2, 3… for exercise levels (got "${cells.level}")`
    );
  } else if (cells.level_number === WORD_LIST_LEVEL) {
    if (cells.level_title !== "" || cells.level_description !== "" || cells.exercise_type !== "") {
      error(
        row,
        "level 0 rows are the lesson's word list — leave level_title, level_description and exercise_type blank"
      );
    }
    if (cells.is_turn) {
      error(row, "conversation lines belong in a numbered conversation level, not the level 0 word list");
    }
  } else {
    for (const column of ["level_title", "level_description", "exercise_type"]) {
      if (cells[column] === "") {
        error(row, `${column} is empty — every exercise level needs it (fill it down on every row of the level)`);
      }
    }
    if (cells.exercise_type !== "" && !EXERCISE_TYPES.includes(cells.exercise_type)) {
      error(row, `exercise_type must be one of ${EXERCISE_TYPES.join(", ")} (got "${cells.exercise_type}")`);
    }
  }

  if (cells.is_turn) {
    if (!TURN_SPEAKERS.includes(cells.turn_speaker)) {
      error(row, `turn_speaker must be "user" or "them" (got "${cells.turn_speaker}")`);
    }
    if (cells.example_sentence !== "") {
      error(row, "conversation lines don't use example_sentence — put a hint in turn_hint instead");
    }
  }

  if (cells.language !== "yue-HK" && KNOWN_LANGUAGE_CODES.includes(cells.language)) {
    const prefix = languagePrefix(cells.language);
    for (const column of ["lesson_id", "category_id"]) {
      if (cells[column] !== "" && !cells[column].startsWith(prefix)) {
        error(
          row,
          `${column} "${cells[column]}" must start with "${prefix}" — every ${cells.language} lesson and ` +
            `category id carries the language's short prefix so ids stay globally unique`
        );
      }
    }
  }

  if (hasReviewed && cells.reviewed.toLowerCase() !== "yes") {
    warn(row, 'not marked as reviewed — set the reviewed column to "yes" once a native speaker has checked this row');
  }
}

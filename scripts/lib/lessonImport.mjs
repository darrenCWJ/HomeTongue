// Import direction of the lesson spreadsheet pipeline: parsed CSV records ->
// registry-shaped content, collecting ALL validation errors and warnings
// (never fail-fast) as { row, message } with 1-based CSV row numbers
// (header = row 1) and plain-English messages. Pure — no file I/O.
// Single-row field checks live in lessonRowChecks.mjs; cross-row checks
// (fill-down consistency, duplicates, level contiguity, fill-blank/
// conversation rules) live here.
//
// Re-exported through lessonCsv.mjs; see that module for the format contract.

import { validateRow } from "./lessonRowChecks.mjs";
import {
  KNOWN_LANGUAGE_CODES,
  OPTIONAL_COLUMNS,
  REQUIRED_COLUMNS,
  TURN_SPEAKERS,
  WORD_LIST_LEVEL,
  joinTags,
  splitTags,
} from "./lessonSchema.mjs";

/**
 * Turn parsed CSV records (header first) back into registry-shaped content.
 *
 * @param {string[][]} records
 * @returns {{
 *   byLanguage: Record<string, { categories: Array<object>, lessons: Array<object> }>,
 *   errors: Array<{ row: number, message: string }>,
 *   warnings: Array<{ row: number, message: string }>,
 * }}
 */
export function rowsToContent(records) {
  const errors = [];
  const warnings = [];
  const error = (row, message) => errors.push({ row, message });
  const warn = (row, message) => warnings.push({ row, message });
  const result = { byLanguage: {}, errors, warnings };

  const header = readHeader(records, error, warn);
  if (!header) return result;

  const languages = new Map();
  const lessonHome = new Map(); // lesson_id -> { language, row } across the whole file
  for (let index = 1; index < records.length; index++) {
    const record = records[index];
    const rowNumber = index + 1;
    if (record.every((field) => field.trim() === "")) continue;
    if (record.length > header.names.length) {
      error(
        rowNumber,
        `row has ${record.length} fields but the header has ${header.names.length} columns — check for a stray comma`
      );
      continue;
    }
    const cells = readCells(header, record);
    validateRow(cells, rowNumber, header.hasReviewed, error, warn);
    collectRow(cells, rowNumber, languages, lessonHome, error);
  }

  for (const [, language] of languages) {
    for (const [, lesson] of language.lessons) finishLesson(lesson, error, warn);
  }

  for (const [code, language] of languages) {
    result.byLanguage[code] = {
      categories: [...language.categories.values()].map(({ id, title, description, icon }) => ({
        id,
        title,
        description,
        icon,
      })),
      lessons: [...language.lessons.values()].map(buildLesson),
    };
  }
  return result;
}

function readHeader(records, error, warn) {
  if (!records || records.length === 0 || records[0].every((field) => field.trim() === "")) {
    error(1, "the CSV file is empty — start from docs/templates/lessons-template.csv");
    return null;
  }
  const names = records[0].map((name) => name.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((column) => !names.includes(column));
  if (missing.length > 0) {
    error(
      1,
      `missing required column(s): ${missing.join(", ")} — start from docs/templates/lessons-template.csv`
    );
    return null;
  }
  for (const name of names) {
    if (name !== "" && !REQUIRED_COLUMNS.includes(name) && !OPTIONAL_COLUMNS.includes(name)) {
      warn(1, `unknown column "${name}" is ignored`);
    }
  }
  return { names, hasReviewed: names.includes("reviewed") };
}

function readCells(header, record) {
  const cells = {};
  for (const column of [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]) {
    const index = header.names.indexOf(column);
    cells[column] = index === -1 ? "" : (record[index] ?? "").trim();
  }
  cells.level_number = /^\d+$/.test(cells.level) ? Number(cells.level) : null;
  cells.is_turn = cells.turn_speaker !== "";
  return cells;
}

function checkConsistent(scope, firstRow, row, pairs, error) {
  for (const [column, first, current] of pairs) {
    if (first !== current) {
      error(
        row,
        `${column} "${current}" does not match "${first}" used for ${scope} on row ${firstRow} — ` +
          "repeated (filled-down) details must be identical on every row"
      );
    }
  }
}

function collectRow(cells, row, languages, lessonHome, error) {
  if (
    !KNOWN_LANGUAGE_CODES.includes(cells.language) ||
    cells.category_id === "" ||
    cells.lesson_id === "" ||
    cells.level_number === null
  ) {
    return; // identity fields already reported — nothing sane to aggregate
  }

  let language = languages.get(cells.language);
  if (!language) languages.set(cells.language, (language = { categories: new Map(), lessons: new Map() }));

  const category = language.categories.get(cells.category_id);
  if (!category) {
    language.categories.set(cells.category_id, {
      firstRow: row,
      id: cells.category_id,
      title: cells.category_title,
      description: cells.category_description,
      icon: cells.category_icon,
    });
  } else {
    checkConsistent(
      `category "${category.id}"`,
      category.firstRow,
      row,
      [
        ["category_title", category.title, cells.category_title],
        ["category_description", category.description, cells.category_description],
        ["category_icon", category.icon, cells.category_icon],
      ],
      error
    );
  }

  const home = lessonHome.get(cells.lesson_id);
  if (!home) lessonHome.set(cells.lesson_id, { language: cells.language, row });
  else if (home.language !== cells.language) {
    error(
      row,
      `lesson_id "${cells.lesson_id}" is already used for ${home.language} on row ${home.row} — ` +
        "lesson ids must be unique across languages"
    );
  }

  const lesson = getOrCreateLesson(language, cells, row, error);
  const level = cells.level_number === WORD_LIST_LEVEL ? null : getOrCreateLevel(lesson, cells, row, error);

  if (cells.is_turn) {
    if (level && TURN_SPEAKERS.includes(cells.turn_speaker)) {
      const turn = {
        speaker: cells.turn_speaker,
        english: cells.english,
        cantonese: cells.dialect_text,
        pronunciation: cells.romanization,
      };
      if (cells.turn_hint !== "") turn.hint = cells.turn_hint;
      level.conversation.push(turn);
    }
    return;
  }

  if (cells.dialect_text !== "") {
    const key = `${cells.level_number} ${cells.dialect_text}`;
    const seenAt = lesson.itemsSeen.get(key);
    if (seenAt) {
      const where = cells.level_number === WORD_LIST_LEVEL ? "word list (level 0)" : `level ${cells.level_number}`;
      error(
        row,
        `duplicate word "${cells.dialect_text}" — already listed for lesson "${lesson.id}" ${where} on row ${seenAt}`
      );
      return;
    }
    lesson.itemsSeen.set(key, row);
  }
  const item = { english: cells.english, cantonese: cells.dialect_text, pronunciation: cells.romanization };
  if (cells.example_sentence !== "") item.exampleSentence = cells.example_sentence;
  (level ? level.vocabulary : lesson.vocabulary).push(item);
}

function getOrCreateLesson(language, cells, row, error) {
  let lesson = language.lessons.get(cells.lesson_id);
  if (!lesson) {
    lesson = {
      firstRow: row,
      id: cells.lesson_id,
      categoryId: cells.category_id,
      title: cells.lesson_title,
      description: cells.lesson_description,
      difficulty: cells.difficulty,
      tags: splitTags(cells.lesson_tags),
      vocabulary: [],
      levels: new Map(),
      itemsSeen: new Map(),
    };
    language.lessons.set(cells.lesson_id, lesson);
    return lesson;
  }
  checkConsistent(
    `lesson "${lesson.id}"`,
    lesson.firstRow,
    row,
    [
      ["lesson_title", lesson.title, cells.lesson_title],
      ["lesson_description", lesson.description, cells.lesson_description],
      ["difficulty", lesson.difficulty, cells.difficulty],
      ["lesson_tags", joinTags(lesson.tags), joinTags(splitTags(cells.lesson_tags))],
      ["category_id", lesson.categoryId, cells.category_id],
    ],
    error
  );
  return lesson;
}

function getOrCreateLevel(lesson, cells, row, error) {
  let level = lesson.levels.get(cells.level_number);
  if (!level) {
    level = {
      firstRow: row,
      level: cells.level_number,
      title: cells.level_title,
      description: cells.level_description,
      exerciseType: cells.exercise_type,
      vocabulary: [],
      conversation: [],
    };
    lesson.levels.set(cells.level_number, level);
    return level;
  }
  checkConsistent(
    `lesson "${lesson.id}" level ${level.level}`,
    level.firstRow,
    row,
    [
      ["level_title", level.title, cells.level_title],
      ["level_description", level.description, cells.level_description],
      ["exercise_type", level.exerciseType, cells.exercise_type],
    ],
    error
  );
  return level;
}

function finishLesson(lesson, error, warn) {
  const levelNumbers = [...lesson.levels.keys()].sort((a, b) => a - b);
  const expected = levelNumbers.map((_, index) => index + 1);
  if (levelNumbers.join(",") !== expected.join(",")) {
    error(
      lesson.firstRow,
      `lesson "${lesson.id}" levels must run 1, 2, 3, … with no gaps (found ${levelNumbers.join(", ")})`
    );
  }
  for (const levelNumber of levelNumbers) {
    const level = lesson.levels.get(levelNumber);
    if (level.exerciseType === "fill-blank") {
      const hasBlank = level.vocabulary.some((item) => (item.exampleSentence ?? "").includes("___"));
      if (!hasBlank) {
        error(
          level.firstRow,
          `fill-blank level ${level.level} ("${level.title}") of lesson "${lesson.id}" needs at least one word ` +
            "whose example_sentence contains ___ (the blank the learner fills in); words without one are " +
            "used as extra answer options"
        );
      }
    }
    if (level.exerciseType === "conversation" && level.conversation.length === 0) {
      error(
        level.firstRow,
        `conversation level ${level.level} ("${level.title}") of lesson "${lesson.id}" has no conversation ` +
          'lines — add rows with turn_speaker set to "them" or "user"'
      );
    }
    if (level.exerciseType !== "conversation" && level.conversation.length > 0) {
      warn(
        level.firstRow,
        `level ${level.level} ("${level.title}") of lesson "${lesson.id}" has conversation lines but its ` +
          `exercise_type is "${level.exerciseType}" — did you mean "conversation"?`
      );
    }
  }
  if (lesson.vocabulary.length === 0) {
    warn(
      lesson.firstRow,
      `lesson "${lesson.id}" has no level 0 rows — level 0 is the lesson's full word list shown on the ` +
        "lesson overview page"
    );
  }
}

function buildLesson(lesson) {
  const content = { vocabulary: lesson.vocabulary };
  const levelNumbers = [...lesson.levels.keys()].sort((a, b) => a - b);
  if (levelNumbers.length > 0) {
    content.levels = levelNumbers.map((levelNumber) => {
      const level = lesson.levels.get(levelNumber);
      const built = {
        level: level.level,
        title: level.title,
        description: level.description,
        exerciseType: level.exerciseType,
        vocabulary: level.vocabulary,
      };
      if (level.conversation.length > 0) built.conversation = level.conversation;
      return built;
    });
  }
  return {
    id: lesson.id,
    categoryId: lesson.categoryId,
    title: lesson.title,
    description: lesson.description,
    difficulty: lesson.difficulty,
    tags: lesson.tags,
    content,
  };
}

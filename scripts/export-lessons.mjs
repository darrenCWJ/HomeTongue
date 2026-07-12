// Export a language's lesson curriculum to CSV for editing in Google Sheets.
//
// Usage:
//   node scripts/export-lessons.mjs <languageCode> [outFile]
//   pnpm lessons:export <languageCode> [outFile]
//
// Default outFile: lessons-<languageCode>.csv in the current directory.
// The file is written as UTF-8 WITH BOM so Excel / Google Sheets open the
// CJK text correctly. Re-import edits with scripts/import-lessons.mjs.
// See docs/LESSON_AUTHORING.md for the full admin workflow.

import { writeFileSync } from "fs";
import { resolve } from "path";
import { contentToRows, stringifyCsv, KNOWN_LANGUAGE_CODES } from "./lib/lessonCsv.mjs";
import { loadLessonRegistry } from "./lib/loadLessons.mjs";

const [languageCode, outArg] = process.argv.slice(2);
if (!languageCode) {
  console.error("Usage: node scripts/export-lessons.mjs <languageCode> [outFile]");
  console.error(`Known language codes: ${KNOWN_LANGUAGE_CODES.join(", ")}`);
  process.exit(1);
}

const { getLessonContent } = await loadLessonRegistry();
const content = getLessonContent(languageCode);
if (content.lessons.length === 0) {
  const withLessons = KNOWN_LANGUAGE_CODES.filter((code) => getLessonContent(code).lessons.length > 0);
  console.error(`No lessons are registered for "${languageCode}".`);
  console.error(`Languages with lessons: ${withLessons.join(", ") || "(none)"}`);
  process.exit(1);
}

let records;
try {
  records = contentToRows(languageCode, content);
} catch (err) {
  console.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

const UTF8_BOM = String.fromCharCode(0xfeff); // lets Excel/Sheets detect UTF-8 and render CJK correctly
const outFile = resolve(outArg ?? `lessons-${languageCode}.csv`);
writeFileSync(outFile, UTF8_BOM + stringifyCsv(records), "utf8");

const levelCount = content.lessons.reduce((sum, lesson) => sum + (lesson.content.levels?.length ?? 0), 0);
const dataRows = records.length - 1;
const speakerColumn = records[0].indexOf("turn_speaker");
const turnRows = records.slice(1).filter((record) => record[speakerColumn] !== "").length;
console.log(`Exported ${languageCode}: ${content.categories.length} categories, ${content.lessons.length} lessons, ${levelCount} levels.`);
console.log(`${dataRows} rows (${dataRows - turnRows} word rows, ${turnRows} conversation lines) -> ${outFile}`);
console.log("Open it in Google Sheets, edit, then File > Download > CSV and re-import with:");
console.log(`  pnpm lessons:import <file.csv>            (check only)`);
console.log(`  pnpm lessons:import <file.csv> --write    (regenerate src/data/lessons/${languageCode}/)`);

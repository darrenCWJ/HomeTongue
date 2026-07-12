// Validate a lesson CSV and (optionally) regenerate src/data/lessons/<code>/.
//
// Usage:
//   node scripts/import-lessons.mjs <csvFile>            dry run (default): parse,
//                                                        validate, print a summary,
//                                                        exit 1 on errors
//   node scripts/import-lessons.mjs <csvFile> --write    additionally regenerate the
//                                                        per-language lesson modules
//
// --write overwrites the .ts files the pipeline owns inside
// src/data/lessons/<code>/ (and deletes stale ones). If the language folder is
// not wired into src/data/lessons.ts yet, the registry is NOT touched — the
// exact snippet to add is printed instead. See docs/LESSON_AUTHORING.md.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { parseCsv, rowsToContent, generateModules } from "./lib/lessonCsv.mjs";
import { constSuffix } from "./lib/lessonSchema.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const write = args.includes("--write");
const csvFile = args.find((arg) => !arg.startsWith("--"));
if (!csvFile) {
  console.error("Usage: node scripts/import-lessons.mjs <csvFile> [--write]");
  process.exit(1);
}
if (!existsSync(csvFile)) {
  console.error(`File not found: ${resolve(csvFile)}`);
  process.exit(1);
}

let result;
try {
  result = rowsToContent(parseCsv(readFileSync(csvFile, "utf8")));
} catch (err) {
  console.error(`Could not read the CSV: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

printSummary(result);

if (result.errors.length > 0) {
  console.error(`\nResult: FAILED with ${result.errors.length} error(s) — fix the rows above and re-run.`);
  process.exit(1);
}
if (Object.keys(result.byLanguage).length === 0) {
  console.error("\nResult: FAILED — the CSV contains no lesson rows.");
  process.exit(1);
}

if (!write) {
  console.log("\nResult: OK (dry run). Re-run with --write to regenerate the lesson modules.");
  process.exit(0);
}

for (const [languageCode, content] of Object.entries(result.byLanguage)) {
  await writeLanguage(languageCode, content);
}
console.log("\nDone. Now run: pnpm typecheck && pnpm test");

// ── helpers ─────────────────────────────────────────────────────────────────

function printSummary(summary) {
  const languages = Object.entries(summary.byLanguage);
  for (const [code, content] of languages) {
    const levels = content.lessons.reduce((sum, lesson) => sum + (lesson.content.levels?.length ?? 0), 0);
    const words = content.lessons.reduce(
      (sum, lesson) =>
        sum +
        lesson.content.vocabulary.length +
        (lesson.content.levels ?? []).reduce((n, level) => n + level.vocabulary.length, 0),
      0
    );
    const turns = content.lessons.reduce(
      (sum, lesson) =>
        sum + (lesson.content.levels ?? []).reduce((n, level) => n + (level.conversation?.length ?? 0), 0),
      0
    );
    console.log(
      `${code}: ${content.categories.length} categories, ${content.lessons.length} lessons, ` +
        `${levels} levels, ${words} word rows, ${turns} conversation lines`
    );
  }
  if (summary.warnings.length > 0) {
    console.log(`\nWarnings (${summary.warnings.length}):`);
    for (const warning of summary.warnings) console.log(`  row ${warning.row}: ${warning.message}`);
  }
  if (summary.errors.length > 0) {
    console.error(`\nErrors (${summary.errors.length}):`);
    for (const error of summary.errors) console.error(`  row ${error.row}: ${error.message}`);
  }
}

async function writeLanguage(languageCode, content) {
  let files;
  try {
    files = generateModules(languageCode, content);
  } catch (err) {
    console.error(`\n${languageCode}: cannot generate modules — ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  const folder = join(repoRoot, "src", "data", "lessons", languageCode);
  mkdirSync(folder, { recursive: true });
  const before = existsSync(folder) ? readdirSync(folder).filter((name) => name.endsWith(".ts")) : [];

  console.log(`\n${languageCode}: writing src/data/lessons/${languageCode}/`);
  for (const [name, source] of Object.entries(files)) {
    writeFileSync(join(folder, name), await formatTypescript(source, join(folder, name)), "utf8");
    console.log(`  wrote   ${name}`);
  }
  for (const name of before) {
    if (!(name in files)) {
      rmSync(join(folder, name));
      console.log(`  deleted ${name} (no longer generated)`);
    }
  }

  const registryPath = join(repoRoot, "src", "data", "lessons.ts");
  const registrySource = readFileSync(registryPath, "utf8");
  if (!new RegExp(`["']${languageCode}["']\\s*:`).test(registrySource)) {
    const suffix = constSuffix(languageCode);
    console.log(`\n${languageCode} is NOT wired into the registry yet. Add to src/data/lessons.ts:`);
    console.log(`  import { ${suffix}_LESSON_CONTENT } from "./lessons/${languageCode}";`);
    console.log("  // ...inside LESSON_CONTENT_BY_LANGUAGE:");
    console.log(`  "${languageCode}": ${suffix}_LESSON_CONTENT,`);
  }
}

/** Format generated TS with the repo's prettier config; fall back to the raw source. */
async function formatTypescript(source, filePath) {
  try {
    const mod = await import("prettier");
    const prettier = mod.default ?? mod;
    const config = (await prettier.resolveConfig(filePath)) ?? {};
    return await prettier.format(source, { ...config, parser: "typescript" });
  } catch (err) {
    console.warn(`  (prettier formatting skipped: ${err instanceof Error ? err.message : err})`);
    return source;
  }
}

// Type declarations for the pure lesson-CSV core the Content page reuses from
// the CLI pipeline. "@lesson-csv" is aliased to scripts/lib/lessonCsv.mjs in
// admin/vite.config.ts, so this is the SAME code that powers
// `pnpm lessons:import` — no duplicated validation logic.
//
// Keep these signatures in sync with the JSDoc contracts in
// scripts/lib/csv.mjs (parseCsv) and scripts/lib/lessonImport.mjs
// (rowsToContent). Only the browser-relevant exports are declared; the module
// also exports stringifyCsv/contentToRows/generateModules for the Node CLI.
declare module "@lesson-csv" {
  import type { LessonRegistryContent } from "../types";

  /** One validation finding, addressed to a spreadsheet row. */
  export interface LessonCsvIssue {
    /** 1-based CSV row number (header = row 1) — matches Google Sheets. */
    row: number;
    /** Plain-English description of the problem or concern. */
    message: string;
  }

  export interface LessonCsvImportResult {
    /** Registry-shaped content per language code (e.g. "yue-HK"). */
    byLanguage: Record<string, LessonRegistryContent>;
    /** Blocking problems; publishing must be refused while any exist. */
    errors: LessonCsvIssue[];
    /** Non-blocking concerns (e.g. rows not marked as reviewed). */
    warnings: LessonCsvIssue[];
  }

  /**
   * RFC-4180-ish CSV parser (quoted fields, "" escapes, embedded newlines,
   * BOM stripped). Throws a plain-English Error on an unclosed quote.
   */
  export function parseCsv(text: string): string[][];

  /**
   * Parsed CSV records (header row first) -> registry-shaped content per
   * language, collecting ALL errors and warnings (never fail-fast).
   */
  export function rowsToContent(records: string[][]): LessonCsvImportResult;

  /** Language codes the pipeline accepts (from api/_lib/languageManifest.js). */
  export const KNOWN_LANGUAGE_CODES: string[];
}

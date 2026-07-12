// Hand-rolled RFC-4180-ish CSV parser/stringifier for the lesson spreadsheet
// pipeline (no dependencies). Quoted fields may contain commas, double quotes
// ("" escapes a quote) and embedded newlines; both \n and \r\n line endings
// are accepted. A leading UTF-8 BOM is stripped.
//
// Part of the pure lesson-CSV core — no file I/O here (see lessonCsv.mjs).

/**
 * Parse CSV text into an array of records (each record = array of field
 * strings). The header row, if any, is records[0] — callers decide.
 * Throws a plain-English Error when the text ends inside an unclosed quote.
 *
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records = [];
  let record = [];
  let field = "";
  let inQuotes = false;
  let sawAnything = false;

  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
    sawAnything = false;
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
      sawAnything = true;
      continue;
    }
    if (ch === ",") {
      pushField();
      sawAnything = true;
      continue;
    }
    if (ch === "\r") {
      if (src[i + 1] === "\n") i++;
      pushRecord();
      continue;
    }
    if (ch === "\n") {
      pushRecord();
      continue;
    }
    field += ch;
    sawAnything = true;
  }
  if (inQuotes) {
    throw new Error(
      'the CSV ends inside an unclosed quoted field — check for a stray double quote (") near the end of the file'
    );
  }
  if (field !== "" || record.length > 0 || sawAnything) pushRecord();
  return records;
}

/**
 * Stringify records back to CSV text. Fields containing commas, quotes or
 * newlines are quoted, with " escaped as "". Lines end with \r\n so the file
 * opens cleanly in Excel and Google Sheets.
 *
 * @param {(string | number)[][]} records
 * @returns {string}
 */
export function stringifyCsv(records) {
  return records.map((record) => record.map(escapeCsvField).join(",")).join("\r\n") + "\r\n";
}

/** @param {string | number | null | undefined} value */
function escapeCsvField(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}

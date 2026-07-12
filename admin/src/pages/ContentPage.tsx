import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { parseCsv, rowsToContent, KNOWN_LANGUAGE_CODES } from "@lesson-csv";
import type { LessonCsvImportResult } from "@lesson-csv";
import type { LessonContentRow } from "../types";
import {
  fetchLessonContentRows,
  publishLessonContent,
  setLessonContentPublished,
} from "../lib/contentApi";
import { CsvSummaryCard, type PublishState } from "../components/content/CsvSummaryCard";
import { PublishedListCard } from "../components/content/PublishedListCard";

interface ContentPageProps {
  /** auth user id of the signed-in admin — recorded as lesson_content.updated_by. */
  adminId: string;
}

/**
 * Lesson content publishing: upload a lesson CSV (authored in Google Sheets,
 * see docs/LESSON_AUTHORING.md), validate it in the browser with the SAME
 * pure core the CLI pipeline uses (scripts/lib/lessonCsv.mjs via the
 * "@lesson-csv" alias), then publish per language into public.lesson_content
 * (migration 0008) — live for cloud-mode app users without a deploy.
 */
export function ContentPage({ adminId }: ContentPageProps) {
  const [rows, setRows] = useState<LessonContentRow[] | null>(null);
  const [rowsError, setRowsError] = useState<string | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [result, setResult] = useState<LessonCsvImportResult | null>(null);
  const [publishStates, setPublishStates] = useState<Record<string, PublishState>>({});

  const [togglingCode, setTogglingCode] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setRowsError(null);
    setRows(null);
    try {
      setRows(await fetchLessonContentRows());
    } catch (err) {
      setRowsError(err instanceof Error ? err.message : "Failed to load published content");
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  /** Merge one fresh row into the list, keeping it sorted by language code. */
  const upsertRow = useCallback((row: LessonContentRow) => {
    setRows((current) => {
      const rest = (current ?? []).filter((r) => r.language_code !== row.language_code);
      return [...rest, row].sort((a, b) => a.language_code.localeCompare(b.language_code));
    });
  }, []);

  const handleFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so re-selecting the same file (after fixing it in Sheets) re-fires.
    event.target.value = "";
    if (!file) return;

    setFileName(file.name);
    setResult(null);
    setReadError(null);
    setPublishStates({});
    try {
      const text = await file.text();
      setResult(rowsToContent(parseCsv(text)));
    } catch (err) {
      setReadError(err instanceof Error ? err.message : "Could not read the CSV file");
    }
  }, []);

  const handlePublish = useCallback(
    async (languageCode: string) => {
      const content = result?.byLanguage[languageCode];
      if (!content) return;
      setPublishStates((current) => ({ ...current, [languageCode]: { status: "publishing" } }));
      try {
        const row = await publishLessonContent(languageCode, content, adminId);
        setPublishStates((current) => ({
          ...current,
          [languageCode]: { status: "published", updatedAt: row.updated_at },
        }));
        upsertRow(row);
      } catch (err) {
        setPublishStates((current) => ({
          ...current,
          [languageCode]: {
            status: "error",
            message: err instanceof Error ? err.message : "Publish failed",
          },
        }));
      }
    },
    [result, adminId, upsertRow]
  );

  const handleToggle = useCallback(
    async (languageCode: string, published: boolean) => {
      setTogglingCode(languageCode);
      setToggleError(null);
      try {
        upsertRow(await setLessonContentPublished(languageCode, published, adminId));
      } catch (err) {
        setToggleError(err instanceof Error ? err.message : "Failed to update the published flag");
      } finally {
        setTogglingCode(null);
      }
    },
    [adminId, upsertRow]
  );

  return (
    <section className="page">
      <div className="page-toolbar">
        <div>
          <h2>Content</h2>
          <p className="subtle small">Lesson CSV upload &amp; instant publishing</p>
        </div>
        <button className="btn btn-secondary btn-small" onClick={() => void loadRows()}>
          Refresh
        </button>
      </div>

      <p className="note-banner">
        Published content is served to <strong>cloud-mode</strong> app users on their next app
        load. Local-mode users (no account) keep the built-in static lessons — the main app&apos;s
        database read side ships separately.
      </p>

      <div className="card upload-card">
        <h3>Upload a lesson CSV</h3>
        <p className="subtle small">
          Author in Google Sheets (see docs/LESSON_AUTHORING.md), then File &gt; Download &gt;
          Comma Separated Values (.csv). Validation runs in your browser — the same checker as{" "}
          <code>pnpm lessons:import</code>, with the row numbers you see in Sheets. Known
          languages: {KNOWN_LANGUAGE_CODES.join(", ")}.
        </p>
        <label className="btn btn-primary file-btn">
          Choose CSV file…
          <input
            type="file"
            accept=".csv,text/csv"
            className="file-input"
            onChange={(event) => void handleFileChange(event)}
          />
        </label>
        {readError && (
          <div className="error-banner">
            Could not read {fileName ?? "the file"}: {readError}
          </div>
        )}
      </div>

      {result && fileName && (
        <CsvSummaryCard
          fileName={fileName}
          result={result}
          publishStates={publishStates}
          onPublish={(code) => void handlePublish(code)}
        />
      )}

      <h3 className="section-title">Published languages</h3>
      {rowsError && (
        <div className="error-banner error-banner-row">
          <span>{rowsError}</span>
          <button className="btn btn-secondary btn-small" onClick={() => void loadRows()}>
            Retry
          </button>
        </div>
      )}
      {toggleError && <div className="error-banner">{toggleError}</div>}
      {rows === null && !rowsError && <p className="subtle loading-note">Loading published content…</p>}
      {rows !== null && (
        <PublishedListCard
          rows={rows}
          togglingCode={togglingCode}
          onToggle={(code, published) => void handleToggle(code, published)}
        />
      )}
    </section>
  );
}

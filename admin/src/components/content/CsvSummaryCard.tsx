import type { LessonCsvImportResult } from "@lesson-csv";
import { countContent, formatCounts } from "../../lib/lessonContentStats";
import { formatDate } from "../../lib/format";

export type PublishState =
  | { status: "publishing" }
  | { status: "published"; updatedAt: string }
  | { status: "error"; message: string };

interface CsvSummaryCardProps {
  fileName: string;
  result: LessonCsvImportResult;
  publishStates: Record<string, PublishState>;
  onPublish: (languageCode: string) => void;
}

/**
 * Validation outcome for an uploaded lesson CSV — the same summary the CLI
 * dry run prints (per-language counts, warnings, row-numbered errors), plus a
 * per-language Publish button. Errors block publishing entirely, mirroring
 * `pnpm lessons:import` exiting non-zero.
 */
export function CsvSummaryCard({ fileName, result, publishStates, onPublish }: CsvSummaryCardProps) {
  const languages = Object.entries(result.byLanguage);
  const hasErrors = result.errors.length > 0;
  const isEmpty = languages.length === 0;

  return (
    <div className="card summary-card">
      <h3>Validation — {fileName}</h3>

      {hasErrors && (
        <div className="error-banner">
          FAILED with {result.errors.length} error(s) — fix the rows below in your sheet, download
          a fresh CSV and upload it again. Nothing can be published until the file is clean.
        </div>
      )}
      {!hasErrors && isEmpty && (
        <div className="error-banner">FAILED — the CSV contains no lesson rows.</div>
      )}
      {!hasErrors && !isEmpty && (
        <p className="subtle small">
          Valid — {result.warnings.length === 0 ? "no warnings" : "check the warnings below"}, ready
          to publish per language.
        </p>
      )}

      {languages.length > 0 && (
        <ul className="language-summary">
          {languages.map(([code, content]) => {
            const state = publishStates[code];
            return (
              <li key={code} className="language-summary-row">
                <div className="language-summary-info">
                  <span className="badge badge-language">{code}</span>
                  <span className="small">{formatCounts(countContent(content))}</span>
                </div>
                {!hasErrors && (
                  <div className="language-summary-action">
                    {state?.status === "published" ? (
                      <span className="publish-success small">
                        Published — {formatDate(state.updatedAt)}
                      </span>
                    ) : (
                      <button
                        className="btn btn-primary btn-small"
                        disabled={state?.status === "publishing"}
                        onClick={() => onPublish(code)}
                      >
                        {state?.status === "publishing" ? "Publishing…" : `Publish ${code}`}
                      </button>
                    )}
                    {state?.status === "error" && (
                      <span className="inline-error">{state.message}</span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {result.errors.length > 0 && (
        <div>
          <span className="text-label">Errors ({result.errors.length})</span>
          <ul className="issue-list">
            {result.errors.map((issue, index) => (
              <li key={`${issue.row}-${index}`} className="issue-error">
                row {issue.row}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.warnings.length > 0 && (
        <div>
          <span className="text-label">Warnings ({result.warnings.length})</span>
          <ul className="issue-list">
            {result.warnings.map((issue, index) => (
              <li key={`${issue.row}-${index}`} className="issue-warning">
                row {issue.row}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

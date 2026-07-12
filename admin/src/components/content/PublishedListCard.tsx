import type { LessonContentRow } from "../../types";
import { countContent } from "../../lib/lessonContentStats";
import { formatDate } from "../../lib/format";

interface PublishedListCardProps {
  rows: LessonContentRow[];
  /** Language code with an in-flight publish-flag update, if any. */
  togglingCode: string | null;
  onToggle: (languageCode: string, published: boolean) => void;
}

/**
 * Current lesson_content rows: per language, the lesson/level counts inside
 * the stored jsonb, when it was last updated, and the published flag with an
 * Unpublish/Republish toggle (there is deliberately no delete — see 0008).
 */
export function PublishedListCard({ rows, togglingCode, onToggle }: PublishedListCardProps) {
  if (rows.length === 0) {
    return (
      <div className="card empty-state">
        <p>
          Nothing published yet — every language still serves its built-in static lessons. Upload
          a CSV above to publish for the first time.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <table className="stats-table content-table">
        <thead>
          <tr>
            <th>Language</th>
            <th>Content</th>
            <th>Updated</th>
            <th>Status</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const counts = countContent(row.content);
            return (
              <tr key={row.language_code}>
                <td>
                  <span className="badge badge-language">{row.language_code}</span>
                </td>
                <td className="content-counts">
                  {counts.lessons} lessons · {counts.levels} levels
                </td>
                <td className="content-date">{formatDate(row.updated_at)}</td>
                <td>
                  <span className={`badge ${row.published ? "badge-published" : "badge-unpublished"}`}>
                    {row.published ? "published" : "unpublished"}
                  </span>
                </td>
                <td className="content-action">
                  <button
                    className="btn btn-secondary btn-small"
                    disabled={togglingCode === row.language_code}
                    onClick={() => onToggle(row.language_code, !row.published)}
                  >
                    {togglingCode === row.language_code
                      ? "Saving…"
                      : row.published
                        ? "Unpublish"
                        : "Republish"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="subtle small content-footnote">
        Unpublished languages fall back to the app&apos;s built-in static lessons; the stored
        content stays here and can be republished any time.
      </p>
    </div>
  );
}

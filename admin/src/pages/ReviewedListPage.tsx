import { useCallback, useEffect, useState } from "react";
import type { ReviewedEntry } from "../types";
import { fetchReviewedEntries } from "../lib/reviewApi";
import { formatDate } from "../lib/format";

const REVIEWED_LIST_LIMIT = 50;

/** Read-only list of the most recent reviews with their verdicts. */
export function ReviewedListPage() {
  const [entries, setEntries] = useState<ReviewedEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setEntries(null);
    try {
      const rows = await fetchReviewedEntries(REVIEWED_LIST_LIMIT);
      setEntries(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reviewed samples");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="error-banner error-banner-row">
        <span>{error}</span>
        <button className="btn btn-secondary btn-small" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  if (entries === null) {
    return <p className="subtle loading-note">Loading reviewed samples…</p>;
  }

  if (entries.length === 0) {
    return (
      <div className="card empty-state">
        <p>No samples have been reviewed yet.</p>
      </div>
    );
  }

  return (
    <>
      <p className="subtle small">Showing the {Math.min(entries.length, REVIEWED_LIST_LIMIT)} most recent reviews.</p>
      {entries.map(({ review, sample }) => (
        <article key={review.sample_id} className="card reviewed-card">
          <div className="card-meta">
            <span className={`badge badge-verdict-${review.verdict}`}>{review.verdict}</span>
            {sample && <span className="badge badge-language">{sample.language}</span>}
            {sample && <span className={`badge badge-source-${sample.source}`}>{sample.source}</span>}
            <span className="card-date">reviewed {formatDate(review.created_at)}</span>
          </div>

          {sample ? (
            <div className="text-pair">
              {sample.expected_text && (
                <div className="text-block">
                  <span className="text-label">Expected</span>
                  <p className="text-content">{sample.expected_text}</p>
                </div>
              )}
              <div className="text-block">
                <span className="text-label">Transcript (STT)</span>
                <p className="text-content">{sample.transcript}</p>
              </div>
            </div>
          ) : (
            <p className="subtle small">Original sample no longer exists.</p>
          )}

          {review.corrected_text && (
            <div className="text-block">
              <span className="text-label">Admin correction</span>
              <p className="text-content">{review.corrected_text}</p>
            </div>
          )}
          {review.notes && (
            <div className="text-block">
              <span className="text-label">Notes</span>
              <p className="text-content">{review.notes}</p>
            </div>
          )}
        </article>
      ))}
    </>
  );
}

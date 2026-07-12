import { useCallback, useEffect, useState } from "react";
import type { ReviewVerdict, SpeechSample } from "../types";
import { fetchReviewedSampleIds, fetchUnreviewedPage } from "../lib/reviewApi";
import { SampleCard } from "../components/SampleCard";
import { ReviewedListPage } from "./ReviewedListPage";

const PAGE_SIZE = 20;

interface ReviewQueuePageProps {
  reviewerId: string;
}

/**
 * Core surface: unreviewed speech_samples (no sample_reviews row yet),
 * newest first. Reviewed IDs are fetched once and filtered client-side.
 */
export function ReviewQueuePage({ reviewerId }: ReviewQueuePageProps) {
  const [reviewedIds, setReviewedIds] = useState<ReadonlySet<string> | null>(null);
  const [queue, setQueue] = useState<SpeechSample[]>([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [showReviewed, setShowReviewed] = useState(false);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ids = await fetchReviewedSampleIds();
      const page = await fetchUnreviewedPage(ids, 0, PAGE_SIZE);
      setReviewedIds(ids);
      setQueue(page.samples);
      setNextOffset(page.nextOffset);
      setHasMore(page.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the review queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (!reviewedIds) return;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchUnreviewedPage(reviewedIds, nextOffset, PAGE_SIZE);
      setQueue((current) => [...current, ...page.samples]);
      setNextOffset(page.nextOffset);
      setHasMore(page.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more samples");
    } finally {
      setLoading(false);
    }
  }, [reviewedIds, nextOffset]);

  const handleReviewed = useCallback((sampleId: string, _verdict: ReviewVerdict) => {
    setQueue((current) => current.filter((sample) => sample.id !== sampleId));
    setReviewedIds((current) => {
      const next = new Set(current ?? []);
      next.add(sampleId);
      return next;
    });
    setSessionCount((count) => count + 1);
  }, []);

  return (
    <section className="page">
      <div className="page-toolbar">
        <div>
          <h2>{showReviewed ? "Reviewed samples" : "Review queue"}</h2>
          <p className="subtle">Reviewed this session: {sessionCount}</p>
        </div>
        <button className="btn btn-secondary" onClick={() => setShowReviewed((value) => !value)}>
          {showReviewed ? "Back to queue" : "View reviewed"}
        </button>
      </div>

      {showReviewed ? (
        <ReviewedListPage />
      ) : (
        <>
          {error && (
            <div className="error-banner error-banner-row">
              <span>{error}</span>
              <button className="btn btn-secondary btn-small" onClick={() => void loadInitial()}>
                Retry
              </button>
            </div>
          )}

          {queue.map((sample) => (
            <SampleCard key={sample.id} sample={sample} reviewerId={reviewerId} onReviewed={handleReviewed} />
          ))}

          {!loading && !error && queue.length === 0 && (
            <div className="card empty-state">
              <p>The queue is clear — every sample has a review. Nice work.</p>
            </div>
          )}

          {loading && <p className="subtle loading-note">Loading samples…</p>}

          {!loading && hasMore && (
            <button className="btn btn-secondary load-more" onClick={() => void loadMore()}>
              Load more
            </button>
          )}
        </>
      )}
    </section>
  );
}

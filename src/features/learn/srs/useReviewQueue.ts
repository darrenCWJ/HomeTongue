import { useCallback, useEffect, useMemo, useState } from "react";
import { useLibrary } from "../../../app/context/LibraryProvider";
import { repositories } from "../../../repositories";
import { filterByLanguage } from "../../../languages/scope";
import { useActiveLanguageCode } from "../../../hooks/useActiveLanguageCode";
import type { Phrase, PhraseReviewState, ReviewGrade } from "../../../types";
import { applyReviewGrade, createInitialReviewState, isDue } from "./scheduler";

// Small SRS glue hook. Deliberately reads phrases via useLibrary but talks to
// the review-state repository directly — review scheduling is a learn-feature
// concern and must not grow LibraryProvider's surface.

export interface ReviewCard {
  phrase: Phrase;
  state: PhraseReviewState;
  /** True when the phrase has never been graded (enters the queue now). */
  isNew: boolean;
}

export interface ReviewQueue {
  /** Bookmarked phrases that are new or due for review, soonest-due first. */
  dueCards: ReviewCard[];
  dueCount: number;
  totalBookmarked: number;
  isLoading: boolean;
  loadError: string | null;
  /** Grade a card, persist the new schedule, and return the next state. */
  gradeCard: (card: ReviewCard, grade: ReviewGrade) => PhraseReviewState;
}

export function useReviewQueue(): ReviewQueue {
  const { phrases } = useLibrary();
  const activeLanguageCode = useActiveLanguageCode();
  const [states, setStates] = useState<Record<string, PhraseReviewState>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    repositories.reviewStates
      .getAll()
      .then((rows) => {
        if (cancelled) return;
        setStates(Object.fromEntries(rows.map((row) => [row.phraseId, row])));
        setIsLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("[srs] failed to load review states:", error);
        setLoadError("Could not load your practice schedule.");
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The practice queue is scoped to the active language so a dialect switch
  // never mixes review cards from different packs.
  const bookmarked = useMemo(
    () => filterByLanguage(phrases, activeLanguageCode).filter((p) => p.isBookmarked),
    [phrases, activeLanguageCode]
  );

  const dueCards = useMemo<ReviewCard[]>(() => {
    const now = new Date();
    return bookmarked
      .map((phrase) => {
        const existing = states[phrase.id];
        return {
          phrase,
          state: existing ?? createInitialReviewState(phrase.id, now),
          isNew: !existing,
        };
      })
      .filter((card) => card.isNew || isDue(card.state, now))
      .sort((a, b) => Date.parse(a.state.due) - Date.parse(b.state.due));
  }, [bookmarked, states]);

  const gradeCard = useCallback((card: ReviewCard, grade: ReviewGrade): PhraseReviewState => {
    const next = applyReviewGrade(card.state, grade, new Date());
    setStates((prev) => ({ ...prev, [next.phraseId]: next }));
    repositories.reviewStates.put(next).catch((error: unknown) => {
      // The in-memory queue already advanced; losing one write only means the
      // card comes back a little early next session. Log for diagnostics.
      console.error("[srs] failed to persist review state:", error);
    });
    return next;
  }, []);

  return {
    dueCards,
    dueCount: dueCards.length,
    totalBookmarked: bookmarked.length,
    isLoading,
    loadError,
    gradeCard,
  };
}

import type { PhraseReviewState, ReviewGrade } from "../../../types";

// ─── SM-2-lite spaced-repetition scheduler ───────────────────────────────────
//
// Pure functions only — no I/O, no Date.now() side effects (callers pass
// `now`). Persistence lives in src/repositories/local/ReviewStateRepository.ts
// and the queue-building React glue in ./useReviewQueue.ts.
//
// The algorithm is a simplified SuperMemo-2:
//   * again → forgot: reps reset, interval drops to 0 (due immediately so the
//     card comes back within the same practice session), ease penalised.
//   * hard  → recalled with effort: small interval growth, ease penalised.
//   * good  → recalled: graduated steps 1d → 3d, then interval × ease.
//   * easy  → trivial: bigger jump (interval × ease × bonus), ease rewarded.

export const MIN_EASE = 1.3;
export const MAX_EASE = 3.0;
export const DEFAULT_EASE = 2.5;
export const MAX_INTERVAL_DAYS = 365;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Graduated intervals (days) for the first two successful "good" reviews. */
const FIRST_GOOD_INTERVAL_DAYS = 1;
const SECOND_GOOD_INTERVAL_DAYS = 3;
/** First-review interval when the card was rated "easy" straight away. */
const FIRST_EASY_INTERVAL_DAYS = 3;
/** "hard" grows the interval slowly instead of multiplying by ease. */
const HARD_INTERVAL_MULTIPLIER = 1.2;
/** Extra multiplier applied on top of ease for "easy" reviews. */
const EASY_INTERVAL_BONUS = 1.3;

const EASE_DELTA: Record<ReviewGrade, number> = {
  again: -0.2,
  hard: -0.15,
  good: 0,
  easy: 0.15,
};

function clampEase(ease: number): number {
  return Math.min(MAX_EASE, Math.max(MIN_EASE, ease));
}

function clampInterval(days: number): number {
  return Math.min(MAX_INTERVAL_DAYS, Math.max(0, days));
}

/** A brand-new card: due immediately, default ease, no history. */
export function createInitialReviewState(phraseId: string, now: Date = new Date()): PhraseReviewState {
  const iso = now.toISOString();
  return {
    phraseId,
    due: iso,
    intervalDays: 0,
    ease: DEFAULT_EASE,
    reps: 0,
    lapses: 0,
    updatedAt: iso,
  };
}

/** True when the card should appear in the review queue at `now`. */
export function isDue(state: PhraseReviewState, now: Date = new Date()): boolean {
  const dueMs = Date.parse(state.due);
  // Unparseable due dates are treated as due so a corrupt record can never
  // silently drop a card out of rotation forever.
  return Number.isNaN(dueMs) || dueMs <= now.getTime();
}

/**
 * Apply one review grade and return the NEXT state (input is never mutated).
 */
export function applyReviewGrade(
  state: PhraseReviewState,
  grade: ReviewGrade,
  now: Date = new Date()
): PhraseReviewState {
  const nowIso = now.toISOString();
  const ease = clampEase(state.ease + EASE_DELTA[grade]);

  if (grade === "again") {
    return {
      ...state,
      ease,
      intervalDays: 0,
      reps: 0,
      // Only count a lapse when the card had actually been learned before.
      lapses: state.reps > 0 ? state.lapses + 1 : state.lapses,
      due: nowIso,
      updatedAt: nowIso,
    };
  }

  let intervalDays: number;
  if (grade === "hard") {
    intervalDays =
      state.reps === 0
        ? FIRST_GOOD_INTERVAL_DAYS
        : Math.max(1, Math.round(state.intervalDays * HARD_INTERVAL_MULTIPLIER));
  } else if (grade === "good") {
    if (state.reps === 0) {
      intervalDays = FIRST_GOOD_INTERVAL_DAYS;
    } else if (state.reps === 1) {
      intervalDays = Math.max(SECOND_GOOD_INTERVAL_DAYS, state.intervalDays + 1);
    } else {
      intervalDays = Math.max(state.intervalDays + 1, Math.round(state.intervalDays * ease));
    }
  } else {
    // easy
    intervalDays =
      state.reps === 0
        ? FIRST_EASY_INTERVAL_DAYS
        : Math.max(state.intervalDays + 1, Math.round(state.intervalDays * ease * EASY_INTERVAL_BONUS));
  }

  intervalDays = clampInterval(intervalDays);

  return {
    ...state,
    ease,
    intervalDays,
    reps: state.reps + 1,
    due: new Date(now.getTime() + intervalDays * MS_PER_DAY).toISOString(),
    updatedAt: nowIso,
  };
}

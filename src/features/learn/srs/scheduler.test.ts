import { describe, test, expect } from "vitest";
import {
  applyReviewGrade,
  createInitialReviewState,
  isDue,
  DEFAULT_EASE,
  MIN_EASE,
  MAX_EASE,
  MAX_INTERVAL_DAYS,
} from "./scheduler";
import type { PhraseReviewState } from "../../../types";

const NOW = new Date("2026-07-12T12:00:00.000Z");

const daysBetween = (fromIso: string, toIso: string): number =>
  (Date.parse(toIso) - Date.parse(fromIso)) / (24 * 60 * 60 * 1000);

const state = (overrides: Partial<PhraseReviewState> = {}): PhraseReviewState => ({
  ...createInitialReviewState("phrase-1", NOW),
  ...overrides,
});

describe("createInitialReviewState", () => {
  test("returns a new card due immediately with default ease", () => {
    const s = createInitialReviewState("p1", NOW);
    expect(s).toStrictEqual({
      phraseId: "p1",
      due: NOW.toISOString(),
      intervalDays: 0,
      ease: DEFAULT_EASE,
      reps: 0,
      lapses: 0,
      updatedAt: NOW.toISOString(),
    });
  });
});

describe("isDue", () => {
  test("new cards are due immediately", () => {
    expect(isDue(state(), NOW)).toBe(true);
  });

  test("cards scheduled in the future are not due", () => {
    const graded = applyReviewGrade(state(), "good", NOW);
    expect(isDue(graded, NOW)).toBe(false);
  });

  test("cards become due once their due date passes", () => {
    const graded = applyReviewGrade(state(), "good", NOW);
    const later = new Date(Date.parse(graded.due) + 1);
    expect(isDue(graded, later)).toBe(true);
  });

  test("treats an unparseable due date as due instead of dropping the card", () => {
    expect(isDue(state({ due: "not a date" }), NOW)).toBe(true);
  });
});

describe("applyReviewGrade — again", () => {
  test("resets reps and interval and keeps the card due now", () => {
    const learned = state({ reps: 3, intervalDays: 10, due: "2026-08-01T00:00:00.000Z" });
    const next = applyReviewGrade(learned, "again", NOW);
    expect(next.reps).toBe(0);
    expect(next.intervalDays).toBe(0);
    expect(next.due).toBe(NOW.toISOString());
    expect(isDue(next, NOW)).toBe(true);
  });

  test("penalises ease but never drops below the floor", () => {
    const next = applyReviewGrade(state({ ease: MIN_EASE + 0.05 }), "again", NOW);
    expect(next.ease).toBe(MIN_EASE);
  });

  test("counts a lapse only when the card had been learned", () => {
    const fresh = applyReviewGrade(state(), "again", NOW);
    expect(fresh.lapses).toBe(0);

    const learned = applyReviewGrade(state({ reps: 2, intervalDays: 3 }), "again", NOW);
    expect(learned.lapses).toBe(1);
  });
});

describe("applyReviewGrade — good", () => {
  test("graduates 1 day, then 3 days, then interval multiplied by ease", () => {
    const first = applyReviewGrade(state(), "good", NOW);
    expect(first.intervalDays).toBe(1);
    expect(first.reps).toBe(1);
    expect(daysBetween(NOW.toISOString(), first.due)).toBe(1);

    const second = applyReviewGrade(first, "good", NOW);
    expect(second.intervalDays).toBe(3);
    expect(second.reps).toBe(2);

    const third = applyReviewGrade(second, "good", NOW);
    expect(third.intervalDays).toBe(Math.round(3 * DEFAULT_EASE));
    expect(third.reps).toBe(3);
  });

  test("does not change ease", () => {
    const next = applyReviewGrade(state(), "good", NOW);
    expect(next.ease).toBe(DEFAULT_EASE);
  });
});

describe("applyReviewGrade — hard", () => {
  test("grows the interval slowly and penalises ease", () => {
    const mature = state({ reps: 3, intervalDays: 10, ease: 2.5 });
    const next = applyReviewGrade(mature, "hard", NOW);
    expect(next.intervalDays).toBe(12); // 10 × 1.2
    expect(next.ease).toBeCloseTo(2.35);
    expect(next.reps).toBe(4);
  });

  test("gives a 1-day interval on a brand-new card", () => {
    const next = applyReviewGrade(state(), "hard", NOW);
    expect(next.intervalDays).toBe(1);
  });
});

describe("applyReviewGrade — easy", () => {
  test("rewards ease and jumps further than good", () => {
    const mature = state({ reps: 3, intervalDays: 10, ease: 2.5 });
    const good = applyReviewGrade(mature, "good", NOW);
    const easy = applyReviewGrade(mature, "easy", NOW);
    expect(easy.intervalDays).toBeGreaterThan(good.intervalDays);
    expect(easy.ease).toBeCloseTo(2.65);
  });

  test("caps ease at the ceiling", () => {
    const next = applyReviewGrade(state({ ease: MAX_EASE }), "easy", NOW);
    expect(next.ease).toBe(MAX_EASE);
  });

  test("gives a 3-day interval on a brand-new card", () => {
    const next = applyReviewGrade(state(), "easy", NOW);
    expect(next.intervalDays).toBe(3);
  });
});

describe("applyReviewGrade — invariants", () => {
  test("interval never exceeds the cap", () => {
    const huge = state({ reps: 20, intervalDays: 400, ease: MAX_EASE });
    const next = applyReviewGrade(huge, "easy", NOW);
    expect(next.intervalDays).toBe(MAX_INTERVAL_DAYS);
  });

  test("successful grades always move the due date into the future", () => {
    for (const grade of ["hard", "good", "easy"] as const) {
      const next = applyReviewGrade(state(), grade, NOW);
      expect(Date.parse(next.due)).toBeGreaterThan(NOW.getTime());
    }
  });

  test("interval grows monotonically across consecutive good reviews", () => {
    let s = state();
    let previous = 0;
    for (let i = 0; i < 8; i++) {
      s = applyReviewGrade(s, "good", NOW);
      expect(s.intervalDays).toBeGreaterThan(previous);
      previous = s.intervalDays;
    }
  });

  test("does not mutate the input state", () => {
    const input = state({ reps: 2, intervalDays: 3, ease: 2.0, lapses: 1 });
    const snapshot = { ...input };
    applyReviewGrade(input, "again", NOW);
    applyReviewGrade(input, "easy", NOW);
    expect(input).toStrictEqual(snapshot);
  });
});

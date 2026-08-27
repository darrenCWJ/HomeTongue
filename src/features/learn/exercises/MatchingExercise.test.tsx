import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { LessonLevel } from "../../../types";
import { MatchingExercise } from "./MatchingExercise";

// LEARN-04 — a wrong pair schedules an 800ms reset that clears `wrong` AND
// `selectedEn`. The id was never stored, so nothing could cancel it: any
// selection the user made inside that window was silently wiped, and a batch
// advance scheduled on top of it left the stale reset to fire into the NEXT
// batch. The same unstored-timer problem let a completed last batch call
// onComplete after the exercise had already unmounted.

const LEVEL: LessonLevel = {
  level: 1,
  title: "Greetings",
  description: "",
  exerciseType: "matching",
  vocabulary: [
    { english: "hello", dialect: "你好", romanization: "nei5 hou2" },
    { english: "bye", dialect: "再見", romanization: "zoi3 gin3" },
    { english: "thanks", dialect: "唔該", romanization: "m4 goi1" },
  ],
};

vi.mock("../shared", () => ({
  PlayButtonDark: () => null,
}));

const click = (name: RegExp | string) => fireEvent.click(screen.getByRole("button", { name }));

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

function renderExercise() {
  const onComplete = vi.fn();
  const view = render(<MatchingExercise level={LEVEL} onComplete={onComplete} onBack={vi.fn()} />);
  return { onComplete, ...view };
}

/** Pair every English word with its dialect match, completing the only batch. */
function matchEveryPair() {
  click("hello");
  click(/你好/);
  click("bye");
  click(/再見/);
  click("thanks");
  click(/唔該/);
}

beforeEach(() => {
  vi.useFakeTimers();
  // The dialect column is shuffled with Math.random; a constant keeps the
  // comparator at 0 so the rendered order is stable across runs.
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("MatchingExercise wrong-pair timer", () => {
  test("a new English selection survives the previous wrong pair's reset", () => {
    renderExercise();

    // Wrong pair — schedules the 800ms reset.
    click("hello");
    click(/再見/);

    // The user immediately picks a different word, then the stale reset lands.
    click("bye");
    advance(800);

    // Their live selection must still be armed: its match lands.
    click(/再見/);
    expect(screen.getByRole("button", { name: "bye" })).toBeDisabled();
  });

  test("a second wrong tap restarts the window instead of inheriting the first one's timer", () => {
    renderExercise();

    click("hello");
    click(/再見/); // wrong #1 at t=0
    advance(400);
    click(/唔該/); // wrong #2 at t=400 — "hello" is still the live selection
    advance(500); // t=900: wrong #1's stale reset would have fired at t=800

    click(/你好/);
    expect(screen.getByRole("button", { name: "hello" })).toBeDisabled();
  });
});

describe("MatchingExercise completion timer", () => {
  test("completing the last batch finishes the level", () => {
    const { onComplete } = renderExercise();

    matchEveryPair();
    advance(600);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test("leaving before the completion delay elapses does not finish the level", () => {
    const { onComplete, unmount } = renderExercise();

    matchEveryPair();
    unmount();
    advance(600);

    expect(onComplete).not.toHaveBeenCalled();
  });
});

import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { VocabItem } from "../../../types";
import { ConvFlashcardExercise } from "./ConvFlashcardExercise";

// LEARN-07 (conversation-lesson half) — same unguarded 180ms exit-animation
// window as FlashcardExercise: taps inside it each ran a full advance against
// the same stale index.

const exitAnimations: Array<{ resolve: () => void }> = [];

const mockAnimate = vi.fn(() => {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  exitAnimations.push({ resolve });
  return promise;
});

vi.mock("motion/react", async () => {
  const actual = await vi.importActual<typeof import("motion/react")>("motion/react");
  return { ...actual, animate: (...args: unknown[]) => mockAnimate(...(args as [])) };
});

vi.mock("../shared", () => ({
  PlayButton: () => null,
}));

vi.mock("../../../app/context/LibraryProvider", () => ({
  useLibrary: () => ({ phrases: [], addPhrase: vi.fn(), toggleBookmark: vi.fn() }),
}));

vi.mock("../../../languages", () => ({
  getActiveLanguagePack: () => ({ code: "yue-HK" }),
}));

const vocabOf = (count: number): VocabItem[] =>
  Array.from({ length: count }, (_, i) => ({
    english: `word ${i + 1}`,
    dialect: `字${i + 1}`,
    romanization: `zi${i + 1}`,
  }));

async function settleAnimations() {
  await act(async () => {
    exitAnimations.splice(0).forEach((animation) => animation.resolve());
    await Promise.resolve();
  });
}

const click = (name: RegExp | string) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  exitAnimations.length = 0;
  mockAnimate.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("ConvFlashcardExercise advance guard", () => {
  test("double-tapping Finish completes the deck once", async () => {
    const onComplete = vi.fn();
    render(<ConvFlashcardExercise vocab={vocabOf(1)} onComplete={onComplete} />);

    click("Finish");
    click("Finish");
    await settleAnimations();

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  // A stopped motion tween never settles its promise (see FlashcardExercise's
  // note) — awaiting it bare would latch the guard and kill the deck.
  test("an exit animation that never settles does not freeze the deck", async () => {
    vi.useFakeTimers();
    try {
      render(<ConvFlashcardExercise vocab={vocabOf(3)} onComplete={vi.fn()} />);

      click("Next");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(screen.getByText("2 / 3")).toBeInTheDocument();

      click("Next");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(screen.getByText("3 / 3")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test("a Back tap chasing a Next tap is ignored instead of reversing it", async () => {
    render(<ConvFlashcardExercise vocab={vocabOf(3)} onComplete={vi.fn()} />);

    click("Next");
    await settleAnimations();
    expect(screen.getByText("2 / 3")).toBeInTheDocument();

    click("Next");
    click("Back");
    await settleAnimations();

    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });
});

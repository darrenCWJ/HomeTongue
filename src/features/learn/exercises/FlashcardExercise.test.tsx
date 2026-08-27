import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { LessonLevel } from "../../../types";
import { FlashcardExercise } from "./FlashcardExercise";

// LEARN-07 — goToCard awaits a 180ms exit animation before it moves `index`,
// and nothing guarded that window. Taps landing inside it each ran a full
// advance against the same stale index: two Finish taps fired onComplete
// twice, and a Back tap chasing a Next tap landed on whichever animation
// resolved last instead of being ignored.

const exitAnimations: Array<{ resolve: () => void }> = [];

/**
 * Stands in for motion's `animate`: returns a promise the test settles by
 * hand, so an advance can be held open across further taps.
 */
const mockAnimate = vi.fn(() => {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  exitAnimations.push({ resolve });
  return promise;
});

// Fully stubbed rather than importActual'd: these tests drive `animate`
// themselves and assert on rendered text, so the real barrel buys nothing and
// costs ~5s of import — the whole per-test budget, which risks a timeout under
// a loaded full-suite run.
vi.mock("motion/react", () => {
  const value = { set: () => {}, get: () => 0 };
  return {
    motion: {
      div: ({ children, className }: { children?: ReactNode; className?: string }) => (
        <div className={className}>{children}</div>
      ),
    },
    useMotionValue: () => value,
    animate: (...args: unknown[]) => mockAnimate(...(args as [])),
  };
});

vi.mock("../shared", () => ({
  PlayButton: () => null,
  personalise: (text: string) => text,
}));

vi.mock("../../../app/context/ProfileProvider", () => ({
  useProfile: () => ({ userProfile: null }),
}));

vi.mock("../../../app/context/LibraryProvider", () => ({
  useLibrary: () => ({ phrases: [], addPhrase: vi.fn(), toggleBookmark: vi.fn() }),
}));

vi.mock("../../../services/translationService", () => ({
  getExampleMeta: () => Promise.resolve({ translation: "", pronunciation: "" }),
}));

vi.mock("../../../languages", () => ({
  getActiveLanguagePack: () => ({ code: "yue-HK" }),
}));

function levelWith(count: number): LessonLevel {
  return {
    level: 1,
    title: "Greetings",
    description: "",
    exerciseType: "flashcard",
    vocabulary: Array.from({ length: count }, (_, i) => ({
      english: `word ${i + 1}`,
      dialect: `字${i + 1}`,
      romanization: `zi${i + 1}`,
    })),
  };
}

/** Settle every animation started so far — the advances they gate then run. */
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

describe("FlashcardExercise advance guard", () => {
  test("double-tapping Finish completes the deck once", async () => {
    const onComplete = vi.fn();
    render(<FlashcardExercise level={levelWith(1)} onComplete={onComplete} onBack={vi.fn()} />);

    click("Finish");
    click("Finish");
    await settleAnimations();

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test("a Back tap chasing a Next tap is ignored instead of reversing it", async () => {
    render(<FlashcardExercise level={levelWith(3)} onComplete={vi.fn()} onBack={vi.fn()} />);

    // Advance once so a Back button exists.
    click("Next");
    await settleAnimations();
    expect(screen.getByText("2 / 3")).toBeInTheDocument();

    // Both taps land inside the same exit animation.
    click("Next");
    click("Back");
    await settleAnimations();

    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });

  // motion resolves an animation's promise only on natural completion; a drag
  // landing inside the exit window stops the tween, and a stopped tween never
  // settles. Awaiting it bare would leave the guard latched and the whole deck
  // dead, so the wait has to be bounded.
  test("an exit animation that never settles does not freeze the deck", async () => {
    vi.useFakeTimers();
    try {
      render(<FlashcardExercise level={levelWith(3)} onComplete={vi.fn()} onBack={vi.fn()} />);

      // Tapped, then the tween is torn down mid-flight and never resolves.
      click("Next");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(screen.getByText("2 / 3")).toBeInTheDocument();

      // The deck must still take the next tap.
      click("Next");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(screen.getByText("3 / 3")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test("cards still advance one at a time when taps do not overlap", async () => {
    render(<FlashcardExercise level={levelWith(3)} onComplete={vi.fn()} onBack={vi.fn()} />);

    click("Next");
    await settleAnimations();
    click("Next");
    await settleAnimations();

    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });
});

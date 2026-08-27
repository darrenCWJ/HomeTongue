import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { VocabItem, WordChunk } from "../../../types";
import { PhraseBreakdownExercise } from "./PhraseBreakdownExercise";

// LEARN-06 — a single `isLoading` flag spanned every phrase, so one phrase's
// in-flight fetch put the spinner over ANY phrase the user navigated to and
// disabled Next there, even when that phrase's breakdown was already cached.
// Loading is per-phrase.

const mockGenerate = vi.fn();

vi.mock("../../../services/translationService", () => ({
  generateWordBreakdown: (...args: unknown[]) => mockGenerate(...args),
}));

vi.mock("../shared", () => ({
  PlayButtonDark: () => null,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const CACHED_CHUNK: WordChunk[] = [{ characters: "一杯", pronunciation: "jat1 bui1", meaning: "one cup" }];

const VOCAB: VocabItem[] = [
  {
    english: "one kopi",
    dialect: "一杯咖啡",
    romanization: "jat1 bui1 gaa3 fe1",
    breakdown: CACHED_CHUNK,
  },
  { english: "thank you", dialect: "唔該", romanization: "m4 goi1" },
];

const flush = () => act(async () => await Promise.resolve());

const click = (name: RegExp | string) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  mockGenerate.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("PhraseBreakdownExercise per-phrase loading", () => {
  test("a cached phrase renders immediately while another phrase is still loading", async () => {
    const pending = deferred<WordChunk[]>();
    mockGenerate.mockReturnValue(pending.promise);
    render(<PhraseBreakdownExercise vocab={VOCAB} onComplete={vi.fn()} />);

    // Phrase 1 was cached on the lesson, so its chunk is up right away.
    expect(screen.getByText("一杯")).toBeInTheDocument();

    // Phrase 2 has to be fetched.
    click(/next phrase/i);
    expect(screen.getByText(/breaking down the phrase/i)).toBeInTheDocument();

    // Going back must show the cached phrase, not phrase 2's spinner.
    click("Back");
    expect(screen.getByText("一杯")).toBeInTheDocument();
    expect(screen.queryByText(/breaking down the phrase/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next phrase/i })).toBeEnabled();
  });

  test("a fetched phrase renders its chunks once the request lands", async () => {
    const fetched: WordChunk[] = [{ characters: "該", pronunciation: "goi1", meaning: "ought to" }];
    mockGenerate.mockResolvedValue(fetched);
    const onComplete = vi.fn();
    render(<PhraseBreakdownExercise vocab={VOCAB} onComplete={onComplete} />);

    click(/next phrase/i);
    await flush();

    expect(screen.getByText("該")).toBeInTheDocument();
    click("Finish");
    expect(onComplete).toHaveBeenCalledWith({ 0: CACHED_CHUNK, 1: fetched });
  });

  test("navigating away and back does not refetch a phrase already in flight", async () => {
    const pending = deferred<WordChunk[]>();
    mockGenerate.mockReturnValue(pending.promise);
    render(<PhraseBreakdownExercise vocab={VOCAB} onComplete={vi.fn()} />);

    click(/next phrase/i);
    click("Back");
    click(/next phrase/i);

    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });
});

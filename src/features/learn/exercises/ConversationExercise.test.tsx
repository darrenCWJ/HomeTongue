import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { LessonLevel } from "../../../types";
import { ConversationExercise } from "./ConversationExercise";

// LEARN-09 — a conversation level with no turns rendered null, so the user
// stared at an empty pane with no way to finish or leave the level. Mirrors
// FillBlankExercise's empty state: say so, and offer the completion button.

vi.mock("../shared", () => ({
  PlayButton: () => null,
  PlayButtonDark: () => null,
}));

vi.mock("./ChatBubble", () => ({
  ChatBubble: () => null,
}));

const LEVEL: LessonLevel = {
  level: 1,
  title: "Ordering kopi",
  description: "",
  exerciseType: "conversation",
  vocabulary: [],
};

afterEach(() => {
  cleanup();
});

describe("ConversationExercise empty state", () => {
  test("a level with no conversation offers a way to complete it", () => {
    const onComplete = vi.fn();
    render(<ConversationExercise level={LEVEL} onComplete={onComplete} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /complete level/i }));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test("a level with turns still steps through them", () => {
    const onComplete = vi.fn();
    render(
      <ConversationExercise
        level={{
          ...LEVEL,
          conversation: [{ speaker: "them", dialect: "你好", romanization: "nei5 hou2", english: "hello" }],
        }}
        onComplete={onComplete}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByText("你好")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /complete conversation/i }));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

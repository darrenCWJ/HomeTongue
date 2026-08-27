import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ConversationLesson } from "../../../types";
import { ConversationLessonCard } from "./ConversationLessonCard";

// LEARN-11 — the rename draft was seeded from `lesson.title` at MOUNT, so a
// title that changed afterwards (renamed from another surface, a cloud
// reload) left the edit box holding the old text. Committing it then wrote
// the stale title back, silently reverting the newer one.

const LESSON: ConversationLesson = {
  id: "lesson-1",
  sessionId: "session-1",
  title: "Ordering kopi",
  createdAt: "2026-01-01T00:00:00.000Z",
  vocabulary: [{ english: "one kopi", dialect: "一杯咖啡", romanization: "jat1 bui1 gaa3 fe1" }],
  examCompleted: false,
  examAttempts: 0,
};

function renderCard(lesson: ConversationLesson = LESSON) {
  const onEditTitle = vi.fn();
  const view = render(
    <ConversationLessonCard lesson={lesson} onClick={vi.fn()} onDelete={vi.fn()} onEditTitle={onEditTitle} />
  );
  const rerenderWith = (next: ConversationLesson) =>
    view.rerender(
      <ConversationLessonCard lesson={next} onClick={vi.fn()} onDelete={vi.fn()} onEditTitle={onEditTitle} />
    );
  return { onEditTitle, rerenderWith };
}

function openEditor() {
  fireEvent.click(screen.getByRole("button", { name: /more options/i }));
  fireEvent.click(screen.getByRole("button", { name: /edit title/i }));
}

afterEach(() => {
  cleanup();
});

describe("ConversationLessonCard rename draft", () => {
  test("the draft is seeded from the current title, not the one at mount", () => {
    const { rerenderWith } = renderCard();

    // Renamed elsewhere while this card was on screen.
    rerenderWith({ ...LESSON, title: "Kopi run" });
    openEditor();

    expect(screen.getByRole("textbox")).toHaveValue("Kopi run");
  });

  test("committing an untouched draft does not revert a rename made elsewhere", () => {
    const { onEditTitle, rerenderWith } = renderCard();

    rerenderWith({ ...LESSON, title: "Kopi run" });
    openEditor();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(onEditTitle).not.toHaveBeenCalled();
  });

  test("an edited draft is committed", () => {
    const { onEditTitle } = renderCard();

    openEditor();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Kopi run" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(onEditTitle).toHaveBeenCalledWith("Kopi run");
  });

  test("cancelling leaves the title alone and reopens with the current one", () => {
    const { onEditTitle } = renderCard();

    openEditor();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "scratch" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(onEditTitle).not.toHaveBeenCalled();

    openEditor();
    expect(screen.getByRole("textbox")).toHaveValue("Ordering kopi");
  });
});

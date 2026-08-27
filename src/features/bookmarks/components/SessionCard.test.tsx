import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, afterEach } from "vitest";
import { createRef } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import type { Session, Tag } from "../../../types";
import { SessionCard } from "./SessionCard";

// BM-04, session side — the inline tag editor offered tags that were inside
// their 5s undo window, so a session could be labelled with a tag that was
// about to be deleted.

const HAWKER: Tag = {
  id: "t1",
  name: "Hawker",
  type: "session",
  createdAt: "2026-01-01T00:00:00.000Z",
};
const WORK: Tag = { id: "t2", name: "Work", type: "session", createdAt: "2026-01-01T00:00:00.000Z" };

const SESSION: Session = {
  id: "s1",
  title: "Kopi run",
  date: "2026-01-01",
  messages: [{ id: "m1", sender: "user", text: "one kopi please", dialectText: "一杯咖啡" }],
  tags: ["t2"],
};

function renderCard(pendingTagDeletions: Set<string>) {
  render(
    <SessionCard
      session={SESSION}
      isFirst
      sessionTags={[HAWKER, WORK]}
      pendingTagDeletions={pendingTagDeletions}
      conversationLessons={[]}
      expandedSessionId={null}
      setExpandedSessionId={vi.fn()}
      editingSessionId={null}
      setEditingSessionId={vi.fn()}
      editingTitle=""
      setEditingTitle={vi.fn()}
      titleInputRef={createRef<HTMLInputElement>()}
      commitTitle={vi.fn()}
      openMenuSessionId={null}
      setOpenMenuSessionId={vi.fn()}
      setMenuPosition={vi.fn()}
      onView={vi.fn()}
      editingTagsSessionId={SESSION.id}
      setSessionTags={vi.fn()}
      pendingConvertSession={null}
      setPendingConvertSession={vi.fn()}
      audioSourceType="recorded"
      setAudioSourceType={vi.fn()}
      onMakeLesson={vi.fn()}
      onConvertToLesson={vi.fn()}
    />
  );
}

afterEach(cleanup);

describe("SessionCard tag editor", () => {
  test("a tag inside its undo window cannot be assigned", () => {
    renderCard(new Set(["t1"]));

    expect(screen.queryByRole("button", { name: "Hawker" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Work" })).toBeInTheDocument();
  });

  test("all tags are assignable when nothing is pending deletion", () => {
    renderCard(new Set<string>());

    expect(screen.getByRole("button", { name: "Hawker" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Work" })).toBeInTheDocument();
  });
});

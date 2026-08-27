import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Message, Session } from "../../../types";
import { SessionViewer } from "./SessionViewer";

// BM-05 — the viewer rendered a snapshot taken when the session was opened,
// and the message-deletion timer patched that snapshot through a mount-bound
// setter. Remounting the viewer restored the deleted message, which then
// lingered as a ghost (gone from the provider, still on screen). The viewer
// now derives its messages from live provider state.

// The animation library is a test boundary here, not the unit under test.
vi.mock("motion/react", async () => {
  const react = await import("react");
  const MOTION_ONLY_PROPS = new Set([
    "initial",
    "animate",
    "exit",
    "transition",
    "drag",
    "dragDirectionLock",
    "dragConstraints",
    "dragElastic",
    "onDragEnd",
  ]);
  const stub = (tag: string) =>
    react.forwardRef<Element, Record<string, unknown>>((props, ref) => {
      const rest: Record<string, unknown> = { ref };
      for (const key of Object.keys(props)) {
        if (!MOTION_ONLY_PROPS.has(key)) rest[key] = props[key];
      }
      return react.createElement(tag, rest);
    });
  return {
    AnimatePresence: (props: { children?: unknown }) =>
      react.createElement(react.Fragment, null, props.children as never),
    motion: new Proxy({}, { get: (_t, prop: string) => stub(prop) }),
  };
});

const KOPI: Message = { id: "m1", sender: "user", text: "one kopi please", dialectText: "一杯咖啡" };
const TEH: Message = { id: "m2", sender: "user", text: "one teh please", dialectText: "一杯茶" };

const SNAPSHOT: Session = {
  id: "s1",
  title: "Kopi run",
  date: "2026-01-01",
  messages: [KOPI, TEH],
};

function renderViewer(sessions: Session[], pendingMsgDeletions = new Set<string>()) {
  return render(
    <SessionViewer
      session={SNAPSHOT}
      sessions={sessions}
      onClose={vi.fn()}
      phrases={[]}
      playingId={null}
      pendingMsgDeletions={pendingMsgDeletions}
      onPlayMessage={vi.fn()}
      onBookmarkMessage={vi.fn()}
      onDeleteMessage={vi.fn()}
      onBubblePointerDown={vi.fn()}
      onBubblePointerMove={vi.fn()}
      onBubblePointerCancel={vi.fn()}
    />
  );
}

afterEach(cleanup);

describe("SessionViewer", () => {
  test("renders the live provider copy of the session, not the open-time snapshot", () => {
    renderViewer([{ ...SNAPSHOT, messages: [KOPI] }]);

    expect(screen.getByText("一杯咖啡")).toBeInTheDocument();
    expect(screen.queryByText("一杯茶")).not.toBeInTheDocument();
  });

  test("a message deleted from the provider stays gone across a remount", () => {
    const { unmount } = renderViewer([SNAPSHOT]);
    expect(screen.getByText("一杯茶")).toBeInTheDocument();
    unmount();

    renderViewer([{ ...SNAPSHOT, messages: [KOPI] }]);

    expect(screen.queryByText("一杯茶")).not.toBeInTheDocument();
  });

  test("still hides messages inside their undo window", () => {
    renderViewer([SNAPSHOT], new Set(["m2"]));

    expect(screen.getByText("一杯咖啡")).toBeInTheDocument();
    expect(screen.queryByText("一杯茶")).not.toBeInTheDocument();
  });

  test("falls back to the snapshot when the session is gone from the live list", () => {
    renderViewer([]);

    expect(screen.getByText("一杯咖啡")).toBeInTheDocument();
    expect(screen.getByText("一杯茶")).toBeInTheDocument();
  });
});

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
// BM-02 (Task 10) — on a voice-less pack (tts capability off), the play
// control "succeeded" silently for a message with no stored audio. It is now
// hidden for that case, matching Learn's PlayButton gate.
// Folded item C (Task 10) — the per-message audio/playing key was built from
// the post-filter array index, so an earlier message being filtered out
// (pending deletion) shifted a later message's key and moved the "Playing…"
// pulse to the wrong bubble. The key is now built from msg.id.

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
const MILO: Message = { id: "m3", sender: "user", text: "one milo please", dialectText: "一杯美祿" };

const SNAPSHOT: Session = {
  id: "s1",
  title: "Kopi run",
  date: "2026-01-01",
  messages: [KOPI, TEH],
};

function renderViewer(
  sessions: Session[],
  pendingMsgDeletions = new Set<string>(),
  playingId: string | null = null,
  ttsEnabled = true
) {
  return render(
    <SessionViewer
      session={SNAPSHOT}
      sessions={sessions}
      onClose={vi.fn()}
      phrases={[]}
      playingId={playingId}
      pendingMsgDeletions={pendingMsgDeletions}
      onPlayMessage={vi.fn()}
      onBookmarkMessage={vi.fn()}
      onDeleteMessage={vi.fn()}
      onBubblePointerDown={vi.fn()}
      onBubblePointerMove={vi.fn()}
      onBubblePointerCancel={vi.fn()}
      ttsEnabled={ttsEnabled}
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

describe("SessionViewer play control (BM-02)", () => {
  test("hides the play control for a message with no stored audio when TTS is unavailable", () => {
    renderViewer([SNAPSHOT], new Set(), null, false);

    expect(screen.queryByText("Play TTS")).not.toBeInTheDocument();
    expect(screen.queryByText("Play recording")).not.toBeInTheDocument();
  });

  test("keeps the play control for a message with no stored audio when TTS is available", () => {
    renderViewer([SNAPSHOT], new Set(), null, true);

    expect(screen.getAllByText("Play TTS").length).toBe(2);
  });

  test("keeps the play control for a message with stored audio even when TTS is unavailable", () => {
    const withAudio = {
      ...SNAPSHOT,
      messages: [{ ...KOPI, audioDataUrl: "data:audio/wav;base64,AAA" }, TEH],
    };
    renderViewer([withAudio], new Set(), null, false);

    expect(screen.getByText("Play recording")).toBeInTheDocument();
    expect(screen.queryByText("Play TTS")).not.toBeInTheDocument();
  });
});

describe("SessionViewer playback key (folded item C)", () => {
  test("keeps the Playing pulse on the correct message when an earlier one is filtered out", () => {
    const withMilo = { ...SNAPSHOT, messages: [KOPI, TEH, MILO] };
    // KOPI (m1) is inside its undo window and filtered from the render,
    // shifting MILO from index 2 down to index 1. An index-keyed audioKey
    // would then collide with TEH's post-filter index and misattribute the
    // "Playing…" pulse.
    renderViewer([withMilo], new Set(["m1"]), `view-${SNAPSHOT.id}-m3`);

    const miloBubble = screen.getByText("一杯美祿").closest("div");
    const tehBubble = screen.getByText("一杯茶").closest("div");
    expect(miloBubble).toHaveTextContent("Playing…");
    expect(tehBubble).not.toHaveTextContent("Playing…");
  });
});

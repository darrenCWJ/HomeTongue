import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TourPageId, UserProfile } from "@/types";
import { TourProvider, useTour } from "./TourProvider";
import { TourOverlay, resolveMissingAnchor } from "./TourOverlay";

// Three bugs under test:
// LEARN-03/PROF-05 — a tour whose `[data-tour]` anchors never render used to
//   auto-advance through every step behind a dark overlay and then write
//   `tourCompleted`, i.e. mark itself "seen" without ever being shown.
// LEARN-10/PROF-10 — the missing-anchor retry `setTimeout` chain was never
//   cancelled when the step changed, so an orphaned retry fired with a stale
//   closure and advanced past the step the user had just moved to.

// The animation library is a test boundary here, not the unit under test:
// stubbing it keeps the retry/timer assertions deterministic under fake timers.
vi.mock("motion/react", async () => {
  const react = await import("react");
  const MOTION_ONLY_PROPS = new Set([
    "initial",
    "animate",
    "exit",
    "transition",
    "variants",
    "whileHover",
    "whileTap",
    "layout",
    "layoutId",
  ]);
  const cache = new Map<string, unknown>();
  const stub = (tag: string): unknown => {
    if (!cache.has(tag)) {
      cache.set(
        tag,
        react.forwardRef<Element, Record<string, unknown>>((props, ref) => {
          const rest: Record<string, unknown> = { ref };
          for (const key of Object.keys(props)) {
            if (!MOTION_ONLY_PROPS.has(key)) rest[key] = props[key];
          }
          return react.createElement(tag, rest);
        })
      );
    }
    return cache.get(tag);
  };
  return {
    AnimatePresence: (props: { children?: unknown }) =>
      react.createElement(react.Fragment, null, props.children as never),
    motion: new Proxy(
      {},
      { get: (_target: object, prop: string | symbol) => (typeof prop === "string" ? stub(prop) : undefined) }
    ),
  };
});

const mockUpdateUserProfile = vi.fn();
let mockProfile: UserProfile;

vi.mock("@/app/context/ProfileProvider", () => ({
  useProfile: () => ({ userProfile: mockProfile, updateUserProfile: mockUpdateUserProfile }),
}));

// The chat tour's first three anchors, in order.
const STEP_0 = "chat-persona-selector";
const STEP_1 = "chat-dialect-selector";
const STEP_2 = "chat-save-conversation";

function Anchors({ targets }: { targets: readonly string[] }) {
  return (
    <>
      {targets.map((target) => (
        <div key={target} data-tour={target} />
      ))}
    </>
  );
}

function TourStarter({ page }: { page: TourPageId }) {
  const { startTour } = useTour();
  return (
    <button type="button" onClick={() => startTour(page)}>
      start tour
    </button>
  );
}

function renderTour(targets: readonly string[] = []) {
  return render(
    <TourProvider>
      <Anchors targets={targets} />
      <TourStarter page="chat" />
      <TourOverlay />
    </TourProvider>
  );
}

const click = (label: RegExp | string) => fireEvent.click(screen.getByRole("button", { name: label }));

/**
 * Advances timers in flushed chunks. One long `advanceTimersByTime` is not
 * enough: React's scheduler is not on the fake clock, so state updates queued
 * by a timer only land once `act` exits.
 */
function advance(chunks: number, ms: number) {
  for (let i = 0; i < chunks; i += 1) {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }
}

const overlay = () => screen.queryByRole("dialog", { name: /feature tour/i });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // jsdom has no layout engine and therefore no scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
  mockProfile = {
    id: "p1",
    name: "Ann",
    activePersona: "personal",
    tourCompleted: {},
  } as UserProfile;
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("resolveMissingAnchor", () => {
  test("cancels when the first step's anchor never renders", () => {
    expect(resolveMissingAnchor(0, false, false)).toBe("cancel");
  });

  test("cancels on the first step even for a single-step tour", () => {
    expect(resolveMissingAnchor(0, false, true)).toBe("cancel");
  });

  test("advances past a missing middle step once something has rendered", () => {
    expect(resolveMissingAnchor(2, true, false)).toBe("advance");
  });

  test("advances past a missing middle step even before anything rendered", () => {
    expect(resolveMissingAnchor(2, false, false)).toBe("advance");
  });

  test("completes the tour from the last step when a step actually rendered", () => {
    expect(resolveMissingAnchor(4, true, true)).toBe("advance");
  });

  test("cancels rather than completing a tour that never showed a single step", () => {
    expect(resolveMissingAnchor(4, false, true)).toBe("cancel");
  });
});

describe("TourOverlay — missing anchors", () => {
  test("a tour whose first anchor never renders cancels without writing the profile", () => {
    // Arrange — the page renders none of the chat tour's anchors.
    renderTour([]);

    // Act
    act(() => click(/start tour/i));
    expect(overlay()).toBeInTheDocument();
    advance(12, 1000);

    // Assert — never marked "seen", and the dark overlay is gone.
    expect(mockUpdateUserProfile).not.toHaveBeenCalled();
    expect(overlay()).toBeNull();
  });

  test("an orphaned retry cannot advance past the step the user moved to", () => {
    // Arrange — step 0's anchor is absent, so its retry chain is pending.
    renderTour([STEP_1, STEP_2]);
    act(() => click(/start tour/i));
    advance(1, 150);

    // Act — the user moves on before the abandoned chain exhausts its budget.
    act(() => click(/^next$/i));
    expect(screen.getByText("Choose Dialect")).toBeInTheDocument();
    advance(4, 500);

    // Assert — still reading step 2 of 9, not skipped ahead by a stale timer.
    expect(screen.getByText("Choose Dialect")).toBeInTheDocument();
    expect(screen.queryByText("Save Conversation")).toBeNull();
  });

  test("a missing middle anchor still advances once earlier steps have rendered", () => {
    // Arrange — step 1's anchor is absent; steps 0 and 2 render.
    renderTour([STEP_0, STEP_2]);
    act(() => click(/start tour/i));
    expect(screen.getByText("Switch Persona")).toBeInTheDocument();

    // Act
    act(() => click(/^next$/i));
    advance(3, 500);

    // Assert — skipped the hidden step instead of stalling or cancelling.
    expect(screen.getByText("Save Conversation")).toBeInTheDocument();
    expect(mockUpdateUserProfile).not.toHaveBeenCalled();
  });
});

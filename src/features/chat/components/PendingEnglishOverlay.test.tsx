import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PendingEnglishOverlay } from "./PendingEnglishOverlay";

// CHAT-14 — the confirm button and subtitle hardcoded "Cantonese" regardless
// of the active pack, so a user on a different dialect pack was told to
// "Send in Cantonese" no matter what they were actually speaking. Both now
// take the active pack's display label the same way ActionBar does
// (ChatPage's `dialect` from useProfile), threaded in as a prop since this
// component is presentational.

// The animation library is a test boundary here, not the unit under test.
vi.mock("motion/react", async () => {
  const react = await import("react");
  const MOTION_ONLY_PROPS = new Set(["initial", "animate", "exit", "transition"]);
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

function setup(overrides: Partial<Parameters<typeof PendingEnglishOverlay>[0]> = {}) {
  const props = {
    isOpen: true,
    pendingEditText: "one kopi please",
    setPendingEditText: vi.fn(),
    isEditingPending: false,
    setIsEditingPending: vi.fn(),
    dialectLabel: "Cantonese",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<PendingEnglishOverlay {...props} />);
  return props;
}

afterEach(cleanup);

describe("PendingEnglishOverlay dialect label (CHAT-14)", () => {
  test("the confirm button names the active pack's dialect", () => {
    setup({ dialectLabel: "Hokkien" });

    expect(screen.getByRole("button", { name: "Send in Hokkien" })).toBeInTheDocument();
  });

  test("the subtitle names the active pack's dialect", () => {
    setup({ dialectLabel: "Hokkien" });

    expect(screen.getByText("Check your recording, then send in Hokkien")).toBeInTheDocument();
  });

  test("a different pack's label is reflected without any hardcoded fallback", () => {
    setup({ dialectLabel: "Teochew" });

    expect(screen.queryByText(/Cantonese/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send in Teochew" })).toBeInTheDocument();
  });
});

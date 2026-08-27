import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Tag } from "../../../types";
import { PhraseSaveSheet } from "./PhraseSaveSheet";

// Folded item D — Cancel had no isSavingPhrase guard, so tapping it while a
// save was in flight (replaying captured audio, or a fresh TTS round trip)
// closed the sheet while addPhrase — already called synchronously before
// that await — kept running to completion: a "Phrase saved!" toast (or a
// failure toast) would land after the user believed they had cancelled.
// Disabling Cancel while isSavingPhrase keeps the sheet up until the save
// actually settles, matching how the Save button itself already behaves.

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

const TAGS: Tag[] = [];

function setup(overrides: Partial<Parameters<typeof PhraseSaveSheet>[0]> = {}) {
  const props = {
    isOpen: true,
    phraseSelectionText: "早晨",
    setPhraseSelectionText: vi.fn(),
    phraseTags: TAGS,
    phraseTagSelection: [] as string[],
    setPhraseTagSelection: vi.fn(),
    newTagInput: "",
    setNewTagInput: vi.fn(),
    isCreatingPhraseTag: false,
    setIsCreatingPhraseTag: vi.fn(),
    createTag: vi.fn(),
    isSavingPhrase: false,
    onSave: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<PhraseSaveSheet {...props} />);
  return props;
}

afterEach(cleanup);

describe("PhraseSaveSheet Cancel guard during an in-flight save (folded item D)", () => {
  test("Cancel is disabled while a save is in flight", () => {
    setup({ isSavingPhrase: true });

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  test("Cancel is enabled once no save is in flight", () => {
    setup({ isSavingPhrase: false });

    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });
});

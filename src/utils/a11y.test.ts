import { describe, test, expect, vi } from "vitest";
import type { KeyboardEvent } from "react";
import { activationKeyHandler } from "./a11y";

function makeEvent(key: string, { bubbledFromChild = false } = {}) {
  const currentTarget = {} as HTMLElement;
  const target = bubbledFromChild ? ({} as HTMLElement) : currentTarget;
  const preventDefault = vi.fn();
  const event = { key, target, currentTarget, preventDefault } as unknown as KeyboardEvent<HTMLElement>;
  return { event, preventDefault };
}

describe("activationKeyHandler", () => {
  test("Enter runs the action", () => {
    const action = vi.fn();
    const { event } = makeEvent("Enter");

    activationKeyHandler(action)(event);

    expect(action).toHaveBeenCalledTimes(1);
  });

  test("Space runs the action and prevents the page-scroll default", () => {
    const action = vi.fn();
    const { event, preventDefault } = makeEvent(" ");

    activationKeyHandler(action)(event);

    expect(action).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalled();
  });

  test("other keys do nothing", () => {
    const action = vi.fn();
    const { event, preventDefault } = makeEvent("Tab");

    activationKeyHandler(action)(event);

    expect(action).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  test("keys bubbling up from a nested control are ignored", () => {
    const action = vi.fn();
    const { event } = makeEvent("Enter", { bubbledFromChild: true });

    activationKeyHandler(action)(event);

    expect(action).not.toHaveBeenCalled();
  });
});

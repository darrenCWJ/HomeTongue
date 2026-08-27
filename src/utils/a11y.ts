import type { KeyboardEvent } from "react";

/**
 * Keyboard activation for interactive non-button elements (role="button"
 * divs): Enter and Space run the action exactly like a click. Keys bubbling
 * up from nested controls (an inline title editor, a menu button) are
 * ignored, so typing Space in an input inside the element never activates
 * it. Space's default (page scroll) is suppressed.
 */
export function activationKeyHandler(action: () => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    action();
  };
}

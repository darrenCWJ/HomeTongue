import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonCard } from "./LessonCard";

afterEach(cleanup);

// The card was a click-only div, invisible and inert to keyboard users. It now
// carries button semantics: focusable, and Enter/Space activate it exactly
// like a click.
describe("LessonCard keyboard operation", () => {
  function renderCard() {
    const onClick = vi.fn();
    render(<LessonCard title="Greetings" subtitle="10 phrases" progress={40} onClick={onClick} />);
    return { onClick, card: screen.getByRole("button", { name: /greetings/i }) };
  }

  test("is exposed as a focusable button", () => {
    const { card } = renderCard();
    expect(card).toHaveAttribute("tabindex", "0");
  });

  test("Enter opens the lesson like a click", () => {
    const { onClick, card } = renderCard();
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("Space opens the lesson like a click", () => {
    const { onClick, card } = renderCard();
    fireEvent.keyDown(card, { key: " " });
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

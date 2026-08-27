import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AuthPage } from "./AuthPage";

// The bug under test (PROF-08): while a sign-in was in flight the submit
// button disabled itself but "Continue as Guest" stayed live. Tapping it mid
// sign-in ran `onComplete()` and dropped the user into the app as a guest
// while the auth call was still resolving behind them.

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

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const signInWithPassword = vi.fn();
const signUpWithPassword = vi.fn();

vi.mock("../context/AuthProvider", () => ({
  useAuth: () => ({
    isCloudAuthEnabled: true,
    signInWithPassword: (...args: unknown[]) => signInWithPassword(...args),
    signUpWithPassword: (...args: unknown[]) => signUpWithPassword(...args),
  }),
}));

const guestButton = () => screen.getByRole("button", { name: /continue as guest/i });
const submitButton = () => screen.getByRole("button", { name: /sign in/i });

function fillCredentials() {
  fireEvent.change(screen.getByPlaceholderText("hello@example.com"), {
    target: { value: "a@example.com" },
  });
  fireEvent.change(screen.getByPlaceholderText("••••••••"), {
    target: { value: "hunter2hunter2" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AuthPage guest escape hatch", () => {
  test("is disabled while a sign-in is in flight", async () => {
    // Arrange — a sign-in that never settles keeps the page in its loading state
    signInWithPassword.mockReturnValue(new Promise(() => {}));
    const onComplete = vi.fn();
    render(<AuthPage onComplete={onComplete} />);
    fillCredentials();

    // Act
    fireEvent.click(submitButton());

    // Assert
    await waitFor(() => expect(guestButton()).toBeDisabled());
    fireEvent.click(guestButton());
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("is re-enabled after a failed sign-in", async () => {
    // Arrange
    signInWithPassword.mockRejectedValue(new Error("bad credentials"));
    const onComplete = vi.fn();
    render(<AuthPage onComplete={onComplete} />);
    fillCredentials();

    // Act
    fireEvent.click(submitButton());

    // Assert
    await waitFor(() => expect(guestButton()).not.toBeDisabled());
    fireEvent.click(guestButton());
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test("works normally when nothing is in flight", () => {
    // Arrange
    const onComplete = vi.fn();
    render(<AuthPage onComplete={onComplete} />);

    // Act
    fireEvent.click(guestButton());

    // Assert
    expect(guestButton()).not.toBeDisabled();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

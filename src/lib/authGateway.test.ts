import { describe, test, expect } from "vitest";
import { createDisabledAuthGateway } from "./authGateway";

describe("createDisabledAuthGateway", () => {
  const gateway = createDisabledAuthGateway();

  test("reports cloud auth as disabled", () => {
    expect(gateway.isEnabled).toBe(false);
  });

  test("resolves no session user", async () => {
    await expect(gateway.getSessionUser()).resolves.toBeNull();
  });

  test("onAuthUserChange returns a callable unsubscribe and never emits", () => {
    let emitted = false;
    const unsubscribe = gateway.onAuthUserChange(() => {
      emitted = true;
    });
    expect(typeof unsubscribe).toBe("function");
    expect(() => unsubscribe()).not.toThrow();
    expect(emitted).toBe(false);
  });

  test("sign-in, sign-up, and sign-out reject with a clear not-configured error", async () => {
    await expect(gateway.signInWithPassword("a@b.c", "password123")).rejects.toThrow(
      /Cloud auth is not configured/
    );
    await expect(gateway.signUpWithPassword("a@b.c", "password123")).rejects.toThrow(
      /Cloud auth is not configured/
    );
    await expect(gateway.signOut()).rejects.toThrow(/Cloud auth is not configured/);
  });
});

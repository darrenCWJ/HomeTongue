import "@testing-library/jest-dom/vitest";
import { useEffect } from "react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { AuthUser } from "../../lib/authGateway";
import { AuthProvider, useAuth } from "./AuthProvider";

// The race under test: the repository router decides cloud-vs-local from the
// auth user the outbox store tracks, while providers re-load their data when
// `authEpoch` changes. If the epoch bumped before the router's source was
// updated, a signed-in user's providers would re-load from LOCAL Dexie and
// nothing would bump the epoch again — a sticky split brain (read local, write
// cloud). AuthProvider must therefore forward the user to the router BEFORE it
// touches any state.

const USER_A: AuthUser = { id: "aaaaaaaa-0000-0000-0000-000000000001", email: "a@example.com" };

// Stands in for the router's source of truth (getOutboxUserId), which
// notifyAuthUser feeds in production.
let routerUserId: string | null = null;
const notifyAuthUserSpy = vi.fn((userId: string | null) => {
  routerUserId = userId;
});

let sessionPromise: Promise<AuthUser | null>;
let resolveSession: (user: AuthUser | null) => void;
let authListener: ((user: AuthUser | null) => void) | null = null;

vi.mock("../../repositories", () => ({
  notifyAuthUser: (userId: string | null) => notifyAuthUserSpy(userId),
}));

vi.mock("../../lib/authGateway", () => ({
  authGateway: {
    isEnabled: true,
    getSessionUser: () => sessionPromise,
    onAuthUserChange: (callback: (user: AuthUser | null) => void) => {
      authListener = callback;
      return () => {
        authListener = null;
      };
    },
    signInWithPassword: vi.fn(),
    signUpWithPassword: vi.fn(),
    signOut: vi.fn(),
  },
}));

interface Observation {
  authEpoch: number;
  routerUserId: string | null;
}

let observations: Observation[] = [];

/**
 * Mirrors how LibraryProvider/ProfileProvider consume the epoch: an effect
 * keyed on `authEpoch` that would hit the repositories. It records what the
 * router would have resolved to at that moment.
 */
function EpochConsumerProbe() {
  const { authEpoch } = useAuth();
  useEffect(() => {
    observations.push({ authEpoch, routerUserId });
  }, [authEpoch]);
  return <span data-testid="epoch">{authEpoch}</span>;
}

beforeEach(() => {
  vi.clearAllMocks();
  observations = [];
  routerUserId = null;
  authListener = null;
  sessionPromise = new Promise<AuthUser | null>((resolve) => {
    resolveSession = resolve;
  });
});

// Vitest runs without `globals: true`, so RTL's automatic afterEach cleanup
// never registers — unmount explicitly or the previous test's tree stays mounted.
afterEach(cleanup);

describe("AuthProvider — repository router ordering", () => {
  test("points the router at the restored user before the epoch consumers run", async () => {
    // Arrange
    render(
      <AuthProvider>
        <EpochConsumerProbe />
      </AuthProvider>
    );
    expect(observations).toEqual([{ authEpoch: 0, routerUserId: null }]);

    // Act — the session restore lands with a signed-in user
    await act(async () => {
      resolveSession(USER_A);
    });
    await waitFor(() => expect(screen.getByTestId("epoch")).toHaveTextContent("1"));

    // Assert — the consumer saw the router already pointing at the cloud user
    expect(notifyAuthUserSpy).toHaveBeenCalledWith(USER_A.id);
    expect(observations).toEqual([
      { authEpoch: 0, routerUserId: null },
      { authEpoch: 1, routerUserId: USER_A.id },
    ]);
  });

  test("points the router back to guest before the sign-out epoch consumers run", async () => {
    // Arrange — signed in first
    render(
      <AuthProvider>
        <EpochConsumerProbe />
      </AuthProvider>
    );
    await act(async () => {
      resolveSession(USER_A);
    });
    await waitFor(() => expect(screen.getByTestId("epoch")).toHaveTextContent("1"));

    // Act — sign-out arrives through the auth gateway subscription
    await act(async () => {
      authListener?.(null);
    });
    await waitFor(() => expect(screen.getByTestId("epoch")).toHaveTextContent("2"));

    // Assert — the consumer re-loads with the router already back on local
    expect(notifyAuthUserSpy).toHaveBeenLastCalledWith(null);
    expect(observations).toEqual([
      { authEpoch: 0, routerUserId: null },
      { authEpoch: 1, routerUserId: USER_A.id },
      { authEpoch: 2, routerUserId: null },
    ]);
  });
});

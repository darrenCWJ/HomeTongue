import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Message, UserProfile } from "../../types";
import { ProfileProvider, useProfile } from "./ProfileProvider";

// The bug under test (PROF-01): the provider used to expose only `userProfile`,
// so "no profile yet" was indistinguishable from "still loading". Layout read
// that as "needs onboarding" and `updateUserProfile` created a fresh profile
// whenever nothing was in memory — and `saveProfile` upserts on user_id. A
// returning user on a slow or failed start could therefore overwrite their own
// stored row with an empty one, without a single click. Writes must be ignored
// until hydration actually settles.

const STORED: UserProfile = {
  id: "stored-profile",
  name: "Mei",
  preferredDialect: "Cantonese",
  preferredTone: "casual",
  toneOverrideEnabled: false,
  personalityNotes: "",
  conversationCount: 3,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

/** The profile of the account signed in after a user switch. */
const OTHER_STORED: UserProfile = { ...STORED, id: "other-profile", name: "Wei" };

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Swapped per test; the mock factory below reads it lazily at call time.
let getProfile: () => Promise<UserProfile | null>;
let authEpoch = 0;
const saveProfileSpy = vi.fn();
const updatePersonaSpy = vi.fn();

vi.mock("../../repositories", () => ({
  // Cloud mode so the load effect follows `authEpoch`, as it does for a real
  // signed-in user — the sign-in-mid-load race below depends on it.
  isCloudStorageMode: true,
  repositories: {
    user: {
      getProfile: () => getProfile(),
      saveProfile: (profile: UserProfile) => saveProfileSpy(profile),
    },
  },
}));

vi.mock("./AuthProvider", () => ({
  useAuth: () => ({ authEpoch }),
}));

vi.mock("../../services/personaService", () => ({
  updatePersona: (...args: unknown[]) => updatePersonaSpy(...args),
}));

function ProfileProbe() {
  const { profileStatus, userProfile, updateUserProfile, retryProfileLoad, updatePersonaInBackground } =
    useProfile();
  return (
    <div>
      <span data-testid="status">{profileStatus}</span>
      <span data-testid="name">{userProfile ? userProfile.name || "(unnamed)" : "(no profile)"}</span>
      <button onClick={() => updateUserProfile({ name: "Ada" })}>update name</button>
      <button onClick={retryProfileLoad}>retry</button>
      <button onClick={() => updatePersonaInBackground([] as Message[])}>persona</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <ProfileProvider>
      <ProfileProbe />
    </ProfileProvider>
  );
}

const status = () => screen.getByTestId("status");
const name = () => screen.getByTestId("name");
const click = (label: string) => fireEvent.click(screen.getByRole("button", { name: label }));

let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  authEpoch = 0;
  getProfile = () => Promise.resolve(null);
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

// Vitest runs without `globals: true`, so RTL's automatic cleanup never
// registers — unmount explicitly or the previous tree stays mounted.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ProfileProvider hydration status", () => {
  test("ignores a profile write while the stored profile is still loading", async () => {
    // Arrange — the load never settles during the write
    const pending = deferred<UserProfile | null>();
    getProfile = () => pending.promise;
    renderProvider();
    expect(status()).toHaveTextContent("loading");

    // Act — something (a tour step, a stray effect) writes before hydration
    click("update name");

    // Assert — no fresh profile in memory, nothing upserted over the stored row
    expect(saveProfileSpy).not.toHaveBeenCalled();
    expect(name()).toHaveTextContent("(no profile)");
    expect(warnSpy).toHaveBeenCalledWith("[profile] write ignored: profile not hydrated yet");

    // ...and the stored profile still arrives intact
    await act(async () => {
      pending.resolve(STORED);
    });
    expect(status()).toHaveTextContent("loaded");
    expect(name()).toHaveTextContent("Mei");
  });

  test("creates exactly one fresh profile once the load resolves with none stored", async () => {
    // Arrange — a genuinely new user: the load resolves null
    const pending = deferred<UserProfile | null>();
    getProfile = () => pending.promise;
    renderProvider();
    await act(async () => {
      pending.resolve(null);
    });
    expect(status()).toHaveTextContent("loaded");

    // Act
    click("update name");

    // Assert — creating a profile is correct here, and happens once
    expect(saveProfileSpy).toHaveBeenCalledTimes(1);
    expect(saveProfileSpy.mock.calls[0][0]).toMatchObject({ name: "Ada" });
    expect(name()).toHaveTextContent("Ada");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("reports error status on a failed load and re-runs the load on retry", async () => {
    // Arrange — the initial load rejects
    const first = deferred<UserProfile | null>();
    getProfile = () => first.promise;
    renderProvider();
    await act(async () => {
      first.reject(new Error("offline"));
    });
    expect(status()).toHaveTextContent("error");
    expect(errorSpy).toHaveBeenCalled();

    // Act — the user retries and the second attempt succeeds
    const second = deferred<UserProfile | null>();
    getProfile = () => second.promise;
    click("retry");
    expect(status()).toHaveTextContent("loading");
    await act(async () => {
      second.resolve(STORED);
    });

    // Assert
    expect(status()).toHaveTextContent("loaded");
    expect(name()).toHaveTextContent("Mei");
  });

  test("a failed load never leaves a fresh profile behind", async () => {
    // Arrange
    const pending = deferred<UserProfile | null>();
    getProfile = () => pending.promise;
    renderProvider();
    await act(async () => {
      pending.reject(new Error("offline"));
    });

    // Act
    click("update name");

    // Assert — an errored load is not permission to invent a profile
    expect(saveProfileSpy).not.toHaveBeenCalled();
    expect(name()).toHaveTextContent("(no profile)");
    expect(warnSpy).toHaveBeenCalledWith("[profile] write ignored: profile not hydrated yet");
  });

  test("a background persona update does not resurrect a profile while unhydrated", async () => {
    // Arrange — persona generation completes while the load is still in flight
    const pending = deferred<UserProfile | null>();
    getProfile = () => pending.promise;
    const persona = deferred<{ personaSummary: string; characteristicPhrases: string[] }>();
    updatePersonaSpy.mockReturnValue(persona.promise);
    renderProvider();

    // Act
    click("persona");
    await act(async () => {
      persona.resolve({ personaSummary: "warm and direct", characteristicPhrases: ["係啦"] });
    });

    // Assert — the summary is dropped rather than written onto an invented profile
    expect(saveProfileSpy).not.toHaveBeenCalled();
    expect(name()).toHaveTextContent("(no profile)");
    expect(warnSpy).toHaveBeenCalledWith("[profile] write ignored: profile not hydrated yet");
  });

  test("drops a persona update that completes after a user switch", async () => {
    // Arrange — user A is loaded and starts a background persona update
    const loadA = deferred<UserProfile | null>();
    getProfile = () => loadA.promise;
    const { rerender } = renderProvider();
    await act(async () => {
      loadA.resolve(STORED);
    });
    const persona = deferred<{ personaSummary: string; characteristicPhrases: string[] }>();
    updatePersonaSpy.mockReturnValue(persona.promise);
    click("persona");

    // Act — user B signs in and their profile finishes loading first
    const loadB = deferred<UserProfile | null>();
    getProfile = () => loadB.promise;
    authEpoch = 1;
    rerender(
      <ProfileProvider>
        <ProfileProbe />
      </ProfileProvider>
    );
    await act(async () => {
      loadB.resolve(OTHER_STORED);
    });
    expect(name()).toHaveTextContent("Wei");

    // ...then A's summary lands, with B's profile in state and B's row behind
    // the repositories
    await act(async () => {
      persona.resolve({ personaSummary: "warm and direct", characteristicPhrases: ["係啦"] });
    });

    // Assert — A's persona is not written into B's row
    expect(saveProfileSpy).not.toHaveBeenCalled();
    expect(name()).toHaveTextContent("Wei");
  });

  test("clears the previous user's profile while the next one loads", async () => {
    // Arrange — user A is loaded
    const loadA = deferred<UserProfile | null>();
    getProfile = () => loadA.promise;
    const { rerender } = renderProvider();
    await act(async () => {
      loadA.resolve(STORED);
    });
    expect(name()).toHaveTextContent("Mei");

    // Act — user B signs in; their load has not resolved yet
    const loadB = deferred<UserProfile | null>();
    getProfile = () => loadB.promise;
    authEpoch = 1;
    rerender(
      <ProfileProvider>
        <ProfileProbe />
      </ProfileProvider>
    );

    // Assert — A's profile is neither visible nor writable during the switch
    expect(status()).toHaveTextContent("loading");
    expect(name()).toHaveTextContent("(no profile)");
    click("update name");
    expect(saveProfileSpy).not.toHaveBeenCalled();

    // ...and B's own profile arrives intact
    await act(async () => {
      loadB.resolve(OTHER_STORED);
    });
    expect(name()).toHaveTextContent("Wei");
  });

  test("falls back to the retry path when the load never settles", async () => {
    // Arrange — getProfile hangs forever (dead network, stalled IndexedDB)
    vi.useFakeTimers();
    getProfile = () => new Promise<UserProfile | null>(() => {});
    renderProvider();
    expect(status()).toHaveTextContent("loading");

    // Act
    await act(async () => {
      vi.advanceTimersByTime(8_000);
    });

    // Assert — an escapable error screen, not an endless spinner
    expect(status()).toHaveTextContent("error");
    expect(errorSpy).toHaveBeenCalled();
  });

  test("a stale in-flight load cannot overwrite a newer one", async () => {
    // Arrange — a guest load is in flight (resolves null: guests have no row)
    const guestLoad = deferred<UserProfile | null>();
    getProfile = () => guestLoad.promise;
    const { rerender } = renderProvider();

    // Act — the user signs in mid-load; the new epoch re-loads and lands first
    const signedInLoad = deferred<UserProfile | null>();
    getProfile = () => signedInLoad.promise;
    authEpoch = 1;
    rerender(
      <ProfileProvider>
        <ProfileProbe />
      </ProfileProvider>
    );
    await act(async () => {
      signedInLoad.resolve(STORED);
    });
    expect(name()).toHaveTextContent("Mei");

    // ...then the abandoned guest load finally settles
    await act(async () => {
      guestLoad.resolve(null);
    });

    // Assert — a late guest "null" must not blank the signed-in profile, which
    // would drop the user straight into onboarding over their own stored row
    expect(name()).toHaveTextContent("Mei");
    expect(status()).toHaveTextContent("loaded");
  });
});

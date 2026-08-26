import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { AuthUser } from "../../../lib/authGateway";
import type { CloudImportResult } from "../../../services/cloudImportService";
import { CloudAccountSection } from "./CloudAccountSection";

// PROF-02: the account-card "Sign out" used to only end the cloud session,
// clear one gate flag, and toast — leaving the signed-out user's profile and
// library alive in React state, so the next "Continue as Guest" on the
// device saw the previous account's data. It must now run the same shared
// full sign-out flow as the bottom Sign Out button (src/lib/fullSignOut.ts),
// whose reload is what actually resets every provider.
//
// PROF-07: the import-to-cloud toast must tell a genuinely empty device
// apart from a device whose data is already synced — both look identical
// through the imported counts alone (every count is 0), so the toast needs
// cloudImportService's sourceCounts to distinguish them.

const mockSignOut = vi.fn();
const mockPerformFullSignOut = vi.fn();
const mockImportLocalDataToCloud = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock("../../../lib/fullSignOut", () => ({
  performFullSignOut: (...args: unknown[]) => mockPerformFullSignOut(...args),
}));

vi.mock("../../../services/cloudImportService", () => ({
  importLocalDataToCloud: (...args: unknown[]) => mockImportLocalDataToCloud(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// Vitest runs without `globals: true`, so RTL's automatic afterEach cleanup
// never registers — unmount explicitly or the previous test's tree stays mounted.
afterEach(cleanup);

const authUser: AuthUser = { id: "u1", email: "t@example.com" };

function zeroCounts() {
  return {
    phrases: 0,
    reviewStates: 0,
    sessions: 0,
    tags: 0,
    conversationLessons: 0,
    lessonProgress: 0,
    profile: 0,
  };
}

function makeImportResult(overrides: Partial<CloudImportResult> = {}): CloudImportResult {
  return { ...zeroCounts(), sourceCounts: zeroCounts(), ...overrides };
}

describe("CloudAccountSection sign out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("clicking Sign out runs the full sign-out flow with the cloud session", async () => {
    mockPerformFullSignOut.mockResolvedValue(undefined);
    render(<CloudAccountSection authUser={authUser} signOut={mockSignOut} />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(mockPerformFullSignOut).toHaveBeenCalledTimes(1));
    expect(mockPerformFullSignOut).toHaveBeenCalledWith({
      hasCloudSession: true,
      signOutCloud: mockSignOut,
    });
  });

  test("surfaces an error toast and re-enables the button when sign-out fails", async () => {
    mockPerformFullSignOut.mockRejectedValue(new Error("network down"));
    render(<CloudAccountSection authUser={authUser} signOut={mockSignOut} />);

    const button = screen.getByRole("button", { name: /sign out/i });
    fireEvent.click(button);

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("network down"));
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});

describe("CloudAccountSection import to cloud", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  test("tells the user the device has no local data when every source count is zero", async () => {
    mockImportLocalDataToCloud.mockResolvedValue(makeImportResult());
    render(<CloudAccountSection authUser={authUser} signOut={mockSignOut} />);

    fireEvent.click(screen.getByRole("button", { name: /import this device's data/i }));

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith("This device has no local data to import.")
    );
  });

  test("tells the user their data is already synced when local data exists but nothing new was imported", async () => {
    mockImportLocalDataToCloud.mockResolvedValue(
      makeImportResult({ sourceCounts: { ...zeroCounts(), phrases: 3 } })
    );
    render(<CloudAccountSection authUser={authUser} signOut={mockSignOut} />);

    fireEvent.click(screen.getByRole("button", { name: /import this device's data/i }));

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Nothing new to import — your account already has this device's data."
      )
    );
  });

  test("reports the imported counts when new data was copied to the cloud", async () => {
    mockImportLocalDataToCloud.mockResolvedValue(
      makeImportResult({
        phrases: 2,
        sessions: 1,
        sourceCounts: { ...zeroCounts(), phrases: 2, sessions: 1 },
      })
    );
    render(<CloudAccountSection authUser={authUser} signOut={mockSignOut} />);

    fireEvent.click(screen.getByRole("button", { name: /import this device's data/i }));

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith("Imported 2 phrases, 1 sessions, 0 lessons, 0 tags.")
    );
  });
});

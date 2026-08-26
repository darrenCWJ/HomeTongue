import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProfilePage } from "./ProfilePage";

// The regression under test: the "Sign Out" button used to only flip the
// access-code gate flag, which is compiled out of builds without
// VITE_ACCESS_CODE — making the button a silent no-op. It must now run the
// full sign-out flow. Children are stubbed so this file tests only that
// wiring.

const mockSignOut = vi.fn();
const mockPerformFullSignOut = vi.fn();
const mockToastError = vi.fn();

let mockAuth: {
  isCloudAuthEnabled: boolean;
  authUser: { id: string; email: string | null } | null;
  signOut: () => Promise<void>;
};

vi.mock("../../app/context/AuthProvider", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("../../app/context/ProfileProvider", () => ({
  useProfile: () => ({
    userProfile: { id: "p1", name: "Test", activePersona: "personal" },
    updateUserProfile: vi.fn(),
    activePersona: "personal",
  }),
}));

vi.mock("../../hooks/useActiveLanguageCode", () => ({
  useActiveLanguagePack: () => ({ tts: { displayVoices: [] } }),
}));

vi.mock("../../lib/fullSignOut", () => ({
  performFullSignOut: (...args: unknown[]) => mockPerformFullSignOut(...args),
}));

vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args), success: vi.fn() },
}));

vi.mock("./components/ProfileHeader", () => ({ ProfileHeader: () => null }));
vi.mock("./components/PersonaSwitcher", () => ({ PersonaSwitcher: () => null }));
vi.mock("./components/VibeAnalysisCard", () => ({ VibeAnalysisCard: () => null }));
vi.mock("./components/SuggestedRepliesToggle", () => ({ SuggestedRepliesToggle: () => null }));
vi.mock("./components/AppearanceSection", () => ({ AppearanceSection: () => null }));
vi.mock("./components/VoiceSection", () => ({ VoiceSection: () => null }));
vi.mock("./components/TourReplaySection", () => ({ TourReplaySection: () => null }));
vi.mock("./components/CloudAccountSection", () => ({ CloudAccountSection: () => null }));
vi.mock("./components/DataPrivacySection", () => ({ DataPrivacySection: () => null }));

describe("ProfilePage sign out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth = {
      isCloudAuthEnabled: true,
      authUser: { id: "u1", email: "t@example.com" },
      signOut: mockSignOut,
    };
  });

  test("clicking Sign Out runs the full sign-out flow with the cloud session", async () => {
    mockPerformFullSignOut.mockResolvedValue(undefined);
    render(<ProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(mockPerformFullSignOut).toHaveBeenCalledTimes(1));
    expect(mockPerformFullSignOut).toHaveBeenCalledWith({
      hasCloudSession: true,
      signOutCloud: mockSignOut,
    });
  });

  test("guest (no cloud session) still signs out, without a cloud call", async () => {
    mockAuth = { isCloudAuthEnabled: false, authUser: null, signOut: mockSignOut };
    mockPerformFullSignOut.mockResolvedValue(undefined);
    render(<ProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(mockPerformFullSignOut).toHaveBeenCalledTimes(1));
    expect(mockPerformFullSignOut).toHaveBeenCalledWith({
      hasCloudSession: false,
      signOutCloud: mockSignOut,
    });
  });

  test("shows progress and blocks double-clicks while signing out", async () => {
    let resolveSignOut: () => void = () => {};
    mockPerformFullSignOut.mockImplementation(
      () => new Promise<void>((resolve) => (resolveSignOut = resolve))
    );
    render(<ProfilePage />);

    const button = screen.getByRole("button", { name: /sign out/i });
    fireEvent.click(button);

    await waitFor(() => expect(button).toBeDisabled());
    expect(button.textContent).toMatch(/signing out/i);
    fireEvent.click(button);
    expect(mockPerformFullSignOut).toHaveBeenCalledTimes(1);
    resolveSignOut();
  });

  test("surfaces an error toast and re-enables the button when sign-out fails", async () => {
    mockPerformFullSignOut.mockRejectedValue(new Error("network down"));
    render(<ProfilePage />);

    const button = screen.getByRole("button", { name: /sign out/i });
    fireEvent.click(button);

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("network down"));
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});

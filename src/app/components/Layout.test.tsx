import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Layout } from "./Layout";

// The bug under test (PROF-01): the gate chain rendered OnboardingPage on
// `!userProfile?.name`, which is also true while the profile is still loading
// and after a failed load. A returning user with a slow start saw onboarding,
// and finishing it upserted an empty profile over their stored row. Onboarding
// must only be reachable once hydration has actually settled.

const retryProfileLoad = vi.fn();

let mockProfile: {
  isSignedIn: boolean;
  userProfile: { name: string } | null;
  profileStatus: "loading" | "loaded" | "error";
  retryProfileLoad: () => void;
};

vi.mock("../context/AuthProvider", () => ({
  useAuth: () => ({ isCloudAuthEnabled: false, authUser: null, authLoading: false }),
}));

vi.mock("../context/ProfileProvider", () => ({
  useProfile: () => mockProfile,
}));

vi.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

vi.mock("../pages/SignInPage", () => ({
  SignInPage: () => <h2>Enter access code</h2>,
}));

vi.mock("../pages/AuthPage", () => ({
  AuthPage: () => <h2>Sign in to HomeTongue</h2>,
}));

// Stub stands in for the real onboarding flow, whose first step is this heading.
vi.mock("../pages/OnboardingPage", () => ({
  OnboardingPage: () => <h2>What&apos;s your name?</h2>,
}));

vi.mock("sonner", () => ({ Toaster: () => null }));

vi.mock("./tour/TourProvider", () => ({
  TourProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("./tour/TourOverlay", () => ({ TourOverlay: () => null }));
vi.mock("./tour/useTourAutoTrigger", () => ({ useTourAutoTrigger: () => {} }));

function renderLayout() {
  return render(
    <MemoryRouter>
      <Layout />
    </MemoryRouter>
  );
}

const onboardingHeading = () => screen.queryByRole("heading", { name: /what's your name/i });

beforeEach(() => {
  vi.clearAllMocks();
  // Passes the email gate; the access-code gate is open (no VITE_ACCESS_CODE).
  localStorage.setItem("ht_email_authed", "true");
  mockProfile = {
    isSignedIn: true,
    userProfile: null,
    profileStatus: "loading",
    retryProfileLoad,
  };
});

// Vitest runs without `globals: true`, so RTL's automatic cleanup never
// registers — unmount explicitly or the previous tree stays mounted.
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Layout profile gate", () => {
  test("shows a spinner instead of onboarding while the profile is loading", () => {
    // Arrange + Act
    renderLayout();

    // Assert
    expect(onboardingHeading()).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /chat/i })).not.toBeInTheDocument();
  });

  test("shows onboarding once the load settles with no stored profile", () => {
    // Arrange
    mockProfile = { ...mockProfile, profileStatus: "loaded", userProfile: null };

    // Act
    renderLayout();

    // Assert
    expect(onboardingHeading()).toBeInTheDocument();
  });

  test("offers a retry instead of onboarding when the profile load failed", () => {
    // Arrange
    mockProfile = { ...mockProfile, profileStatus: "error" };

    // Act
    renderLayout();

    // Assert
    expect(onboardingHeading()).not.toBeInTheDocument();
    expect(screen.getByText("Couldn't load your data.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(retryProfileLoad).toHaveBeenCalledTimes(1);
  });

  test("renders the app for a hydrated profile with a name", () => {
    // Arrange
    mockProfile = { ...mockProfile, profileStatus: "loaded", userProfile: { name: "Mei" } };

    // Act
    renderLayout();

    // Assert
    expect(onboardingHeading()).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /chat/i })).toBeInTheDocument();
  });
});

import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { TourPageId, UserProfile } from "@/types";
import { useTourAutoTrigger } from "./useTourAutoTrigger";

// LEARN-03 — the auto-trigger effect depended on the WHOLE `userProfile`
// object, so any unrelated profile write (a persona summary landing, a lesson
// score, a dialect switch) re-armed the 600ms timer. With writes arriving
// while the user works, the launch slid forward and eventually fired
// mid-lesson. The effect must key off the fields it actually reads.
//
// LEARN-03 (reviewer follow-up) — cancelling a tour clears `isActive`, which
// re-armed this timer and relaunched the same unshowable tour indefinitely.
// The effect must respect the provider's session-scoped suppression memory.

const mockStartTour = vi.fn();
let mockIsActive = false;
let mockProfile: UserProfile | null = null;
let mockPathname = "/learn";
let mockSuppressed = new Set<TourPageId>();

vi.mock("react-router", () => ({
  useLocation: () => ({ pathname: mockPathname }),
}));

vi.mock("@/app/context/ProfileProvider", () => ({
  useProfile: () => ({ userProfile: mockProfile }),
}));

// Identity-stable on purpose, mirroring the provider's `useCallback(…, [])`:
// an `isTourSuppressed` that changed every render would re-arm the launch timer
// on every re-render — the very bug the first test below guards.
const mockIsTourSuppressed = (pageId: TourPageId) => mockSuppressed.has(pageId);

vi.mock("./TourProvider", () => ({
  useTour: () => ({
    startTour: mockStartTour,
    isActive: mockIsActive,
    isTourSuppressed: mockIsTourSuppressed,
  }),
}));

function Probe() {
  useTourAutoTrigger();
  return null;
}

/** Nested object identity is preserved by ProfileProvider's `{...prev, ...updates}` writes. */
const TOUR_COMPLETED: UserProfile["tourCompleted"] = {};

function profileWith(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "p1",
    name: "Ann",
    activePersona: "personal",
    tourCompleted: TOUR_COMPLETED,
    ...overrides,
  } as UserProfile;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockIsActive = false;
  mockPathname = "/learn";
  mockProfile = profileWith();
  mockSuppressed = new Set();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("useTourAutoTrigger", () => {
  test("an unrelated profile write does not re-arm the pending launch timer", () => {
    // Arrange — the timer is armed and most of the way through its delay.
    const { rerender } = render(<Probe />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(mockStartTour).not.toHaveBeenCalled();

    // Act — an unrelated write replaces the profile object; name and
    // tourCompleted are untouched.
    mockProfile = profileWith({ updatedAt: "2026-08-27T00:00:00.000Z" });
    rerender(<Probe />);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Assert — the original 600ms deadline still stands.
    expect(mockStartTour).toHaveBeenCalledTimes(1);
    expect(mockStartTour).toHaveBeenCalledWith("learn");
  });

  test("does not start a tour that is already recorded as seen", () => {
    mockProfile = profileWith({ tourCompleted: { learn: true } });

    render(<Probe />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockStartTour).not.toHaveBeenCalled();
  });

  test("does not relaunch a tour that was cancelled earlier this session", () => {
    // A cancelled tour clears `isActive`, which re-runs this effect. Without
    // the suppression check that is an unbounded relaunch loop.
    mockSuppressed.add("learn");

    render(<Probe />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockStartTour).not.toHaveBeenCalled();
  });

  test("does not start a tour while another one is running", () => {
    mockIsActive = true;

    render(<Probe />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockStartTour).not.toHaveBeenCalled();
  });

  test("cancels the pending launch when the user leaves the page first", () => {
    const { rerender } = render(<Probe />);
    act(() => {
      vi.advanceTimersByTime(300);
    });

    mockPathname = "/bookmarks";
    rerender(<Probe />);
    act(() => {
      vi.advanceTimersByTime(400);
    });

    // The /learn deadline was dropped, not fired against the new page.
    expect(mockStartTour).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(mockStartTour).toHaveBeenCalledTimes(1);
    expect(mockStartTour).toHaveBeenCalledWith("bookmarks");
  });
});

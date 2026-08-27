import { useEffect } from "react";
import { useLocation } from "react-router";
import type { TourPageId } from "@/types";
import { useProfile } from "@/app/context/ProfileProvider";
import { useTour } from "./TourProvider";

const PATH_TO_PAGE: Record<string, TourPageId> = {
  "/": "chat",
  "/learn": "learn",
  "/bookmarks": "bookmarks",
  "/profile": "profile",
};

/** Lets the destination page paint before the spotlight cuts into it. */
const LAUNCH_DELAY_MS = 600;

export function useTourAutoTrigger(): void {
  const { pathname } = useLocation();
  const { userProfile } = useProfile();
  const { startTour, isActive, isTourSuppressed } = useTour();

  // Narrow deps, NOT the whole `userProfile`: every profile write replaces the
  // object, and depending on it re-armed this timer on writes that have nothing
  // to do with tours (persona summaries, lesson scores, dialect switches). With
  // writes arriving while the user works, the launch kept sliding forward and
  // eventually fired mid-lesson. `tourCompleted` survives unrelated writes by
  // reference — ProfileProvider patches with `{...prev, ...updates}`.
  const profileName = userProfile?.name;
  const tourCompleted = userProfile?.tourCompleted;

  useEffect(() => {
    if (isActive) return;
    if (!profileName) return;

    const pageId = PATH_TO_PAGE[pathname];
    if (!pageId) return;

    if (tourCompleted?.[pageId]) return;

    // A tour that already cancelled here does not get to try again this
    // session. `cancelTour` deliberately leaves `tourCompleted` alone, and
    // clearing `isActive` re-runs this effect — without this guard the pair is
    // an unbounded relaunch loop on any page whose step-0 anchor is missing
    // (e.g. a /learn sub-view). An explicit `startTour` clears the entry, so
    // the Profile REPLAY buttons still work.
    if (isTourSuppressed(pageId)) return;

    const timer = setTimeout(() => {
      startTour(pageId);
    }, LAUNCH_DELAY_MS);

    return () => clearTimeout(timer);
  }, [pathname, profileName, tourCompleted, isActive, startTour, isTourSuppressed]);
}

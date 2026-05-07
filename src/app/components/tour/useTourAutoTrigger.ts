import { useEffect } from "react";
import { useLocation } from "react-router";
import type { TourPageId } from "@/types";
import { useAppContext } from "@/app/context/AppContext";
import { useTour } from "./TourProvider";

const PATH_TO_PAGE: Record<string, TourPageId> = {
  "/": "chat",
  "/learn": "learn",
  "/bookmarks": "bookmarks",
  "/profile": "profile",
};

export function useTourAutoTrigger(): void {
  const { pathname } = useLocation();
  const { userProfile } = useAppContext();
  const { startTour, isActive } = useTour();

  useEffect(() => {
    if (isActive) return;
    if (!userProfile?.name) return;

    const pageId = PATH_TO_PAGE[pathname];
    if (!pageId) return;

    const alreadySeen = userProfile.tourCompleted?.[pageId];
    if (alreadySeen) return;

    const timer = setTimeout(() => {
      startTour(pageId);
    }, 600);

    return () => clearTimeout(timer);
  }, [pathname, userProfile, isActive, startTour]);
}

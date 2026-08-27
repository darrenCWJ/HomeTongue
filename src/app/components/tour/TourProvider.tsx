import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { TourPageId } from "@/types";
import { useProfile } from "@/app/context/ProfileProvider";
import { TOUR_STEPS } from "./tourConfig";

interface TourContextType {
  startTour: (pageId: TourPageId) => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
  cancelTour: (pageId: TourPageId) => void;
  isTourSuppressed: (pageId: TourPageId) => boolean;
  activeTour: TourPageId | null;
  currentStep: number;
  totalSteps: number;
  isActive: boolean;
  /** Bumped by every `startTour`, so consumers can reset per-run state even when the page is unchanged. */
  tourRunId: number;
}

const TourContext = createContext<TourContextType | null>(null);

export function useTour(): TourContextType {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}

interface TourProviderProps {
  children: ReactNode;
}

export function TourProvider({ children }: TourProviderProps) {
  const { updateUserProfile, userProfile } = useProfile();
  const [activeTour, setActiveTour] = useState<TourPageId | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [tourRunId, setTourRunId] = useState(0);

  // Pages whose tour was cancelled during THIS session. In-memory on purpose:
  // a cancel means "could not be shown here, right now", not "seen" — a reload
  // clears it and the automatic launch gets another chance. See `cancelTour`.
  const suppressedPagesRef = useRef<Set<TourPageId>>(new Set());

  const totalSteps = activeTour ? TOUR_STEPS[activeTour].length : 0;
  const isActive = activeTour !== null;

  const completeTour = useCallback(
    (pageId: TourPageId) => {
      setActiveTour(null);
      setCurrentStep(0);
      updateUserProfile({
        tourCompleted: { ...userProfile?.tourCompleted, [pageId]: true },
      });
    },
    [updateUserProfile, userProfile?.tourCompleted]
  );

  const startTour = useCallback((pageId: TourPageId) => {
    const steps = TOUR_STEPS[pageId];
    if (steps.length === 0) return;
    // An explicit start is the user asking for this tour (the Profile REPLAY
    // buttons), which outranks any earlier cancel — otherwise replay would be
    // dead for the rest of the session on exactly the pages that cancelled.
    suppressedPagesRef.current.delete(pageId);
    setActiveTour(pageId);
    setCurrentStep(0);
    // Restarting the tour that is already running is a same-value state update
    // React bails out of, so this counter is what tells the overlay a new run
    // began and its per-run state has to be reset.
    setTourRunId((id) => id + 1);
  }, []);

  const nextStep = useCallback(() => {
    if (!activeTour) return;
    if (currentStep >= totalSteps - 1) {
      completeTour(activeTour);
    } else {
      setCurrentStep((s) => s + 1);
    }
  }, [activeTour, currentStep, totalSteps, completeTour]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  const skipTour = useCallback(() => {
    if (activeTour) {
      completeTour(activeTour);
    }
  }, [activeTour, completeTour]);

  /**
   * Ends the tour WITHOUT recording it as seen — the counterpart to
   * `completeTour`. Used when the tour could not actually be shown (its
   * `[data-tour]` anchors never rendered): writing `tourCompleted` there would
   * burn the user's one automatic showing on a tour they never saw.
   *
   * Not writing the flag leaves the automatic launch armed, though, and that
   * is a loop: on /learn a lesson/exam/roadmap sub-view keeps the pathname but
   * unmounts the step-0 anchor, so the tour relaunched, dimmed the screen,
   * failed its retries and cancelled again roughly every 1.1s. Remembering the
   * cancel for the rest of the session breaks that without lying about what
   * the user has seen.
   */
  const cancelTour = useCallback((pageId: TourPageId) => {
    suppressedPagesRef.current.add(pageId);
    setActiveTour(null);
    setCurrentStep(0);
  }, []);

  /** Reads the session-scoped cancel memory. Stable, so it never re-arms a caller's effect. */
  const isTourSuppressed = useCallback(
    (pageId: TourPageId) => suppressedPagesRef.current.has(pageId),
    []
  );

  const value = useMemo(
    () => ({
      startTour,
      nextStep,
      prevStep,
      skipTour,
      cancelTour,
      isTourSuppressed,
      activeTour,
      currentStep,
      totalSteps,
      isActive,
      tourRunId,
    }),
    [
      startTour,
      nextStep,
      prevStep,
      skipTour,
      cancelTour,
      isTourSuppressed,
      activeTour,
      currentStep,
      totalSteps,
      isActive,
      tourRunId,
    ]
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

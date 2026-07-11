import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { TourPageId } from "@/types";
import { useProfile } from "@/app/context/ProfileProvider";
import { TOUR_STEPS } from "./tourConfig";

interface TourContextType {
  startTour: (pageId: TourPageId) => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
  activeTour: TourPageId | null;
  currentStep: number;
  totalSteps: number;
  isActive: boolean;
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
    setActiveTour(pageId);
    setCurrentStep(0);
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

  const value = useMemo(
    () => ({
      startTour,
      nextStep,
      prevStep,
      skipTour,
      activeTour,
      currentStep,
      totalSteps,
      isActive,
    }),
    [startTour, nextStep, prevStep, skipTour, activeTour, currentStep, totalSteps, isActive]
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

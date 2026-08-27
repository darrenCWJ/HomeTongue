import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useTour } from "./TourProvider";
import { TOUR_STEPS } from "./tourConfig";
import type { TourPlacement } from "./tourConfig";

interface SpotlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PADDING = 8;
const BORDER_RADIUS = 12;

/** Anchors can lag the overlay by a frame or two (lazy chunk, layout, animation). */
const ANCHOR_RETRY_MS = 100;
const MAX_ANCHOR_RETRIES = 5;

export type MissingAnchorAction = "cancel" | "advance";

/**
 * Decides what to do when a step's `[data-tour]` anchor is still absent after
 * the retry budget.
 *
 * A missing anchor is ambiguous: the page may legitimately hide that control
 * (an empty bookmarks list has no phrase card), or the whole page may simply
 * not be there. Advancing blindly is what let a tour burn through every step
 * behind a dark overlay and then write `tourCompleted` — marking itself seen
 * without ever being shown. So:
 *
 * - step 0 missing with nothing ever rendered → the tour never started;
 *   cancel, leave the flag alone.
 * - step 0 missing after something HAS rendered → the user walked Back into a
 *   step whose anchor has since unmounted. They are mid-tour and reading;
 *   treat it like any other missing step rather than destroying the run.
 * - a later step missing → skip it, that content is genuinely optional.
 * - the LAST step missing with nothing ever rendered → cancel instead of
 *   completing, so the write still requires at least one real showing.
 */
export function resolveMissingAnchor(
  stepIndex: number,
  anyStepRendered: boolean,
  isLastStep: boolean
): MissingAnchorAction {
  if (!anyStepRendered && (stepIndex === 0 || isLastStep)) return "cancel";
  return "advance";
}

function getTargetRect(target: string): SpotlightRect | null {
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return {
    x: rect.x - PADDING,
    y: rect.y - PADDING,
    width: rect.width + PADDING * 2,
    height: rect.height + PADDING * 2,
  };
}

function getTooltipPosition(
  rect: SpotlightRect,
  placement: TourPlacement,
  tooltipWidth: number,
  tooltipHeight: number
): { top: number; left: number } {
  const gap = 12;
  let top = 0;
  let left = 0;

  switch (placement) {
    case "bottom":
      top = rect.y + rect.height + gap;
      left = rect.x + rect.width / 2 - tooltipWidth / 2;
      break;
    case "top":
      top = rect.y - tooltipHeight - gap;
      left = rect.x + rect.width / 2 - tooltipWidth / 2;
      break;
    case "left":
      top = rect.y + rect.height / 2 - tooltipHeight / 2;
      left = rect.x - tooltipWidth - gap;
      break;
    case "right":
      top = rect.y + rect.height / 2 - tooltipHeight / 2;
      left = rect.x + rect.width + gap;
      break;
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  left = Math.max(12, Math.min(left, viewportWidth - tooltipWidth - 12));
  top = Math.max(12, Math.min(top, viewportHeight - tooltipHeight - 12));

  return { top, left };
}

export function TourOverlay() {
  const {
    isActive,
    activeTour,
    currentStep,
    totalSteps,
    tourRunId,
    nextStep,
    prevStep,
    skipTour,
    cancelTour,
  } = useTour();
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Evidence that the user was actually shown something. Kept per tour run so a
  // replay cannot inherit an earlier run's claim.
  const anyStepRenderedRef = useRef(false);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  // Declared BEFORE the positioning effect below: effects run in declaration
  // order, so the reset lands before the first pass of a newly started tour.
  // Keyed on `tourRunId` as well as the page: restarting the tour that is
  // already running is a same-value state update React bails out of, which
  // would otherwise carry the previous run's "was shown" claim into the new
  // one. The rects are cleared too, so a new run cannot flash the old run's
  // spotlight and tooltip before the first positioning pass lands.
  useEffect(() => {
    anyStepRenderedRef.current = false;
    setSpotlightRect(null);
    setTooltipPos({ top: 0, left: 0 });
  }, [activeTour, tourRunId]);

  // The retry chain belongs to exactly one step of one tour. Advancing, going
  // back, restarting, skipping or cancelling must kill a pending retry —
  // otherwise it fires with a stale closure and advances past the step the user
  // is now reading, or spotlights the wrong element.
  useEffect(() => {
    retryCountRef.current = 0;
    return () => {
      clearRetryTimer();
      retryCountRef.current = 0;
    };
  }, [activeTour, tourRunId, currentStep, isActive, clearRetryTimer]);

  const updatePosition = useCallback(
    function positionPass() {
      // Depend on the run id even though the body never reads it: restarting
      // the tour that is already running keeps `activeTour`/`currentStep`
      // identical, so without this the reset effect above clears the per-run
      // refs and rects with no repositioning pass to follow.
      void tourRunId;
      if (!activeTour) return;
      const steps = TOUR_STEPS[activeTour];
      const step = steps[currentStep];
      if (!step) return;

      const rect = getTargetRect(step.target);
      if (!rect) {
        clearRetryTimer();
        if (retryCountRef.current < MAX_ANCHOR_RETRIES) {
          retryCountRef.current += 1;
          retryTimerRef.current = setTimeout(positionPass, ANCHOR_RETRY_MS);
          return;
        }
        retryCountRef.current = 0;
        const action = resolveMissingAnchor(
          currentStep,
          anyStepRenderedRef.current,
          currentStep >= steps.length - 1
        );
        if (action === "cancel") {
          cancelTour(activeTour);
        } else {
          nextStep();
        }
        return;
      }

      clearRetryTimer();
      retryCountRef.current = 0;
      anyStepRenderedRef.current = true;
      setSpotlightRect(rect);

      requestAnimationFrame(() => {
        const tooltipEl = tooltipRef.current;
        const tooltipWidth = tooltipEl?.offsetWidth ?? 280;
        const tooltipHeight = tooltipEl?.offsetHeight ?? 140;
        const pos = getTooltipPosition(rect, step.placement, tooltipWidth, tooltipHeight);
        setTooltipPos(pos);
      });
    },
    [activeTour, tourRunId, currentStep, nextStep, cancelTour, clearRetryTimer]
  );

  useEffect(() => {
    if (!isActive) return;
    updatePosition();
    const handleResize = () => updatePosition();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isActive, updatePosition]);

  useEffect(() => {
    if (!isActive) return;

    const el = activeTour
      ? document.querySelector(`[data-tour="${TOUR_STEPS[activeTour][currentStep]?.target}"]`)
      : null;

    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const timer = setTimeout(updatePosition, 350);
      return () => clearTimeout(timer);
    }
  }, [isActive, activeTour, currentStep, updatePosition]);

  useEffect(() => {
    if (!isActive) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skipTour();
      if (e.key === "ArrowRight") nextStep();
      if (e.key === "ArrowLeft") prevStep();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isActive, skipTour, nextStep, prevStep]);

  if (!isActive || !activeTour) return null;

  const step = TOUR_STEPS[activeTour][currentStep];
  if (!step) return null;

  return createPortal(
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[60]"
          role="dialog"
          aria-modal="true"
          aria-label="Feature tour"
        >
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <defs>
              <mask id="tour-spotlight-mask">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                {spotlightRect && (
                  <motion.rect
                    animate={{
                      x: spotlightRect.x,
                      y: spotlightRect.y,
                      width: spotlightRect.width,
                      height: spotlightRect.height,
                    }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    rx={BORDER_RADIUS}
                    ry={BORDER_RADIUS}
                    fill="black"
                  />
                )}
              </mask>
            </defs>
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.6)"
              mask="url(#tour-spotlight-mask)"
            />
          </svg>

          {/* Mouse-only dismiss backdrop; keyboard users skip via the Skip button below. */}
          <div role="presentation" className="absolute inset-0" onClick={skipTour} />

          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              ref={tooltipRef}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="fixed bg-card rounded-2xl shadow-xl p-4 w-[280px] z-[61]"
              style={{ top: tooltipPos.top, left: tooltipPos.left }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-1">
                <h3 className="font-semibold text-foreground text-sm">{step.title}</h3>
                <span className="text-xs text-faint whitespace-nowrap ml-2">
                  {currentStep + 1} / {totalSteps}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{step.description}</p>
              <div className="flex items-center justify-between">
                <button
                  onClick={skipTour}
                  className="text-xs text-faint hover:text-muted-foreground transition-colors"
                >
                  Skip
                </button>
                <div className="flex gap-2">
                  {currentStep > 0 && (
                    <button
                      onClick={prevStep}
                      className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted rounded-lg hover:bg-secondary transition-colors"
                    >
                      Back
                    </button>
                  )}
                  <button
                    onClick={nextStep}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue/90 transition-colors"
                  >
                    {currentStep === totalSteps - 1 ? "Done" : "Next"}
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

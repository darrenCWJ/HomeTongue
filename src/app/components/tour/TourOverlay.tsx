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
  const { isActive, activeTour, currentStep, totalSteps, nextStep, prevStep, skipTour } = useTour();
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const retryCountRef = useRef(0);

  const updatePosition = useCallback(function positionPass() {
    if (!activeTour) return;
    const step = TOUR_STEPS[activeTour][currentStep];
    if (!step) return;

    const rect = getTargetRect(step.target);
    if (!rect) {
      if (retryCountRef.current < 5) {
        retryCountRef.current += 1;
        setTimeout(positionPass, 100);
      } else {
        retryCountRef.current = 0;
        nextStep();
      }
      return;
    }

    retryCountRef.current = 0;
    setSpotlightRect(rect);

    requestAnimationFrame(() => {
      const tooltipEl = tooltipRef.current;
      const tooltipWidth = tooltipEl?.offsetWidth ?? 280;
      const tooltipHeight = tooltipEl?.offsetHeight ?? 140;
      const pos = getTooltipPosition(rect, step.placement, tooltipWidth, tooltipHeight);
      setTooltipPos(pos);
    });
  }, [activeTour, currentStep, nextStep]);

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

          <div className="absolute inset-0" onClick={skipTour} />

          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              ref={tooltipRef}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="fixed bg-white rounded-2xl shadow-xl p-4 w-[280px] z-[61]"
              style={{ top: tooltipPos.top, left: tooltipPos.left }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-1">
                <h3 className="font-semibold text-zinc-900 text-sm">{step.title}</h3>
                <span className="text-xs text-zinc-400 whitespace-nowrap ml-2">
                  {currentStep + 1} / {totalSteps}
                </span>
              </div>
              <p className="text-xs text-zinc-600 mb-4 leading-relaxed">{step.description}</p>
              <div className="flex items-center justify-between">
                <button
                  onClick={skipTour}
                  className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  Skip
                </button>
                <div className="flex gap-2">
                  {currentStep > 0 && (
                    <button
                      onClick={prevStep}
                      className="px-3 py-1.5 text-xs font-medium text-zinc-600 bg-zinc-100 rounded-lg hover:bg-zinc-200 transition-colors"
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

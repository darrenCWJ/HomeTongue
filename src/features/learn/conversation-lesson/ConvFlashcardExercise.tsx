import React, { useState } from "react";
import { Bookmark } from "lucide-react";
import { useLibrary } from "../../../app/context/LibraryProvider";
import { getActiveLanguagePack } from "../../../languages";
import { motion, animate, useMotionValue } from "motion/react";
import type { VocabItem } from "../../../types";
import { PlayButton } from "../shared";

// ─── ConvFlashcardExercise ────────────────────────────────────────────────────

const CARD_EXIT_S = 0.18;
/** Bounded for the same reason as FlashcardExercise — see the note there. */
const CARD_EXIT_TIMEOUT_MS = 400;

const bounded = (exit: { then: (onResolve: VoidFunction) => Promise<void> }) =>
  Promise.race([
    exit.then(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, CARD_EXIT_TIMEOUT_MS)),
  ]);

export function ConvFlashcardExercise({ vocab, onComplete }: { vocab: VocabItem[]; onComplete: () => void }) {
  const { phrases, addPhrase, toggleBookmark } = useLibrary();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [swipeDir, setSwipeDir] = useState<"right" | "left" | null>(null);
  const dragOccurred = React.useRef(false);
  const isAnimatingRef = React.useRef(false);
  const x = useMotionValue(0);
  const current = vocab[index];
  const isLast = index === vocab.length - 1;

  if (vocab.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 gap-4">
        <p className="text-muted-foreground text-sm">No phrases available.</p>
        <button onClick={onComplete} className="bg-brand-blue/100 text-white px-6 py-3 rounded-2xl font-bold">
          Continue
        </button>
      </div>
    );
  }

  const phraseId = `lesson-${current.dialect}`;
  const savedPhrase = phrases.find((p) => p.id === phraseId);
  const isBookmarked = savedPhrase?.isBookmarked ?? false;

  const handleBookmark = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!savedPhrase) {
      addPhrase({
        id: phraseId,
        original: current.english,
        dialect: current.dialect,
        pronunciation: current.romanization,
        isBookmarked: true,
        context: "Conversation Lesson",
        languageCode: getActiveLanguagePack().code,
      });
    } else {
      toggleBookmark(phraseId);
    }
  };

  const goToCard = async (nextIndex: number, dir: "left" | "right") => {
    // `index` only moves after the exit tween below, so a tap landing inside
    // it would run a second full advance off the same stale index (see
    // FlashcardExercise — same guard, same reason).
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    setSwipeDir(null);
    const exitX = dir === "left" ? -420 : 420;
    const enterX = dir === "left" ? 420 : -420;
    await bounded(animate(x, exitX, { duration: CARD_EXIT_S, ease: [0.32, 0.72, 0, 1] }));
    if (nextIndex >= vocab.length) {
      // Stays latched on purpose: onComplete tears this exercise down.
      onComplete();
      return;
    }
    x.set(enterX);
    setIndex(nextIndex);
    setFlipped(false);
    isAnimatingRef.current = false;
    animate(x, 0, { duration: 0.22, ease: [0.32, 0.72, 0, 1] });
  };

  const handleDragEnd = (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    if (info.offset.x < -80 || info.velocity.x < -500) {
      dragOccurred.current = true;
      goToCard(index + 1, "left");
    } else if ((info.offset.x > 80 || info.velocity.x > 500) && index > 0) {
      dragOccurred.current = true;
      goToCard(index - 1, "right");
    } else {
      animate(x, 0, { type: "spring", stiffness: 400, damping: 40 });
    }
    setTimeout(() => {
      dragOccurred.current = false;
    }, 0);
  };

  return (
    <div className="flex flex-col items-center p-6 gap-6">
      <div className="text-sm text-faint font-medium">
        {index + 1} / {vocab.length}
      </div>

      <div className="w-full max-w-sm relative select-none">
        {/* Swipe indicators */}
        <div
          className={`absolute inset-y-0 left-0 flex items-center pl-2 z-10 pointer-events-none transition-opacity duration-100 ${swipeDir === "right" && index > 0 ? "opacity-100" : "opacity-0"}`}
        >
          <div className="bg-muted text-muted-foreground rounded-xl px-2.5 py-1 text-xs font-bold">
            ← Back
          </div>
        </div>
        <div
          className={`absolute inset-y-0 right-0 flex items-center pr-2 z-10 pointer-events-none transition-opacity duration-100 ${swipeDir === "left" ? "opacity-100" : "opacity-0"}`}
        >
          <div className="bg-brand-blue/15 text-brand-blue rounded-xl px-2.5 py-1 text-xs font-bold">
            {isLast ? "Finish" : "Next"} →
          </div>
        </div>

        <div style={{ perspective: 1000 }}>
          <motion.div
            style={{ x }}
            drag="x"
            dragConstraints={false}
            whileDrag={{ scale: 1.02 }}
            onDragStart={() => {
              dragOccurred.current = false;
            }}
            onDrag={(_, info) => {
              if (Math.abs(info.offset.x) > 8) dragOccurred.current = true;
              if (info.offset.x > 40) setSwipeDir("right");
              else if (info.offset.x < -40) setSwipeDir("left");
              else setSwipeDir(null);
            }}
            onDragEnd={handleDragEnd}
            onClick={() => {
              if (!dragOccurred.current) setFlipped((f) => !f);
            }}
            className="cursor-grab active:cursor-grabbing"
          >
            <motion.div
              animate={{ rotateY: flipped ? 180 : 0 }}
              transition={{ duration: 0.4 }}
              style={{ transformStyle: "preserve-3d", position: "relative", height: 220 }}
            >
              {/* Front face */}
              <div
                className="absolute inset-0 bg-card rounded-3xl shadow-md border border-border-subtle flex flex-col items-center justify-center p-6"
                style={{ backfaceVisibility: "hidden" }}
              >
                <span className="text-xs font-semibold uppercase tracking-widest text-brand-blue/60 mb-4">
                  English
                </span>
                <span className="text-3xl font-bold text-foreground text-center">{current.english}</span>
                <span className="text-xs text-faint mt-4">Tap for translation · Swipe to navigate</span>
              </div>

              {/* Back face */}
              <div
                className="absolute inset-0 bg-brand-blue/100 rounded-3xl shadow-md flex flex-col p-5 overflow-hidden"
                style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
              >
                <button
                  onClick={handleBookmark}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/20 transition-colors z-10"
                >
                  <Bookmark
                    size={16}
                    className={isBookmarked ? "fill-white text-white" : "text-brand-blue/60"}
                  />
                </button>

                <div className="flex flex-col items-center justify-center flex-1">
                  <span className="text-xs font-semibold uppercase tracking-widest text-brand-blue/60 mb-2">
                    Cantonese
                  </span>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-4xl font-bold text-white text-center">{current.dialect}</span>
                    <PlayButton text={current.dialect} withSlow />
                  </div>
                  {current.romanization && (
                    <span className="text-base text-brand-blue/60 font-mono">{current.romanization}</span>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      <div className="flex gap-3 w-full max-w-sm">
        {index > 0 && (
          <button
            onClick={() => goToCard(index - 1, "right")}
            className="flex-1 py-3 rounded-2xl border border-border text-muted-foreground font-semibold text-sm hover:bg-background active:scale-95 transition-all"
          >
            Back
          </button>
        )}
        <button
          onClick={() => goToCard(index + 1, "left")}
          className="flex-1 py-3 rounded-2xl font-bold text-sm shadow transition-all active:scale-95 bg-brand-blue/100 text-white hover:bg-brand-blue"
        >
          {isLast ? "Finish" : "Next"}
        </button>
      </div>

      <div className="flex gap-1.5">
        {vocab.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-brand-blue/100" : i < index ? "w-2 bg-brand-blue/20" : "w-2 bg-secondary"}`}
          />
        ))}
      </div>
    </div>
  );
}

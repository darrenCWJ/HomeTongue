import React, { useState } from "react";
import { Bookmark, Loader2 } from "lucide-react";
import { useProfile } from "../../../app/context/ProfileProvider";
import { useLibrary } from "../../../app/context/LibraryProvider";
import { getExampleMeta } from "../../../services/translationService";
import { getActiveLanguagePack } from "../../../languages";
import { motion, animate, useMotionValue } from "motion/react";
import type { LessonLevel } from "../../../types";
import { PlayButton, personalise } from "../shared";

// ─── Flashcard Exercise ───────────────────────────────────────────────────────

type ExampleMeta = { translation: string; pronunciation: string };

export function FlashcardExercise({
  level,
  onComplete,
}: {
  level: LessonLevel;
  onComplete: () => void;
  onBack: () => void;
}) {
  const { userProfile } = useProfile();
  const { phrases, addPhrase, toggleBookmark } = useLibrary();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [swipeDir, setSwipeDir] = useState<"right" | "left" | null>(null);
  const [exampleCache, setExampleCache] = useState<Record<number, ExampleMeta | "loading">>({});
  const dragOccurred = React.useRef(false);
  const x = useMotionValue(0);
  const items = level.vocabulary;
  const current = items[index];
  const isLast = index === items.length - 1;
  const currentMeta = exampleCache[index];

  React.useEffect(() => {
    if (!flipped || !current.exampleSentence || exampleCache[index]) return;
    setExampleCache((prev) => ({ ...prev, [index]: "loading" }));
    const sentence = personalise(current.exampleSentence!, userProfile?.name);
    getExampleMeta(sentence).then((meta) => {
      setExampleCache((prev) => ({ ...prev, [index]: meta }));
    });
  }, [flipped, index]);

  const phraseId = `lesson-${current.cantonese}`;
  const savedPhrase = phrases.find((p) => p.id === phraseId);
  const isBookmarked = savedPhrase?.isBookmarked ?? false;

  const handleBookmark = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!savedPhrase) {
      addPhrase({
        id: phraseId,
        original: current.english,
        dialect: current.cantonese,
        pronunciation: current.pronunciation,
        isBookmarked: true,
        context: level.title,
        languageCode: getActiveLanguagePack().code,
      });
    } else {
      toggleBookmark(phraseId);
    }
  };

  const goToCard = async (nextIndex: number, dir: "left" | "right") => {
    setSwipeDir(null);
    const exitX = dir === "left" ? -420 : 420;
    const enterX = dir === "left" ? 420 : -420;
    await animate(x, exitX, { duration: 0.18, ease: [0.32, 0.72, 0, 1] });
    if (nextIndex >= items.length) {
      onComplete();
      return;
    }
    x.set(enterX);
    setIndex(nextIndex);
    setFlipped(false);
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

  const cardHeight = current.exampleSentence ? 320 : 220;

  return (
    <div className="flex flex-col items-center p-6 gap-6">
      <div className="text-sm text-zinc-400 font-medium">
        {index + 1} / {items.length}
      </div>

      <div className="w-full max-w-sm relative select-none">
        {/* Swipe indicators */}
        <div
          className={`absolute inset-y-0 left-0 flex items-center pl-2 z-10 pointer-events-none transition-opacity duration-100 ${swipeDir === "right" && index > 0 ? "opacity-100" : "opacity-0"}`}
        >
          <div className="bg-zinc-100 text-zinc-500 rounded-xl px-2.5 py-1 text-xs font-bold">← Back</div>
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
              style={{ transformStyle: "preserve-3d", position: "relative", height: cardHeight }}
            >
              {/* ── Front face ── */}
              <div
                className="absolute inset-0 bg-white rounded-3xl shadow-md border border-zinc-100 flex flex-col items-center justify-center p-6"
                style={{ backfaceVisibility: "hidden" }}
              >
                <span className="text-xs font-semibold uppercase tracking-widest text-brand-blue/60 mb-4">
                  English
                </span>
                <span className="text-3xl font-bold text-zinc-800 text-center">{current.english}</span>
                <span className="text-xs text-zinc-400 mt-4">Tap for translation · Swipe to navigate</span>
              </div>

              {/* ── Back face ── */}
              <div
                className="absolute inset-0 bg-brand-blue/100 rounded-3xl shadow-md flex flex-col p-5 overflow-hidden"
                style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
              >
                {/* Bookmark */}
                <button
                  onClick={handleBookmark}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/20 transition-colors z-10"
                >
                  <Bookmark size={16} className={isBookmarked ? "fill-white text-white" : "text-white/40"} />
                </button>

                {/* Main word section */}
                <div className="flex flex-col items-center pt-1 pb-3">
                  <span className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-2">
                    Cantonese
                  </span>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-4xl font-bold text-white text-center">{current.cantonese}</span>
                    <PlayButton text={current.cantonese} />
                  </div>
                  <span className="text-base text-white/70 font-mono">{current.pronunciation}</span>
                </div>

                {/* Example sentence section */}
                {current.exampleSentence && (
                  <div className="bg-brand-blue/50 rounded-2xl p-3.5 flex flex-col gap-2 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white/60 uppercase tracking-widest">
                        How to use
                      </span>
                      <PlayButton text={personalise(current.exampleSentence, userProfile?.name)} size="sm" />
                    </div>
                    <p className="text-sm font-semibold text-white leading-snug">
                      {personalise(current.exampleSentence, userProfile?.name)}
                    </p>
                    {currentMeta === "loading" ? (
                      <div className="flex items-center gap-1.5">
                        <Loader2 size={11} className="animate-spin text-white/40" />
                        <span className="text-xs text-white/40">Loading…</span>
                      </div>
                    ) : currentMeta ? (
                      <>
                        {currentMeta.pronunciation && (
                          <p className="text-xs font-mono text-white/70 leading-snug">
                            {currentMeta.pronunciation}
                          </p>
                        )}
                        {currentMeta.translation && (
                          <p className="text-xs text-brand-white italic">"{currentMeta.translation}"</p>
                        )}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      <div className="flex gap-3 w-full max-w-sm">
        {index > 0 && (
          <button
            onClick={() => goToCard(index - 1, "right")}
            className="flex-1 py-3 rounded-2xl border border-zinc-200 text-zinc-600 font-semibold text-sm hover:bg-zinc-50 active:scale-95 transition-all"
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
        {items.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-brand-blue/100" : i < index ? "w-2 bg-brand-blue/20" : "w-2 bg-zinc-200"}`}
          />
        ))}
      </div>
    </div>
  );
}

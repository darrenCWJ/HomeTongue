import { useState } from "react";
import { X } from "lucide-react";
import { useProfile } from "../../../app/context/ProfileProvider";
import { motion, AnimatePresence } from "motion/react";
import type { VocabItem } from "../../../types";
import { PlayButton, personalise } from "../shared";

// ─── DailyReviewModal ─────────────────────────────────────────────────────────

export function DailyReviewModal({ card, onClose }: { card: VocabItem; onClose: () => void }) {
  const { userProfile } = useProfile();
  const [flipped, setFlipped] = useState(false);

  return (
    <AnimatePresence>
      <motion.div
        key="daily-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
          className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-brand-blue to-brand-red px-6 pt-6 pb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-0.5">
                Word of the Day
              </p>
              <h3 className="text-lg font-bold text-white">Today's Phrase</h3>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Flashcard */}
          <div className="p-6">
            <div
              onClick={() => setFlipped((f) => !f)}
              className="cursor-pointer select-none mb-6"
              style={{ perspective: 1000 }}
            >
              <motion.div
                animate={{ rotateY: flipped ? 180 : 0 }}
                transition={{ duration: 0.4 }}
                style={{ transformStyle: "preserve-3d", position: "relative", height: 160 }}
              >
                {/* Front */}
                <div
                  className="absolute inset-0 bg-zinc-50 rounded-2xl border border-zinc-100 flex flex-col items-center justify-center p-6"
                  style={{ backfaceVisibility: "hidden" }}
                >
                  <span className="text-xs font-semibold uppercase tracking-widest text-brand-blue/60 mb-3">
                    English
                  </span>
                  <span className="text-2xl font-bold text-zinc-800 text-center">{card.english}</span>
                  <span className="text-xs text-zinc-400 mt-3">Tap to reveal</span>
                </div>
                {/* Back */}
                <div
                  className="absolute inset-0 bg-brand-blue/100 rounded-2xl flex flex-col items-center justify-center p-6"
                  style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                >
                  <span className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-2">
                    Translation
                  </span>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-3xl font-bold text-white">{card.dialect}</span>
                    <PlayButton text={card.dialect} withSlow />
                  </div>
                  <span className="text-base text-white/70 font-mono">{card.romanization}</span>
                </div>
              </motion.div>
            </div>

            {/* How to use it */}
            <div className="bg-brand-blue/10 rounded-2xl p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-blue/60 mb-2">
                How to use it
              </p>
              {card.exampleSentence ? (
                <>
                  <p className="text-base font-bold text-zinc-800 mb-1">
                    {personalise(card.exampleSentence, userProfile?.name)}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Use <span className="font-semibold text-brand-blue">{card.dialect}</span> (
                    {card.romanization}) when {card.english.toLowerCase().replace(/[?.!]/g, "")}.
                  </p>
                </>
              ) : (
                <p className="text-sm text-zinc-600">
                  Say <span className="font-bold text-brand-blue">{card.dialect}</span> ({card.romanization})
                  to mean "<span className="italic">{card.english}</span>" in everyday conversation.
                </p>
              )}
            </div>

            <button
              onClick={() => {
                setFlipped(false);
                onClose();
              }}
              className="mt-4 w-full py-3 bg-brand-blue/100 text-white font-bold rounded-2xl shadow hover:bg-brand-blue active:scale-95 transition-all"
            >
              Got it!
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

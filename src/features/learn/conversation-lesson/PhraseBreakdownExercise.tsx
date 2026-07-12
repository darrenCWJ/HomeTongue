import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { generateWordBreakdown } from "../../../services/translationService";
import { motion, AnimatePresence } from "motion/react";
import type { WordChunk, VocabItem } from "../../../types";
import { PlayButtonDark } from "../shared";

// ─── PhraseBreakdownExercise ──────────────────────────────────────────────────

export function PhraseBreakdownExercise({
  vocab,
  onComplete,
}: {
  vocab: VocabItem[];
  onComplete: (cache: Record<number, WordChunk[]>) => void;
}) {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [chunkIdx, setChunkIdx] = useState(0);
  const [cache, setCache] = useState<Record<number, WordChunk[]>>(() => {
    const initial: Record<number, WordChunk[]> = {};
    vocab.forEach((item, i) => {
      if (item.breakdown?.length) initial[i] = item.breakdown;
    });
    return initial;
  });
  const [isLoading, setIsLoading] = useState(false);

  const item = vocab[phraseIdx];
  const chunks = cache[phraseIdx];
  const chunk = chunks?.[chunkIdx];
  const isLastChunk = chunks ? chunkIdx === chunks.length - 1 : false;
  const isLastPhrase = phraseIdx === vocab.length - 1;
  const canGoBack = phraseIdx > 0 || chunkIdx > 0;

  React.useEffect(() => {
    if (!cache[phraseIdx]) {
      setIsLoading(true);
      generateWordBreakdown(
        vocab[phraseIdx].dialect,
        vocab[phraseIdx].romanization ?? "",
        vocab[phraseIdx].english
      )
        .then((result) => {
          setCache((prev) => ({ ...prev, [phraseIdx]: result }));
        })
        .finally(() => setIsLoading(false));
    }
  }, [phraseIdx]);

  const goNext = () => {
    if (!isLastChunk) {
      setChunkIdx((c) => c + 1);
    } else if (!isLastPhrase) {
      setPhraseIdx((p) => p + 1);
      setChunkIdx(0);
    } else {
      onComplete(cache);
    }
  };

  const goBack = () => {
    if (chunkIdx > 0) {
      setChunkIdx((c) => c - 1);
    } else if (phraseIdx > 0) {
      const prevChunks = cache[phraseIdx - 1];
      setPhraseIdx((p) => p - 1);
      setChunkIdx(prevChunks ? prevChunks.length - 1 : 0);
    }
  };

  return (
    <div className="flex flex-col min-h-full gap-4">
      {/* Phrase progress */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-faint font-medium">
          Phrase {phraseIdx + 1} of {vocab.length}
        </span>
        <div className="flex gap-1">
          {vocab.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${i === phraseIdx ? "w-5 bg-brand-blue/100" : i < phraseIdx ? "w-2 bg-brand-blue/20" : "w-2 bg-secondary"}`}
            />
          ))}
        </div>
      </div>

      {/* Full phrase — always visible */}
      <div className="bg-brand-blue/10 border border-brand-blue/15 rounded-2xl p-4">
        <p className="text-xs text-faint mb-1">{item.english}</p>
        <div className="flex items-center gap-2">
          <p className="text-2xl font-bold text-brand-blue">{item.dialect}</p>
          <PlayButtonDark text={item.dialect} size="sm" />
        </div>
        {item.romanization && (
          <p className="text-sm font-mono text-brand-blue/60 mt-0.5">{item.romanization}</p>
        )}
      </div>

      {/* Chunk card */}
      <div className="min-h-[220px] flex flex-col items-center justify-center gap-4">
        {isLoading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={28} className="animate-spin text-brand-blue/60" />
            <p className="text-xs text-faint">Breaking down the phrase…</p>
          </div>
        ) : chunk ? (
          <>
            <AnimatePresence mode="wait">
              <motion.div
                key={`${phraseIdx}-${chunkIdx}`}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.18 }}
                className="w-full bg-card rounded-3xl shadow-sm border border-border-subtle p-7 flex flex-col items-center gap-3"
              >
                <span className="text-xs font-semibold uppercase tracking-widest text-faint">
                  Word {chunkIdx + 1} of {chunks.length}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-5xl font-bold text-foreground">{chunk.characters}</span>
                  <PlayButtonDark text={chunk.characters} />
                </div>
                <span className="text-lg font-mono text-brand-blue">{chunk.pronunciation}</span>
                {chunk.meaning && (
                  <>
                    <div className="w-full h-px bg-muted" />
                    <span className="text-base text-muted-foreground italic text-center">"{chunk.meaning}"</span>
                  </>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Chunk progress dots */}
            <div className="flex gap-1.5">
              {chunks.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${i === chunkIdx ? "w-6 bg-brand-blue/100" : i < chunkIdx ? "w-2 bg-brand-blue/20" : "w-2 bg-secondary"}`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 mt-auto pb-4">
        {canGoBack && (
          <button
            onClick={goBack}
            className="flex-1 py-3 rounded-2xl border border-border text-muted-foreground font-semibold text-sm hover:bg-background active:scale-95 transition-all"
          >
            Back
          </button>
        )}
        <button
          onClick={goNext}
          disabled={isLoading || !chunk}
          className={`flex-1 py-3 rounded-2xl font-bold text-sm shadow transition-all active:scale-95 ${!isLoading && chunk ? "bg-brand-blue/100 text-white hover:bg-brand-blue" : "bg-muted text-faint cursor-not-allowed"}`}
        >
          {isLastChunk && isLastPhrase ? "Finish" : isLastChunk ? "Next Phrase →" : "Next Word →"}
        </button>
      </div>
    </div>
  );
}

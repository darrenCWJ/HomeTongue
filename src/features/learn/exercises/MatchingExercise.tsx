import React, { useEffect, useRef, useState } from "react";
import type { LessonLevel, VocabItem } from "../../../types";
import { PlayButtonDark } from "../shared";

// ─── Matching Exercise ────────────────────────────────────────────────────────

export function MatchingExercise({
  level,
  onComplete,
}: {
  level: LessonLevel;
  onComplete: () => void;
  onBack: () => void;
}) {
  const BATCH = 4;
  const [batchIndex, setBatchIndex] = useState(0);
  const allItems = level.vocabulary;
  const totalBatches = Math.ceil(allItems.length / BATCH);
  const batchItems = allItems.slice(batchIndex * BATCH, batchIndex * BATCH + BATCH);

  const [selectedEn, setSelectedEn] = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [wrong, setWrong] = useState<{ en: number; zh: number } | null>(null);

  // Re-shuffling on every render would move the dialect buttons under the
  // user's finger; the batch is the only thing that should reorder them.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shuffledZh = React.useMemo(() => [...batchItems].sort(() => Math.random() - 0.5), [batchIndex]);

  // At most one deferred transition is ever pending (a wrong-pair reset or a
  // batch advance). Holding its id lets a later tap cancel it: an uncancelled
  // reset used to fire into whatever the user had selected since, wiping it,
  // and an uncancelled advance used to complete the level after unmount.
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPending = () => {
    if (pendingRef.current === null) return;
    clearTimeout(pendingRef.current);
    pendingRef.current = null;
  };
  const defer = (run: () => void, delayMs: number) => {
    cancelPending();
    pendingRef.current = setTimeout(() => {
      pendingRef.current = null;
      run();
    }, delayMs);
  };

  useEffect(() => {
    return () => {
      if (pendingRef.current !== null) clearTimeout(pendingRef.current);
    };
  }, []);

  const handleSelectEn = (i: number) => {
    if (matched.has(i)) return;
    cancelPending();
    setSelectedEn(i);
    setWrong(null);
  };

  const handleSelectZh = (item: VocabItem) => {
    const originalIndex = batchItems.findIndex((b) => b.dialect === item.dialect);
    if (matched.has(originalIndex)) return;

    if (selectedEn !== null) {
      if (selectedEn === originalIndex) {
        // A landed match resolves whatever the pending reset was going to
        // clear, so drop it rather than letting it fire into a later tap.
        cancelPending();
        const next = new Set(matched).add(originalIndex);
        setMatched(next);
        setSelectedEn(null);
        setWrong(null);

        if (next.size === batchItems.length) {
          defer(() => {
            if (batchIndex + 1 >= totalBatches) {
              onComplete();
            } else {
              setBatchIndex((b) => b + 1);
              setMatched(new Set());
              setSelectedEn(null);
            }
          }, 600);
        }
      } else {
        setWrong({ en: selectedEn, zh: originalIndex });
        defer(() => {
          setWrong(null);
          setSelectedEn(null);
        }, 800);
      }
    }
  };

  return (
    <div className="p-6 flex flex-col gap-4">
      <p className="text-sm text-muted-foreground text-center">Tap English, then its dialect match.</p>
      <p className="text-xs text-faint text-center">
        Round {batchIndex + 1} / {totalBatches}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-3">
          {batchItems.map((item, i) => {
            const isMatched = matched.has(i);
            const isSelected = selectedEn === i;
            const isWrong = wrong?.en === i;
            return (
              <button
                key={i}
                onClick={() => handleSelectEn(i)}
                disabled={isMatched}
                className={`p-3 rounded-xl text-sm font-semibold text-left border-2 transition-all
                  ${isMatched ? "bg-green-50 border-green-300 text-green-700 opacity-60" : ""}
                  ${isSelected && !isMatched ? "bg-brand-blue/10 border-brand-blue text-brand-blue" : ""}
                  ${isWrong ? "bg-red-50 border-red-400 text-red-600" : ""}
                  ${!isMatched && !isSelected && !isWrong ? "bg-card border-border text-foreground/90 hover:border-brand-blue/50" : ""}
                `}
              >
                {item.english}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-3">
          {shuffledZh.map((item, i) => {
            const originalIndex = batchItems.findIndex((b) => b.dialect === item.dialect);
            const isMatched = matched.has(originalIndex);
            const isWrong = wrong?.zh === originalIndex;
            return (
              <button
                key={i}
                onClick={() => handleSelectZh(item)}
                disabled={isMatched}
                className={`p-3 rounded-xl text-sm font-bold text-center border-2 transition-all
                  ${isMatched ? "bg-green-50 border-green-300 text-green-700 opacity-60" : ""}
                  ${isWrong ? "bg-red-50 border-red-400 text-red-600" : ""}
                  ${!isMatched && !isWrong ? "bg-card border-border text-foreground/90 hover:border-brand-blue/50" : ""}
                `}
              >
                <div className="flex items-center justify-center gap-1">
                  <span>{item.dialect}</span>
                  <PlayButtonDark text={item.dialect} size="sm" />
                </div>
                <div className="text-xs font-mono text-faint">{item.romanization}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

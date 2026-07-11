import React, { useState } from "react";
import { Check, X } from "lucide-react";
import { motion } from "motion/react";
import type { LessonLevel } from "../../../types";
import { PlayButtonDark } from "../shared";

// ─── Multiple Choice Exercise ─────────────────────────────────────────────────

export function MultipleChoiceExercise({
  level,
  onComplete,
}: {
  level: LessonLevel;
  onComplete: () => void;
  onBack: () => void;
}) {
  const items = level.vocabulary;
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  const current = items[index];

  const options = React.useMemo(() => {
    const others = items.filter((_, i) => i !== index);
    const shuffled = [...others].sort(() => Math.random() - 0.5).slice(0, 3);
    return [...shuffled, current].sort(() => Math.random() - 0.5);
  }, [index]);

  const handleSelect = (cantonese: string) => {
    if (selected !== null) return;
    setSelected(cantonese);
    setIsCorrect(cantonese === current.cantonese);
  };

  const handleNext = () => {
    if (index + 1 >= items.length) {
      onComplete();
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
    setIsCorrect(null);
  };

  return (
    <div className="flex flex-col items-center p-6 gap-6">
      <div className="text-sm text-zinc-400 font-medium">
        {index + 1} / {items.length}
      </div>

      <div className="w-full max-w-sm bg-white rounded-3xl shadow-sm border border-zinc-100 p-8 flex flex-col items-center justify-center min-h-[140px]">
        <span className="text-xs font-semibold uppercase tracking-widest text-brand-blue/60 mb-4">
          How do you say…
        </span>
        <span className="text-3xl font-bold text-zinc-800 text-center">{current.english}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        {options.map((opt) => {
          const isSelected = selected === opt.cantonese;
          const correct = opt.cantonese === current.cantonese;
          let style = "bg-white border-zinc-200 text-zinc-700 hover:border-brand-blue/50";
          if (selected !== null) {
            if (correct) style = "bg-green-50 border-green-400 text-green-700";
            else if (isSelected) style = "bg-red-50 border-red-400 text-red-600";
          }
          return (
            <button
              key={opt.cantonese}
              onClick={() => handleSelect(opt.cantonese)}
              className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-1 transition-all active:scale-95 ${style}`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-bold">{opt.cantonese}</span>
                <PlayButtonDark text={opt.cantonese} size="sm" />
              </div>
              <span className="text-xs font-mono text-zinc-400">{opt.pronunciation}</span>
            </button>
          );
        })}
      </div>

      {selected !== null && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <div
            className={`rounded-2xl p-4 flex items-center gap-3 ${isCorrect ? "bg-green-50" : "bg-red-50"}`}
          >
            {isCorrect ? (
              <Check size={20} className="text-green-500" />
            ) : (
              <X size={20} className="text-red-500" />
            )}
            <div>
              <p className={`font-bold text-sm ${isCorrect ? "text-green-700" : "text-red-700"}`}>
                {isCorrect ? "Correct!" : "Not quite"}
              </p>
              {!isCorrect && (
                <p className="text-xs text-red-500">
                  Answer: {current.cantonese} ({current.pronunciation})
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleNext}
            className="mt-3 w-full py-3 bg-brand-blue/100 text-white font-bold rounded-2xl shadow hover:bg-brand-blue active:scale-95 transition-all"
          >
            {index + 1 >= items.length ? "Finish" : "Next"}
          </button>
        </motion.div>
      )}

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

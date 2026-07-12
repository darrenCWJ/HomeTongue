import React, { useState } from "react";
import { Check, X } from "lucide-react";
import { useProfile } from "../../../app/context/ProfileProvider";
import { motion } from "motion/react";
import type { LessonLevel } from "../../../types";
import { PlayButtonDark, personalise } from "../shared";

// ─── Fill Blank Exercise ──────────────────────────────────────────────────────

export function FillBlankExercise({
  level,
  onComplete,
}: {
  level: LessonLevel;
  /**
   * Called after the last card with the attempt accuracy (0–100). Called with
   * no argument (ungraded) when the level has no fill-in-the-blank items.
   */
  onComplete: (accuracy?: number) => void;
  onBack: () => void;
}) {
  const { userProfile } = useProfile();
  const itemsWithSentences = level.vocabulary.filter((v) => v.exampleSentence);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  // Must run before the empty-state early return — hooks cannot be conditional
  const current = itemsWithSentences[index];
  const options = React.useMemo(() => {
    if (!current) return [];
    const others = level.vocabulary.filter((v) => v.dialect !== current.dialect);
    const shuffled = [...others].sort(() => Math.random() - 0.5).slice(0, 2);
    return [...shuffled, current].sort(() => Math.random() - 0.5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  if (itemsWithSentences.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 gap-4">
        <p className="text-zinc-500">No fill-in-the-blank items available.</p>
        <button
          onClick={() => onComplete()}
          className="bg-brand-blue/100 text-white px-6 py-3 rounded-2xl font-bold"
        >
          Complete Level
        </button>
      </div>
    );
  }

  const sentence = personalise(current.exampleSentence ?? "", userProfile?.name);

  const handleSelect = (dialect: string) => {
    if (selected !== null) return;
    const correct = dialect === current.dialect;
    setSelected(dialect);
    setIsCorrect(correct);
    if (correct) setCorrectCount((c) => c + 1);
  };

  const handleNext = () => {
    if (index + 1 >= itemsWithSentences.length) {
      onComplete(Math.round((correctCount / itemsWithSentences.length) * 100));
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
    setIsCorrect(null);
  };

  return (
    <div className="flex flex-col items-center p-6 gap-6">
      <div className="text-sm text-zinc-400 font-medium">
        {index + 1} / {itemsWithSentences.length}
      </div>

      <div className="w-full max-w-sm bg-white rounded-3xl shadow-sm border border-zinc-100 p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-blue/60 mb-4">
          Fill in the blank
        </p>
        <p className="text-xl font-bold text-zinc-800 text-center leading-relaxed">{sentence}</p>
        <p className="text-xs text-zinc-400 text-center mt-2">{current.english}</p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-sm">
        {options.map((opt) => {
          const isSelected = selected === opt.dialect;
          const correct = opt.dialect === current.dialect;
          let style = "bg-white border-zinc-200 text-zinc-700 hover:border-brand-blue/50";
          if (selected !== null) {
            if (correct) style = "bg-green-50 border-green-400 text-green-700";
            else if (isSelected) style = "bg-red-50 border-red-400 text-red-600";
          }
          return (
            <button
              key={opt.dialect}
              onClick={() => handleSelect(opt.dialect)}
              className={`p-4 rounded-2xl border-2 flex items-center justify-between transition-all active:scale-95 ${style}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold">{opt.dialect}</span>
                <PlayButtonDark text={opt.dialect} size="sm" />
              </div>
              <span className="text-sm font-mono text-zinc-400">{opt.romanization}</span>
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
            <p className={`font-bold text-sm ${isCorrect ? "text-green-700" : "text-red-700"}`}>
              {isCorrect ? "Correct!" : `Answer: ${current.dialect} (${current.romanization})`}
            </p>
          </div>
          <button
            onClick={handleNext}
            className="mt-3 w-full py-3 bg-brand-blue/100 text-white font-bold rounded-2xl shadow hover:bg-brand-blue active:scale-95 transition-all"
          >
            {index + 1 >= itemsWithSentences.length ? "Finish" : "Next"}
          </button>
        </motion.div>
      )}
    </div>
  );
}

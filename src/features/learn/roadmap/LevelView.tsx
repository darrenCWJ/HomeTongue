import { useState } from "react";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { useAppContext } from "../../../app/context/AppContext";
import { motion } from "motion/react";
import { LESSONS } from "../../../data/lessons";
import type { LessonLevel } from "../../../types";
import { FlashcardExercise } from "../exercises/FlashcardExercise";
import { MatchingExercise } from "../exercises/MatchingExercise";
import { MultipleChoiceExercise } from "../exercises/MultipleChoiceExercise";
import { FillBlankExercise } from "../exercises/FillBlankExercise";
import { ConversationExercise } from "../exercises/ConversationExercise";

// ─── LevelView ────────────────────────────────────────────────────────────────

export function LevelView({
  level,
  lessonId,
  onBack,
}: {
  level: LessonLevel;
  lessonId: string;
  onBack: () => void;
}) {
  const { lessonProgress, updateLessonProgress } = useAppContext();
  const [completed, setCompleted] = useState(false);

  const handleComplete = () => {
    const prev = lessonProgress[lessonId];
    const lesson = LESSONS.find((l) => l.id === lessonId);
    updateLessonProgress({
      lessonId,
      completedLevels: Math.max(level.level, prev?.completedLevels ?? 0),
      totalLevels: lesson?.content.levels?.length ?? level.level,
      lastAccessedAt: new Date().toISOString(),
    });
    setCompleted(true);
  };

  if (completed) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="absolute inset-0 bg-white z-30 flex flex-col items-center justify-center p-8 text-center"
      >
        <div className="w-24 h-24 rounded-full bg-brand-blue/15 flex items-center justify-center mb-6">
          <CheckCircle size={48} className="text-brand-blue" />
        </div>
        <h2 className="text-2xl font-extrabold text-zinc-800 mb-2">Level Complete!</h2>
        <p className="text-zinc-500 mb-8">{level.title} — well done!</p>
        <button
          onClick={onBack}
          className="bg-brand-blue/100 text-white font-bold px-8 py-3 rounded-2xl shadow hover:bg-brand-blue active:scale-95 transition-all"
        >
          Back to Roadmap
        </button>
      </motion.div>
    );
  }

  const sharedProps = { level, onComplete: handleComplete, onBack };

  return (
    <motion.div
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      className="absolute inset-0 bg-zinc-50 z-30 flex flex-col"
    >
      <div className="flex items-center gap-3 p-4 bg-white/80 backdrop-blur-md border-b border-zinc-200 sticky top-0 z-30">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="font-bold text-lg text-zinc-800 leading-tight">{level.title}</h2>
          <p className="text-xs text-zinc-400">{level.description}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-none pb-nav">
        {level.exerciseType === "flashcard" && <FlashcardExercise {...sharedProps} />}
        {level.exerciseType === "matching" && <MatchingExercise {...sharedProps} />}
        {level.exerciseType === "multiple-choice" && <MultipleChoiceExercise {...sharedProps} />}
        {level.exerciseType === "fill-blank" && <FillBlankExercise {...sharedProps} />}
        {level.exerciseType === "conversation" && <ConversationExercise {...sharedProps} />}
      </div>
    </motion.div>
  );
}

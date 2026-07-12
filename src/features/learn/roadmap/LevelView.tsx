import { useState } from "react";
import { ArrowLeft, CheckCircle, RotateCcw } from "lucide-react";
import { useLibrary } from "../../../app/context/LibraryProvider";
import { useProfile } from "../../../app/context/ProfileProvider";
import { motion } from "motion/react";
import { getLessonContent, getLessonLevels } from "../../../data/lessons";
import { resolveLanguagePackByLabel } from "../../../languages";
import type { LessonLevel, LessonProgress } from "../../../types";
import { FlashcardExercise } from "../exercises/FlashcardExercise";
import { MatchingExercise } from "../exercises/MatchingExercise";
import { MultipleChoiceExercise } from "../exercises/MultipleChoiceExercise";
import { FillBlankExercise } from "../exercises/FillBlankExercise";
import { ConversationExercise } from "../exercises/ConversationExercise";

// ─── LevelView ────────────────────────────────────────────────────────────────

/** Same pass bar as ExamView: graded exercises need ≥ 60% to complete. */
const PASS_THRESHOLD = 60;

interface AttemptResult {
  /** null when the exercise is ungraded (flashcards, matching, conversation). */
  accuracy: number | null;
  passed: boolean;
}

export function LevelView({
  level,
  lessonId,
  onBack,
}: {
  level: LessonLevel;
  lessonId: string;
  onBack: () => void;
}) {
  const { lessonProgress, updateLessonProgress } = useLibrary();
  const { dialect } = useProfile();
  // Active language's curriculum, derived from the profile dialect (see
  // LearnPage for why this is read per-render instead of via the module-level
  // active pack).
  const { lessons } = getLessonContent(resolveLanguagePackByLabel(dialect).code);
  const [result, setResult] = useState<AttemptResult | null>(null);
  // Bumped on retry so the active exercise remounts with fresh state.
  const [attemptKey, setAttemptKey] = useState(0);

  // Graded exercises (multiple-choice, fill-blank) report accuracy; ungraded
  // ones (flashcards are self-paced with no knew/didn't-know signal, matching
  // and conversation always end correct) call with no argument and are exempt
  // from the gate.
  const handleComplete = (accuracy?: number) => {
    const graded = typeof accuracy === "number";
    const passed = !graded || accuracy >= PASS_THRESHOLD;
    const prev = lessonProgress[lessonId];
    const lesson = lessons.find((l) => l.id === lessonId);
    const previousCompleted = prev?.completedLevels ?? 0;
    const progress: LessonProgress = {
      lessonId,
      // Only a passing attempt can mark this level complete; a failed attempt
      // never regresses previously completed levels either.
      completedLevels: passed ? Math.max(level.level, previousCompleted) : previousCompleted,
      totalLevels: lesson ? getLessonLevels(lesson).length : level.level,
      lastAccessedAt: new Date().toISOString(),
      // Persist the latest graded accuracy (pass OR fail — honest stats),
      // carrying the previous value forward for ungraded exercises.
      ...(graded
        ? { lastAccuracy: accuracy }
        : prev?.lastAccuracy !== undefined
          ? { lastAccuracy: prev.lastAccuracy }
          : {}),
    };
    updateLessonProgress(progress);
    setResult({ accuracy: graded ? accuracy : null, passed });
  };

  const handleRetry = () => {
    setResult(null);
    setAttemptKey((k) => k + 1);
  };

  if (result?.passed) {
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
        {result.accuracy !== null && (
          <p className="text-lg font-bold text-brand-blue mb-1">{result.accuracy}% correct</p>
        )}
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

  if (result && !result.passed) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="absolute inset-0 bg-white z-30 flex flex-col items-center justify-center p-8 text-center"
      >
        <div className="w-24 h-24 rounded-full bg-orange-100 flex items-center justify-center mb-6">
          <RotateCcw size={44} className="text-orange-500" />
        </div>
        <h2 className="text-2xl font-extrabold text-zinc-800 mb-2">Almost there!</h2>
        <p className="text-lg font-bold text-orange-500 mb-1">{result.accuracy}% correct</p>
        <p className="text-zinc-500 mb-8 max-w-xs">
          You need {PASS_THRESHOLD}% to complete {level.title}. Give it another go — repetition is how it
          sticks!
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={handleRetry}
            className="bg-brand-blue/100 text-white font-bold px-8 py-3 rounded-2xl shadow hover:bg-brand-blue active:scale-95 transition-all"
          >
            Try Again
          </button>
          <button
            onClick={onBack}
            className="border border-zinc-200 text-zinc-600 font-semibold px-8 py-3 rounded-2xl hover:bg-zinc-50 active:scale-95 transition-all"
          >
            Back to Roadmap
          </button>
        </div>
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

      <div key={attemptKey} className="flex-1 overflow-y-auto scrollbar-none pb-nav">
        {level.exerciseType === "flashcard" && <FlashcardExercise {...sharedProps} />}
        {level.exerciseType === "matching" && <MatchingExercise {...sharedProps} />}
        {level.exerciseType === "multiple-choice" && <MultipleChoiceExercise {...sharedProps} />}
        {level.exerciseType === "fill-blank" && <FillBlankExercise {...sharedProps} />}
        {level.exerciseType === "conversation" && <ConversationExercise {...sharedProps} />}
      </div>
    </motion.div>
  );
}

import { useState } from "react";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { useLibrary } from "../../../app/context/LibraryProvider";
import { motion } from "motion/react";
import type { WordChunk, ConversationLesson } from "../../../types";
import { PhraseBreakdownExercise } from "./PhraseBreakdownExercise";
import { ConvFlashcardExercise } from "./ConvFlashcardExercise";

// ─── ConversationLessonView ───────────────────────────────────────────────────

type LessonPhase = "listen" | "flashcard" | "done";

export function ConversationLessonView({
  lesson,
  onBack,
  onStartExam,
}: {
  lesson: ConversationLesson;
  onBack: () => void;
  onStartExam: () => void;
}) {
  const { updateConversationLesson } = useLibrary();
  const [phase, setPhase] = useState<LessonPhase>(lesson.currentPhase ?? "listen");

  const savePhase = (next: LessonPhase) => {
    setPhase(next);
    updateConversationLesson({ ...lesson, currentPhase: next });
  };

  const vocab = lesson.vocabulary;

  const handleBreakdownComplete = (cache: Record<number, WordChunk[]>) => {
    const updatedVocab = vocab.map((item, i) => (cache[i] ? { ...item, breakdown: cache[i] } : item));
    updateConversationLesson({ ...lesson, vocabulary: updatedVocab, currentPhase: "flashcard" });
    setPhase("flashcard");
  };

  const statusChip = lesson.examCompleted ? (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Passed</span>
  ) : lesson.examAttempts > 0 ? (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
      In Progress
    </span>
  ) : null;

  if (phase === "flashcard") {
    return (
      <motion.div
        initial={{ x: "100%", opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: "100%", opacity: 0 }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        className="absolute inset-0 bg-zinc-50 z-20 flex flex-col"
      >
        <div className="flex items-center gap-3 p-4 bg-white/80 backdrop-blur-md border-b border-zinc-200 sticky top-0 z-30">
          <button
            onClick={() => savePhase("listen")}
            className="p-2 -ml-2 text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg text-zinc-800 leading-tight">{lesson.title}</h2>
            <p className="text-xs text-zinc-400">Flashcards — flip to reveal</p>
          </div>
          <button
            onClick={() => savePhase("done")}
            className="text-xs font-semibold text-brand-blue hover:text-brand-blue transition-colors whitespace-nowrap"
          >
            Skip →
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-none pb-nav">
          <ConvFlashcardExercise vocab={vocab} onComplete={() => setPhase("done")} />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      className="absolute inset-0 bg-zinc-50 z-20 flex flex-col"
    >
      <div className="flex items-center gap-3 p-4 bg-white/80 backdrop-blur-md border-b border-zinc-200 sticky top-0 z-30">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg text-zinc-800 leading-tight truncate">{lesson.title}</h2>
        </div>
        {phase === "listen" && (
          <button
            onClick={() => savePhase("flashcard")}
            className="text-xs font-semibold text-brand-blue hover:text-brand-blue transition-colors whitespace-nowrap"
          >
            Skip →
          </button>
        )}
        {statusChip}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 space-y-3 scrollbar-none pb-nav">
        {phase === "listen" && <PhraseBreakdownExercise vocab={vocab} onComplete={handleBreakdownComplete} />}

        {phase === "done" && (
          <div className="flex flex-col items-center pt-8 pb-4 gap-4">
            <div className="w-20 h-20 rounded-full bg-brand-blue/15 flex items-center justify-center mb-2">
              <CheckCircle size={40} className="text-brand-blue" />
            </div>
            <h3 className="text-xl font-extrabold text-zinc-800">Ready for the Exam!</h3>
            <p className="text-sm text-zinc-500 text-center max-w-xs">
              You've completed all practice phases. Take the final exam to earn your score.
            </p>
            {lesson.examBestScore !== undefined && (
              <p className="text-sm text-zinc-400">
                Your best score: <span className="font-bold text-brand-blue">{lesson.examBestScore}%</span>
              </p>
            )}
            <button
              onClick={onStartExam}
              className="w-full max-w-xs py-4 bg-brand-blue/100 text-white font-extrabold rounded-2xl shadow-lg hover:bg-brand-blue active:scale-95 transition-all text-lg mt-2"
            >
              Take Final Exam
            </button>
            <button onClick={() => savePhase("listen")} className="text-sm text-zinc-400 hover:text-zinc-600">
              Review phrases again
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

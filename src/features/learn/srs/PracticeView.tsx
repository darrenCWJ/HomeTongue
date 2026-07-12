import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle, RefreshCw, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import type { ReviewGrade } from "../../../types";
import type { ReviewCard, ReviewQueue } from "./useReviewQueue";
import { PlayButton } from "../shared";

// ─── Practice my phrases (spaced repetition) ─────────────────────────────────
//
// Flashcard-style review over bookmarked phrases. The session queue is
// snapshotted from the live due list when the view opens; cards graded
// "Again" are re-queued at the end of the same session.

interface GradeButtonConfig {
  grade: ReviewGrade;
  label: string;
  hint: string;
  className: string;
}

const GRADE_BUTTONS: GradeButtonConfig[] = [
  { grade: "again", label: "Again", hint: "Forgot", className: "bg-red-50 border-red-200 text-red-600" },
  {
    grade: "hard",
    label: "Hard",
    hint: "Struggled",
    className: "bg-orange-50 border-orange-200 text-orange-600",
  },
  {
    grade: "good",
    label: "Good",
    hint: "Got it",
    className: "bg-brand-blue/10 border-brand-blue/30 text-brand-blue",
  },
  {
    grade: "easy",
    label: "Easy",
    hint: "Too easy",
    className: "bg-green-50 border-green-200 text-green-600",
  },
];

export function PracticeView({ review, onBack }: { review: ReviewQueue; onBack: () => void }) {
  const [queue, setQueue] = useState<ReviewCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [gradedCount, setGradedCount] = useState(0);
  const [againCount, setAgainCount] = useState(0);

  // Snapshot the due list exactly once, when loading finishes.
  useEffect(() => {
    if (!review.isLoading && queue === null) {
      setQueue(review.dueCards);
    }
  }, [review.isLoading, review.dueCards, queue]);

  const handleGrade = (grade: ReviewGrade) => {
    if (queue === null || index >= queue.length) return;
    const card = queue[index];
    const nextState = review.gradeCard(card, grade);
    setGradedCount((c) => c + 1);
    if (grade === "again") {
      setAgainCount((c) => c + 1);
      // Re-queue at the end of this session with the updated schedule.
      setQueue([...queue, { phrase: card.phrase, state: nextState, isNew: false }]);
    }
    setFlipped(false);
    setIndex((i) => i + 1);
  };

  const header = (
    <div className="flex items-center gap-3 p-4 bg-card/80 backdrop-blur-md border-b border-border sticky top-0 z-30">
      <button
        onClick={onBack}
        className="p-2 -ml-2 text-muted-foreground hover:bg-muted rounded-full transition-colors"
      >
        <ArrowLeft size={20} />
      </button>
      <div>
        <h2 className="font-bold text-lg text-foreground leading-tight">Practice my phrases</h2>
        <p className="text-xs text-faint">Spaced repetition over your saved phrases</p>
      </div>
    </div>
  );

  const shell = (content: React.ReactNode) => (
    <motion.div
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      className="absolute inset-0 bg-background z-30 flex flex-col"
    >
      {header}
      <div className="flex-1 overflow-y-auto scrollbar-none pb-nav">{content}</div>
    </motion.div>
  );

  if (review.isLoading || queue === null) {
    return shell(
      <div className="flex items-center justify-center h-full">
        <RefreshCw size={22} className="animate-spin text-faint" />
      </div>
    );
  }

  if (review.loadError) {
    return shell(
      <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-3">
        <p className="text-sm font-semibold text-muted-foreground">{review.loadError}</p>
        <button onClick={onBack} className="text-sm font-bold text-brand-blue">
          Go back
        </button>
      </div>
    );
  }

  if (queue.length === 0) {
    return shell(
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-brand-blue/10 flex items-center justify-center mb-5">
          <Sparkles size={36} className="text-brand-blue" />
        </div>
        <h3 className="text-xl font-extrabold text-foreground mb-2">
          {review.totalBookmarked === 0 ? "No saved phrases yet" : "All caught up!"}
        </h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-xs">
          {review.totalBookmarked === 0
            ? "Bookmark phrases from chats or lessons and they will show up here for review."
            : "Nothing is due for review right now. Come back later — spacing out reviews is what makes them stick."}
        </p>
        <button
          onClick={onBack}
          className="bg-brand-blue/100 text-white font-bold px-8 py-3 rounded-2xl shadow hover:bg-brand-blue active:scale-95 transition-all"
        >
          Back to Learn
        </button>
      </div>
    );
  }

  if (index >= queue.length) {
    return shell(
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center mb-6">
          <CheckCircle size={48} className="text-green-500" />
        </div>
        <h3 className="text-2xl font-extrabold text-foreground mb-2">Session complete!</h3>
        <p className="text-sm text-muted-foreground mb-8">
          {gradedCount} review{gradedCount === 1 ? "" : "s"}
          {againCount > 0 ? ` · ${againCount} marked "Again" and repeated` : " — nothing forgotten"}
        </p>
        <button
          onClick={onBack}
          className="bg-brand-blue/100 text-white font-bold px-8 py-3 rounded-2xl shadow hover:bg-brand-blue active:scale-95 transition-all"
        >
          Back to Learn
        </button>
      </div>
    );
  }

  const card = queue[index];

  return shell(
    <div className="flex flex-col items-center p-6 gap-6">
      <div className="text-sm text-faint font-medium">
        {index + 1} / {queue.length}
        {card.isNew && (
          <span className="ml-2 bg-brand-blue/10 text-brand-blue text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5">
            New
          </span>
        )}
      </div>

      <div className="w-full max-w-sm" style={{ perspective: 1000 }}>
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.4 }}
          style={{ transformStyle: "preserve-3d", position: "relative", height: 260 }}
          onClick={() => setFlipped((f) => !f)}
          className="cursor-pointer select-none"
        >
          {/* Front — English */}
          <div
            className="absolute inset-0 bg-card rounded-3xl shadow-md border border-border-subtle flex flex-col items-center justify-center p-6"
            style={{ backfaceVisibility: "hidden" }}
          >
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-blue/60 mb-4">
              English
            </span>
            <span className="text-2xl font-bold text-foreground text-center">{card.phrase.original}</span>
            <span className="text-xs text-faint mt-4">Tap to reveal · then grade yourself</span>
          </div>

          {/* Back — dialect */}
          <div
            className="absolute inset-0 bg-brand-blue/100 rounded-3xl shadow-md flex flex-col items-center justify-center p-6"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <span className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-3">
              {card.phrase.context || "Your phrase"}
            </span>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-3xl font-bold text-white text-center">{card.phrase.dialect}</span>
              <PlayButton text={card.phrase.dialect} audioDataUrl={card.phrase.audioDataUrl} withSlow />
            </div>
            <span className="text-base text-white/70 font-mono">{card.phrase.pronunciation}</span>
          </div>
        </motion.div>
      </div>

      {flipped ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-4 gap-2 w-full max-w-sm"
        >
          {GRADE_BUTTONS.map(({ grade, label, hint, className }) => (
            <button
              key={grade}
              onClick={() => handleGrade(grade)}
              className={`flex flex-col items-center gap-0.5 py-3 rounded-2xl border-2 font-bold text-sm active:scale-95 transition-all ${className}`}
            >
              {label}
              <span className="text-[10px] font-medium opacity-70">{hint}</span>
            </button>
          ))}
        </motion.div>
      ) : (
        <button
          onClick={() => setFlipped(true)}
          className="w-full max-w-sm py-3 rounded-2xl bg-brand-blue/100 text-white font-bold text-sm shadow hover:bg-brand-blue active:scale-95 transition-all"
        >
          Show answer
        </button>
      )}
    </div>
  );
}

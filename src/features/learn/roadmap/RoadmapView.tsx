import { ChevronRight, ArrowLeft, CheckCircle, Star } from "lucide-react";
import { useLibrary } from "../../../app/context/LibraryProvider";
import { useProfile } from "../../../app/context/ProfileProvider";
import { motion } from "motion/react";
import { getLessonLevels } from "../../../data/lessons";
import { useLessonContent } from "../../../hooks/useLessonContent";
import { resolveLanguagePackByLabel } from "../../../languages";
import type { Lesson, LessonLevel } from "../../../types";

// ─── RoadmapView ──────────────────────────────────────────────────────────────

const EXERCISE_TYPE_META: Record<string, { label: string; color: string }> = {
  flashcard: { label: "Flashcards", color: "bg-blue-100 text-blue-600" },
  matching: { label: "Matching", color: "bg-green-100 text-green-600" },
  "multiple-choice": { label: "Quiz", color: "bg-orange-100 text-orange-600" },
  "fill-blank": { label: "Fill in Blank", color: "bg-brand-red/15 text-brand-red" },
  conversation: { label: "Conversation", color: "bg-pink-100 text-pink-600" },
};

interface LessonEntry {
  lesson: Lesson;
  levels: LessonLevel[];
}

function LevelCard({
  level,
  completedCount,
  onSelect,
}: {
  level: LessonLevel;
  completedCount: number;
  onSelect: () => void;
}) {
  const isCompleted = level.level <= completedCount;
  const isCurrent = level.level === completedCount + 1;
  const typeMeta = EXERCISE_TYPE_META[level.exerciseType] ?? {
    label: level.exerciseType,
    color: "bg-zinc-100 text-zinc-500",
  };

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-2xl p-4 flex items-center gap-4 border transition-all active:scale-[0.98] hover:shadow-md
        ${isCompleted ? "bg-white border-brand-blue/15 shadow-sm" : "bg-white border-zinc-100 shadow-sm hover:border-brand-blue/15"}
      `}
    >
      {/* Level badge */}
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0
        ${isCompleted ? "bg-brand-blue/100" : ""}
        ${isCurrent ? "bg-orange-400" : ""}
        ${!isCompleted && !isCurrent ? "bg-zinc-100" : ""}
      `}
      >
        {isCompleted && <CheckCircle size={22} className="text-white" />}
        {isCurrent && <Star size={22} className="text-white fill-white" />}
        {!isCompleted && !isCurrent && <span className="text-sm font-bold text-zinc-400">{level.level}</span>}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className={`font-semibold text-sm ${isCompleted ? "text-zinc-700" : isCurrent ? "text-orange-600" : "text-zinc-700"}`}
          >
            {level.title}
          </span>
          {isCompleted && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-brand-blue/15 text-brand-blue">
              Done
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-400 mb-2 leading-snug">{level.description}</p>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeMeta.color}`}>
          {typeMeta.label}
        </span>
      </div>

      <ChevronRight size={18} className="text-zinc-300 flex-shrink-0" />
    </button>
  );
}

export function RoadmapView({
  onBack,
  title,
  categoryId,
  onSelectLevel,
}: {
  onBack: () => void;
  title: string;
  categoryId: string;
  onSelectLevel: (lessonId: string, level: LessonLevel) => void;
}) {
  const { lessonProgress } = useLibrary();
  const { dialect } = useProfile();
  // Derived from the profile dialect so a language switch re-renders with the
  // right curriculum in the same pass (see LearnPage for the full rationale);
  // reactive to DB-published content via useLessonContent.
  const { lessons } = useLessonContent(resolveLanguagePackByLabel(dialect).code);
  const lessonEntries: LessonEntry[] = lessons
    .filter((l) => l.categoryId === categoryId)
    .map((lesson) => ({ lesson, levels: getLessonLevels(lesson) }))
    .filter((entry) => entry.levels.length > 0);

  const totalLevels = lessonEntries.reduce((sum, entry) => sum + entry.levels.length, 0);
  const completedCount = lessonEntries.reduce((sum, entry) => {
    const prog = lessonProgress[entry.lesson.id];
    return sum + Math.min(prog?.completedLevels ?? 0, entry.levels.length);
  }, 0);
  const progressPct = totalLevels > 0 ? Math.round((completedCount / totalLevels) * 100) : 0;
  const hasMultipleLessons = lessonEntries.length > 1;

  return (
    <motion.div
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      className="absolute inset-0 bg-zinc-50 z-20 flex flex-col"
    >
      {/* Header */}
      <div className="flex-shrink-0 bg-white/80 backdrop-blur-md border-b border-zinc-100 sticky top-0 z-30">
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg text-zinc-800 leading-tight">{title}</h2>
            <p className="text-xs text-zinc-400">
              {completedCount} of {totalLevels} levels complete
            </p>
          </div>
          <span className="text-sm font-bold text-brand-blue">{progressPct}%</span>
        </div>
        <div className="mx-4 mb-3 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-blue/100 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Level cards, grouped by lesson */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-none pb-nav">
        {lessonEntries.map((entry) => {
          const lessonCompleted = lessonProgress[entry.lesson.id]?.completedLevels ?? 0;
          return (
            <div key={entry.lesson.id} className="space-y-3">
              {hasMultipleLessons && (
                <div className="pt-2 first:pt-0">
                  <h3 className="font-bold text-sm text-zinc-700">{entry.lesson.title}</h3>
                  <p className="text-xs text-zinc-400">{entry.lesson.description}</p>
                </div>
              )}
              {entry.levels.map((lvl) => (
                <LevelCard
                  key={`${entry.lesson.id}-${lvl.level}`}
                  level={lvl}
                  completedCount={lessonCompleted}
                  onSelect={() => onSelectLevel(entry.lesson.id, lvl)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

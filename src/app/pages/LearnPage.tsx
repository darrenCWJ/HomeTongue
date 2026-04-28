import React, { useState } from "react";
import {
  Play,
  Award,
  Zap,
  ChevronRight,
  BookOpen,
  ArrowLeft,
  CheckCircle,
  Lock,
  Star,
  Check,
  X,
  MessageCircle,
  Volume2,
  Loader2,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { speakText } from "../../hooks/useElevenLabs";
import { motion, AnimatePresence } from "motion/react";
import { LESSON_CATEGORIES, LESSONS } from "../../data/lessons";
import type { LessonLevel, VocabItem, ConversationTurn } from "../../types";

type View = "main" | "roadmap" | "level";

const personalise = (text: string, name: string | undefined) =>
  text.replace(/\{\{name\}\}/g, name || "you");

interface ActiveLevel {
  categoryId: string;
  level: LessonLevel;
}

function PlayButton({ text, size = "md" }: { text: string; size?: "sm" | "md" }) {
  const { userProfile } = useAppContext();
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) return;
    setIsPlaying(true);
    try {
      await speakText(text, userProfile?.preferredVoiceId);
    } catch {
      // silently ignore playback errors
    } finally {
      setIsPlaying(false);
    }
  };

  const sizeClasses = size === "sm"
    ? "w-7 h-7"
    : "w-9 h-9";

  const iconSize = size === "sm" ? 14 : 16;

  return (
    <button
      onClick={handlePlay}
      disabled={isPlaying}
      className={`${sizeClasses} rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors flex-shrink-0`}
    >
      {isPlaying
        ? <Loader2 size={iconSize} className="animate-spin" />
        : <Volume2 size={iconSize} />
      }
    </button>
  );
}

function PlayButtonDark({ text, size = "md" }: { text: string; size?: "sm" | "md" }) {
  const { userProfile } = useAppContext();
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) return;
    setIsPlaying(true);
    try {
      await speakText(text, userProfile?.preferredVoiceId);
    } catch {
      // silently ignore playback errors
    } finally {
      setIsPlaying(false);
    }
  };

  const sizeClasses = size === "sm" ? "w-7 h-7" : "w-8 h-8";
  const iconSize = size === "sm" ? 13 : 15;

  return (
    <button
      onClick={handlePlay}
      disabled={isPlaying}
      className={`${sizeClasses} rounded-full bg-indigo-100 hover:bg-indigo-200 text-indigo-500 flex items-center justify-center transition-colors flex-shrink-0`}
    >
      {isPlaying
        ? <Loader2 size={iconSize} className="animate-spin text-indigo-400" />
        : <Volume2 size={iconSize} />
      }
    </button>
  );
}

function pickRandomVocab(): VocabItem {
  const allVocab = LESSONS.flatMap((l) => l.content.vocabulary);
  return allVocab[Math.floor(Math.random() * allVocab.length)];
}

export function LearnPage() {
  const { learnedCount, phrases, lessonProgress, userProfile } = useAppContext();
  const bookmarkedPhrases = phrases.filter((p) => p.isBookmarked);

  const [view, setView] = useState<View>("main");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [activeLevel, setActiveLevel] = useState<ActiveLevel | null>(null);
  const [dailyCard, setDailyCard] = useState<VocabItem | null>(null);

  const activeCategoryTitle =
    LESSON_CATEGORIES.find((c) => c.id === activeCategoryId)?.title ?? activeCategoryId ?? "";

  const handleSelectCategory = (categoryId: string) => {
    setActiveCategoryId(categoryId);
    setView("roadmap");
  };

  const handleSelectLevel = (level: LessonLevel) => {
    if (!activeCategoryId) return;
    setActiveLevel({ categoryId: activeCategoryId, level });
    setView("level");
  };

  const handleBackToRoadmap = () => {
    setActiveLevel(null);
    setView("roadmap");
  };

  const handleBackToMain = () => {
    setActiveCategoryId(null);
    setActiveLevel(null);
    setView("main");
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-zinc-50">
      <AnimatePresence initial={false} mode="wait">
        {view === "main" && (
          <motion.div
            key="main"
            initial={{ x: "-100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "-50%", opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className="absolute inset-0 flex flex-col p-4 pb-24 overflow-y-auto"
          >
            <div className="mb-6 mt-2">
              <h1 className="text-2xl font-bold text-zinc-800">Learn</h1>
              <p className="text-sm text-zinc-500">Master your saved phrases</p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-8">
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-zinc-100 flex flex-col items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center mb-2">
                  <Zap size={20} className="text-orange-500" />
                </div>
                <span className="text-2xl font-bold text-zinc-800">3</span>
                <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Day Streak</span>
              </div>
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-zinc-100 flex flex-col items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mb-2">
                  <Award size={20} className="text-blue-500" />
                </div>
                <span className="text-2xl font-bold text-zinc-800">{learnedCount}</span>
                <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Phrases Learned</span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl py-8 px-7 text-white shadow-md mb-8 relative overflow-hidden flex items-center justify-between">
              <div className="absolute top-0 right-0 w-40 h-40 bg-white opacity-10 rounded-full -mr-12 -mt-12 blur-2xl" />
              <div className="flex flex-col flex-1 pr-6 relative z-10">
                <h2 className="text-base font-bold">Daily Review</h2>
                <p className="text-indigo-100 text-xs">
                  Pick a random phrase to learn and practise using it.
                </p>
              </div>
              <button
                onClick={() => setDailyCard(pickRandomVocab())}
                className="bg-white text-indigo-600 rounded-full w-14 h-14 flex items-center justify-center flex-shrink-0 shadow-md hover:scale-105 active:scale-95 transition-transform z-10 relative"
              >
                <Play size={22} className="fill-indigo-600 ml-1" />
              </button>
            </div>

            {dailyCard && (
              <DailyReviewModal card={dailyCard} onClose={() => setDailyCard(null)} />
            )}

            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-zinc-800">Suggested Lessons</h3>
              <button className="text-xs font-medium text-indigo-600 hover:text-indigo-700">See All</button>
            </div>

            <div className="space-y-3">
              {LESSON_CATEGORIES.map((cat) => {
                const lesson = LESSONS.find((l) => l.categoryId === cat.id);
                const prog = lesson ? lessonProgress[lesson.id] : null;
                const totalLevels = lesson?.content.levels?.length ?? 5;
                const progressPct = prog
                  ? Math.round((prog.completedLevels / totalLevels) * 100)
                  : 0;
                return (
                  <LessonCard
                    key={cat.id}
                    title={cat.title}
                    subtitle={cat.description}
                    progress={progressPct}
                    onClick={() => handleSelectCategory(cat.id)}
                  />
                );
              })}
            </div>
          </motion.div>
        )}

        {view === "roadmap" && activeCategoryId && (
          <RoadmapView
            key="roadmap"
            title={activeCategoryTitle}
            categoryId={activeCategoryId}
            onBack={handleBackToMain}
            onSelectLevel={handleSelectLevel}
          />
        )}

        {view === "level" && activeLevel && (
          <LevelView
            key="level"
            level={activeLevel.level}
            onBack={handleBackToRoadmap}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── DailyReviewModal ─────────────────────────────────────────────────────────

function DailyReviewModal({ card, onClose }: { card: VocabItem; onClose: () => void }) {
  const { userProfile } = useAppContext();
  const [flipped, setFlipped] = useState(false);

  return (
    <AnimatePresence>
      <motion.div
        key="daily-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center pb-6 px-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
          className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 pt-6 pb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200 mb-0.5">Daily Review</p>
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
                  <span className="text-xs font-semibold uppercase tracking-widest text-indigo-400 mb-3">English</span>
                  <span className="text-2xl font-bold text-zinc-800 text-center">{card.english}</span>
                  <span className="text-xs text-zinc-400 mt-3">Tap to reveal</span>
                </div>
                {/* Back */}
                <div
                  className="absolute inset-0 bg-indigo-500 rounded-2xl flex flex-col items-center justify-center p-6"
                  style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                >
                  <span className="text-xs font-semibold uppercase tracking-widest text-indigo-200 mb-2">Translation</span>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-3xl font-bold text-white">{card.cantonese}</span>
                    <PlayButton text={card.cantonese} />
                  </div>
                  <span className="text-base text-indigo-200 font-mono">{card.pronunciation}</span>
                </div>
              </motion.div>
            </div>

            {/* How to use it */}
            <div className="bg-indigo-50 rounded-2xl p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400 mb-2">How to use it</p>
              {card.exampleSentence ? (
                <>
                  <p className="text-base font-bold text-zinc-800 mb-1">{personalise(card.exampleSentence, userProfile?.name)}</p>
                  <p className="text-xs text-zinc-500">Use <span className="font-semibold text-indigo-600">{card.cantonese}</span> ({card.pronunciation}) when {card.english.toLowerCase().replace(/[?.!]/g, "")}.</p>
                </>
              ) : (
                <p className="text-sm text-zinc-600">
                  Say <span className="font-bold text-indigo-600">{card.cantonese}</span> ({card.pronunciation}) to mean "<span className="italic">{card.english}</span>" in everyday conversation.
                </p>
              )}
            </div>

            <button
              onClick={() => { setFlipped(false); onClose(); }}
              className="mt-4 w-full py-3 bg-indigo-500 text-white font-bold rounded-2xl shadow hover:bg-indigo-600 active:scale-95 transition-all"
            >
              Got it!
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── LessonCard ───────────────────────────────────────────────────────────────

function LessonCard({
  title,
  subtitle,
  progress,
  onClick,
}: {
  title: string;
  subtitle: string;
  progress: number;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl p-4 shadow-sm border border-zinc-100 flex items-center gap-4 active:scale-[0.98] transition-transform cursor-pointer hover:border-indigo-100 hover:shadow-md"
    >
      <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center flex-shrink-0">
        <BookOpen size={20} className="text-zinc-600" />
      </div>
      <div className="flex-1">
        <h4 className="font-semibold text-sm text-zinc-800">{title}</h4>
        <p className="text-xs text-zinc-500 mb-2">{subtitle}</p>
        <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-indigo-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <ChevronRight size={20} className="text-zinc-300" />
    </div>
  );
}

// ─── RoadmapView ──────────────────────────────────────────────────────────────

function RoadmapView({
  onBack,
  title,
  categoryId,
  onSelectLevel,
}: {
  onBack: () => void;
  title: string;
  categoryId: string;
  onSelectLevel: (level: LessonLevel) => void;
}) {
  const { lessonProgress } = useAppContext();
  const lesson = LESSONS.find((l) => l.categoryId === categoryId);
  const levels = lesson?.content.levels ?? [];
  const prog = lesson ? lessonProgress[lesson.id] : null;
  const completedCount = prog?.completedLevels ?? 0;

  const offsetClasses = ["ml-0", "-ml-16", "ml-16", "-ml-12", "ml-12"];

  return (
    <motion.div
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      className="absolute inset-0 bg-zinc-50 z-20 flex flex-col pb-20"
    >
      <div className="flex items-center gap-3 p-4 bg-white/80 backdrop-blur-md border-b border-zinc-200 sticky top-0 z-30">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="font-bold text-lg text-zinc-800">{title} Roadmap</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
        <div className="text-center mb-8 mt-4">
          <h3 className="text-2xl font-extrabold text-zinc-800 mb-2">{title}</h3>
          <p className="text-sm text-zinc-500">Complete each checkpoint to master this topic.</p>
        </div>

        <div className="relative py-8 w-full max-w-sm flex flex-col items-center">
          <div className="absolute top-10 bottom-10 left-1/2 -ml-2 w-4 bg-zinc-200 rounded-full shadow-inner z-0" />

          {[...levels].reverse().map((lvl, index) => {
            const isCompleted = lvl.level <= completedCount;
            const isCurrent = lvl.level === completedCount + 1;
            const isLocked = !isCompleted && !isCurrent;
            const alignment = offsetClasses[index % offsetClasses.length];

            return (
              <div
                key={lvl.level}
                className={`relative flex flex-col items-center mb-10 last:mb-0 z-10 ${alignment}`}
              >
                <button
                  onClick={() => !isLocked && onSelectLevel(lvl)}
                  disabled={isLocked}
                  className={`w-16 h-16 rounded-full flex items-center justify-center border-4 shadow-sm transition-transform
                    ${!isLocked ? "hover:scale-105 active:scale-95" : "cursor-default"}
                    ${isCompleted ? "bg-indigo-500 border-indigo-200" : ""}
                    ${isCurrent ? "bg-orange-400 border-orange-200 ring-4 ring-orange-100" : ""}
                    ${isLocked ? "bg-zinc-200 border-zinc-50" : ""}
                  `}
                >
                  {isCompleted && <CheckCircle size={28} className="text-white" />}
                  {isCurrent && <Star size={28} className="text-white fill-white" />}
                  {isLocked && <Lock size={24} className="text-zinc-400" />}
                </button>

                <div
                  className={`mt-2 font-bold px-3 py-1 rounded-xl shadow-sm text-sm whitespace-nowrap
                    ${isCurrent ? "bg-white text-orange-500 border border-orange-100" : "bg-white text-zinc-600 border border-zinc-100"}
                  `}
                >
                  {lvl.title}
                </div>
                <div className="text-xs text-zinc-400 mt-1 text-center max-w-[120px]">
                  {lvl.description}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

// ─── LevelView ────────────────────────────────────────────────────────────────

function LevelView({ level, onBack }: { level: LessonLevel; onBack: () => void }) {
  const [completed, setCompleted] = useState(false);

  if (completed) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="absolute inset-0 bg-white z-30 flex flex-col items-center justify-center p-8 text-center"
      >
        <div className="w-24 h-24 rounded-full bg-indigo-100 flex items-center justify-center mb-6">
          <CheckCircle size={48} className="text-indigo-500" />
        </div>
        <h2 className="text-2xl font-extrabold text-zinc-800 mb-2">Level Complete!</h2>
        <p className="text-zinc-500 mb-8">{level.title} — well done!</p>
        <button
          onClick={onBack}
          className="bg-indigo-500 text-white font-bold px-8 py-3 rounded-2xl shadow hover:bg-indigo-600 active:scale-95 transition-all"
        >
          Back to Roadmap
        </button>
      </motion.div>
    );
  }

  const sharedProps = { level, onComplete: () => setCompleted(true), onBack };

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

      <div className="flex-1 overflow-y-auto">
        {level.exerciseType === "flashcard" && <FlashcardExercise {...sharedProps} />}
        {level.exerciseType === "matching" && <MatchingExercise {...sharedProps} />}
        {level.exerciseType === "multiple-choice" && <MultipleChoiceExercise {...sharedProps} />}
        {level.exerciseType === "fill-blank" && <FillBlankExercise {...sharedProps} />}
        {level.exerciseType === "conversation" && <ConversationExercise {...sharedProps} />}
      </div>
    </motion.div>
  );
}

// ─── Flashcard Exercise ───────────────────────────────────────────────────────

function FlashcardExercise({
  level,
  onComplete,
}: {
  level: LessonLevel;
  onComplete: () => void;
  onBack: () => void;
}) {
  const { userProfile } = useAppContext();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const items = level.vocabulary;
  const current = items[index];
  const isLast = index === items.length - 1;

  const handleNext = () => {
    if (isLast) {
      onComplete();
      return;
    }
    setIndex((i) => i + 1);
    setFlipped(false);
  };

  return (
    <div className="flex flex-col items-center p-6 gap-6">
      <div className="text-sm text-zinc-400 font-medium">
        {index + 1} / {items.length}
      </div>

      <div className="w-full max-w-sm">
        <div
          onClick={() => setFlipped((f) => !f)}
          className="cursor-pointer select-none"
          style={{ perspective: 1000 }}
        >
          <motion.div
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ duration: 0.4 }}
            style={{ transformStyle: "preserve-3d", position: "relative", height: 220 }}
          >
            <div
              className="absolute inset-0 bg-white rounded-3xl shadow-md border border-zinc-100 flex flex-col items-center justify-center p-6"
              style={{ backfaceVisibility: "hidden" }}
            >
              <span className="text-xs font-semibold uppercase tracking-widest text-indigo-400 mb-4">English</span>
              <span className="text-3xl font-bold text-zinc-800 text-center">{current.english}</span>
              <span className="text-xs text-zinc-400 mt-4">Tap to reveal</span>
            </div>

            <div
              className="absolute inset-0 bg-indigo-500 rounded-3xl shadow-md flex flex-col items-center justify-center p-6"
              style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
            >
              <span className="text-xs font-semibold uppercase tracking-widest text-indigo-200 mb-2">Cantonese</span>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-4xl font-bold text-white text-center">{current.cantonese}</span>
                <PlayButton text={current.cantonese} />
              </div>
              <span className="text-lg text-indigo-200 font-mono">{current.pronunciation}</span>
              {current.exampleSentence && (
                <span className="text-xs text-indigo-100 mt-4 text-center italic">{personalise(current.exampleSentence, userProfile?.name)}</span>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      <div className="flex gap-3 w-full max-w-sm">
        {index > 0 && (
          <button
            onClick={() => { setIndex((i) => i - 1); setFlipped(false); }}
            className="flex-1 py-3 rounded-2xl border border-zinc-200 text-zinc-600 font-semibold text-sm hover:bg-zinc-50 active:scale-95 transition-all"
          >
            Back
          </button>
        )}
        <button
          onClick={handleNext}
          disabled={!flipped}
          className={`flex-1 py-3 rounded-2xl font-bold text-sm shadow transition-all active:scale-95
            ${flipped ? "bg-indigo-500 text-white hover:bg-indigo-600" : "bg-zinc-100 text-zinc-300 cursor-not-allowed"}
          `}
        >
          {isLast ? "Finish" : "Next"}
        </button>
      </div>

      <div className="flex gap-1.5">
        {items.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-indigo-500" : i < index ? "w-2 bg-indigo-200" : "w-2 bg-zinc-200"}`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Matching Exercise ────────────────────────────────────────────────────────

function MatchingExercise({
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

  const shuffledZh = React.useMemo(
    () => [...batchItems].sort(() => Math.random() - 0.5),
    [batchIndex]
  );

  const handleSelectEn = (i: number) => {
    if (matched.has(i)) return;
    setSelectedEn(i);
    setWrong(null);
  };

  const handleSelectZh = (item: VocabItem) => {
    const originalIndex = batchItems.findIndex((b) => b.cantonese === item.cantonese);
    if (matched.has(originalIndex)) return;

    if (selectedEn !== null) {
      if (selectedEn === originalIndex) {
        const next = new Set(matched).add(originalIndex);
        setMatched(next);
        setSelectedEn(null);

        if (next.size === batchItems.length) {
          setTimeout(() => {
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
        setTimeout(() => {
          setWrong(null);
          setSelectedEn(null);
        }, 800);
      }
    }
  };

  return (
    <div className="p-6 flex flex-col gap-4">
      <p className="text-sm text-zinc-500 text-center">
        Tap English, then its dialect match.
      </p>
      <p className="text-xs text-zinc-400 text-center">
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
                  ${isSelected && !isMatched ? "bg-indigo-50 border-indigo-400 text-indigo-700" : ""}
                  ${isWrong ? "bg-red-50 border-red-400 text-red-600" : ""}
                  ${!isMatched && !isSelected && !isWrong ? "bg-white border-zinc-200 text-zinc-700 hover:border-indigo-300" : ""}
                `}
              >
                {item.english}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-3">
          {shuffledZh.map((item, i) => {
            const originalIndex = batchItems.findIndex((b) => b.cantonese === item.cantonese);
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
                  ${!isMatched && !isWrong ? "bg-white border-zinc-200 text-zinc-700 hover:border-indigo-300" : ""}
                `}
              >
                <div className="flex items-center justify-center gap-1">
                  <span>{item.cantonese}</span>
                  <PlayButtonDark text={item.cantonese} size="sm" />
                </div>
                <div className="text-xs font-mono text-zinc-400">{item.pronunciation}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Multiple Choice Exercise ─────────────────────────────────────────────────

function MultipleChoiceExercise({
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
        <span className="text-xs font-semibold uppercase tracking-widest text-indigo-400 mb-4">How do you say…</span>
        <span className="text-3xl font-bold text-zinc-800 text-center">{current.english}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        {options.map((opt) => {
          const isSelected = selected === opt.cantonese;
          const correct = opt.cantonese === current.cantonese;
          let style = "bg-white border-zinc-200 text-zinc-700 hover:border-indigo-300";
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
          <div className={`rounded-2xl p-4 flex items-center gap-3 ${isCorrect ? "bg-green-50" : "bg-red-50"}`}>
            {isCorrect
              ? <Check size={20} className="text-green-500" />
              : <X size={20} className="text-red-500" />
            }
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
            className="mt-3 w-full py-3 bg-indigo-500 text-white font-bold rounded-2xl shadow hover:bg-indigo-600 active:scale-95 transition-all"
          >
            {index + 1 >= items.length ? "Finish" : "Next"}
          </button>
        </motion.div>
      )}

      <div className="flex gap-1.5">
        {items.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-indigo-500" : i < index ? "w-2 bg-indigo-200" : "w-2 bg-zinc-200"}`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Fill Blank Exercise ──────────────────────────────────────────────────────

function FillBlankExercise({
  level,
  onComplete,
}: {
  level: LessonLevel;
  onComplete: () => void;
  onBack: () => void;
}) {
  const { userProfile } = useAppContext();
  const itemsWithSentences = level.vocabulary.filter((v) => v.exampleSentence);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  if (itemsWithSentences.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 gap-4">
        <p className="text-zinc-500">No fill-in-the-blank items available.</p>
        <button onClick={onComplete} className="bg-indigo-500 text-white px-6 py-3 rounded-2xl font-bold">
          Complete Level
        </button>
      </div>
    );
  }

  const current = itemsWithSentences[index];
  const sentence = personalise(current.exampleSentence ?? "", userProfile?.name);

  const options = React.useMemo(() => {
    const others = level.vocabulary.filter((v) => v.cantonese !== current.cantonese);
    const shuffled = [...others].sort(() => Math.random() - 0.5).slice(0, 2);
    return [...shuffled, current].sort(() => Math.random() - 0.5);
  }, [index]);

  const handleSelect = (cantonese: string) => {
    if (selected !== null) return;
    setSelected(cantonese);
    setIsCorrect(cantonese === current.cantonese);
  };

  const handleNext = () => {
    if (index + 1 >= itemsWithSentences.length) {
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
        {index + 1} / {itemsWithSentences.length}
      </div>

      <div className="w-full max-w-sm bg-white rounded-3xl shadow-sm border border-zinc-100 p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400 mb-4">Fill in the blank</p>
        <p className="text-xl font-bold text-zinc-800 text-center leading-relaxed">{sentence}</p>
        <p className="text-xs text-zinc-400 text-center mt-2">{current.english}</p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-sm">
        {options.map((opt) => {
          const isSelected = selected === opt.cantonese;
          const correct = opt.cantonese === current.cantonese;
          let style = "bg-white border-zinc-200 text-zinc-700 hover:border-indigo-300";
          if (selected !== null) {
            if (correct) style = "bg-green-50 border-green-400 text-green-700";
            else if (isSelected) style = "bg-red-50 border-red-400 text-red-600";
          }
          return (
            <button
              key={opt.cantonese}
              onClick={() => handleSelect(opt.cantonese)}
              className={`p-4 rounded-2xl border-2 flex items-center justify-between transition-all active:scale-95 ${style}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold">{opt.cantonese}</span>
                <PlayButtonDark text={opt.cantonese} size="sm" />
              </div>
              <span className="text-sm font-mono text-zinc-400">{opt.pronunciation}</span>
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
          <div className={`rounded-2xl p-4 flex items-center gap-3 ${isCorrect ? "bg-green-50" : "bg-red-50"}`}>
            {isCorrect
              ? <Check size={20} className="text-green-500" />
              : <X size={20} className="text-red-500" />
            }
            <p className={`font-bold text-sm ${isCorrect ? "text-green-700" : "text-red-700"}`}>
              {isCorrect ? "Correct!" : `Answer: ${current.cantonese} (${current.pronunciation})`}
            </p>
          </div>
          <button
            onClick={handleNext}
            className="mt-3 w-full py-3 bg-indigo-500 text-white font-bold rounded-2xl shadow hover:bg-indigo-600 active:scale-95 transition-all"
          >
            {index + 1 >= itemsWithSentences.length ? "Finish" : "Next"}
          </button>
        </motion.div>
      )}
    </div>
  );
}

// ─── Conversation Exercise ────────────────────────────────────────────────────

function ConversationExercise({
  level,
  onComplete,
}: {
  level: LessonLevel;
  onComplete: () => void;
  onBack: () => void;
}) {
  const turns = level.conversation ?? [];
  const [step, setStep] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const current = turns[step];
  const isUserTurn = current?.speaker === "user";
  const isLast = step === turns.length - 1;

  const handleNext = () => {
    if (isLast) {
      onComplete();
      return;
    }
    setStep((s) => s + 1);
    setShowHint(false);
    setRevealed(false);
  };

  if (!current) return null;

  return (
    <div className="flex flex-col p-6 gap-4">
      <div className="flex items-center gap-2 mb-2">
        <MessageCircle size={16} className="text-indigo-400" />
        <p className="text-sm text-zinc-500">Step through the conversation</p>
        <span className="ml-auto text-xs text-zinc-400">{step + 1} / {turns.length}</span>
      </div>

      <div className="flex flex-col gap-3 max-h-[38vh] overflow-y-auto">
        {turns.slice(0, step).map((turn, i) => (
          <ChatBubble key={i} turn={turn} dimmed />
        ))}
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-indigo-100 p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${isUserTurn ? "bg-orange-400" : "bg-indigo-400"}`}>
            {isUserTurn ? "Y" : "T"}
          </div>
          <span className="text-xs font-semibold text-zinc-500">
            {isUserTurn ? "Your turn" : "They say"}
          </span>
        </div>

        {isUserTurn ? (
          <>
            <p className="text-sm text-zinc-600 mb-3">{current.english}</p>
            {showHint && current.hint && (
              <p className="text-xs text-indigo-500 italic mb-3">Hint: {current.hint}</p>
            )}
            {revealed ? (
              <div className="bg-indigo-50 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-2xl font-bold text-indigo-700">{current.cantonese}</p>
                  <PlayButton text={current.cantonese} size="sm" />
                </div>
                <p className="text-sm font-mono text-indigo-400">{current.pronunciation}</p>
              </div>
            ) : (
              <div className="flex gap-2">
                {!showHint && current.hint && (
                  <button
                    onClick={() => setShowHint(true)}
                    className="flex-1 py-2.5 rounded-xl border border-zinc-200 text-zinc-500 text-sm font-semibold hover:bg-zinc-50 active:scale-95 transition-all"
                  >
                    Hint
                  </button>
                )}
                <button
                  onClick={() => setRevealed(true)}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-bold hover:bg-indigo-600 active:scale-95 transition-all"
                >
                  Reveal
                </button>
              </div>
            )}
          </>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-2xl font-bold text-zinc-800">{current.cantonese}</p>
              <PlayButtonDark text={current.cantonese} />
            </div>
            <p className="text-sm font-mono text-zinc-400 mb-2">{current.pronunciation}</p>
            <p className="text-sm text-zinc-500 italic">{current.english}</p>
          </div>
        )}
      </div>

      <button
        onClick={handleNext}
        disabled={isUserTurn && !revealed}
        className={`w-full py-3 rounded-2xl font-bold text-sm shadow transition-all active:scale-95
          ${!isUserTurn || revealed ? "bg-indigo-500 text-white hover:bg-indigo-600" : "bg-zinc-100 text-zinc-300 cursor-not-allowed"}
        `}
      >
        {isLast ? "Complete Conversation" : "Next"}
      </button>

      <div className="flex gap-1 justify-center flex-wrap">
        {turns.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all
              ${i === step ? "w-6 bg-indigo-500" : i < step ? "w-2 bg-indigo-200" : "w-2 bg-zinc-200"}
            `}
          />
        ))}
      </div>
    </div>
  );
}

function ChatBubble({ turn, dimmed }: { turn: ConversationTurn; dimmed?: boolean }) {
  const isUser = turn.speaker === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} ${dimmed ? "opacity-50" : ""}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? "bg-indigo-500 text-white rounded-br-sm"
            : "bg-white border border-zinc-100 text-zinc-800 rounded-bl-sm"
        }`}
      >
        <p className={`text-sm font-semibold ${isUser ? "text-white" : "text-zinc-800"}`}>{turn.cantonese}</p>
        <p className={`text-xs mt-0.5 ${isUser ? "text-indigo-200" : "text-zinc-400"}`}>{turn.pronunciation}</p>
      </div>
    </div>
  );
}

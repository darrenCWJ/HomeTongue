import React, { useState } from "react";
import {
  Play,
  ChevronRight,
  Bookmark,
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
  Mic,
  MicOff,
  Trophy,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { useAudioRecorder, playDataUrl } from "../../hooks/useElevenLabs";
import { speakText } from "../../hooks/useGoogleTTS";
import { transcribeCantonese, generateWordBreakdown } from "../../services/translationService";
import { extractVocabFromMessages } from "../../utils/vocab";
import type { WordChunk } from "../../types";
import { motion, AnimatePresence } from "motion/react";
import { LESSON_CATEGORIES, LESSONS } from "../../data/lessons";
import { toast } from "sonner";
import type { LessonLevel, VocabItem, ConversationTurn, ConversationLesson } from "../../types";

type View = "main" | "roadmap" | "level" | "conversation-lesson" | "exam";

function scoreChineseAccuracy(expected: string, actual: string): number {
  const CHINESE = /[一-鿿㐀-䶿]/g;
  const expectedChars = expected.match(CHINESE) ?? [];
  if (expectedChars.length === 0) return 0;
  const pool = (actual.match(CHINESE) ?? []).slice();
  let correct = 0;
  for (const ch of expectedChars) {
    const i = pool.indexOf(ch);
    if (i !== -1) { correct++; pool.splice(i, 1); }
  }
  return Math.round((correct / expectedChars.length) * 100);
}

const personalise = (text: string, name: string | undefined) =>
  text.replace(/\{\{name\}\}/g, name || "you");

interface ActiveLevel {
  categoryId: string;
  lessonId: string;
  level: LessonLevel;
}

function PlayButton({ text, size = "md", audioDataUrl }: { text: string; size?: "sm" | "md"; audioDataUrl?: string }) {
  const { userProfile } = useAppContext();
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) return;
    setIsPlaying(true);
    try {
      if (audioDataUrl) {
        await playDataUrl(audioDataUrl);
      } else {
        await speakText(text, userProfile?.preferredVoiceId);
      }
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

function PlayButtonDark({ text, size = "md", audioDataUrl }: { text: string; size?: "sm" | "md"; audioDataUrl?: string }) {
  const { userProfile } = useAppContext();
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) return;
    setIsPlaying(true);
    try {
      if (audioDataUrl) {
        await playDataUrl(audioDataUrl);
      } else {
        await speakText(text, userProfile?.preferredVoiceId);
      }
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
  const { phrases, lessonProgress, conversationLessons, updateConversationLesson, userProfile } = useAppContext();
  const personalLessons = conversationLessons.filter((l) => !l.persona || l.persona === "personal");
  const bookmarkedPhrases = phrases.filter((p) => p.isBookmarked);

  const [view, setView] = useState<View>("main");
  const [mainTab, setMainTab] = useState<"standard" | "custom">("standard");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [activeLevel, setActiveLevel] = useState<ActiveLevel | null>(null);
  const [dailyCard, setDailyCard] = useState<VocabItem | null>(null);
  const [activeConversationLesson, setActiveConversationLesson] = useState<ConversationLesson | null>(null);

  const activeCategoryTitle =
    LESSON_CATEGORIES.find((c) => c.id === activeCategoryId)?.title ?? activeCategoryId ?? "";

  const completedConvLessons = personalLessons.filter((l) => l.examCompleted).length;
  const completedStandardLessons = LESSONS.filter((lesson) => {
    const prog = lessonProgress[lesson.id];
    return prog ? prog.completedLevels >= prog.totalLevels : false;
  }).length;
  const totalLessonsDone = completedConvLessons + completedStandardLessons;

  const scoredLessons = personalLessons.filter((l) => l.examBestScore !== undefined);
  const avgScore = scoredLessons.length > 0
    ? Math.round(scoredLessons.reduce((sum, l) => sum + (l.examBestScore ?? 0), 0) / scoredLessons.length)
    : null;

  const handleSelectCategory = (categoryId: string) => {
    setActiveCategoryId(categoryId);
    setView("roadmap");
  };

  const handleSelectLevel = (level: LessonLevel) => {
    if (!activeCategoryId) return;
    const lesson = LESSONS.find((l) => l.categoryId === activeCategoryId);
    setActiveLevel({ categoryId: activeCategoryId, lessonId: lesson?.id ?? "", level });
    setView("level");
  };

  const handleBackToRoadmap = () => {
    setActiveLevel(null);
    setView("roadmap");
  };

  const handleBackToMain = () => {
    setActiveCategoryId(null);
    setActiveLevel(null);
    setActiveConversationLesson(null);
    setView("main");
  };

  const handleSelectConversationLesson = (lesson: ConversationLesson) => {
    setActiveConversationLesson(lesson);
    setView("conversation-lesson");
  };

  const handleStartExam = () => {
    setView("exam");
  };

  const handleExamComplete = (score: number) => {
    if (!activeConversationLesson) return;
    const passed = score >= 60;
    const updated: ConversationLesson = {
      ...activeConversationLesson,
      examAttempts: activeConversationLesson.examAttempts + 1,
      examBestScore: activeConversationLesson.examBestScore === undefined
        ? score
        : Math.max(activeConversationLesson.examBestScore, score),
      examCompleted: activeConversationLesson.examCompleted || passed,
    };
    updateConversationLesson(updated);
    setActiveConversationLesson(updated);
    setView("conversation-lesson");
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
            className="absolute inset-0 flex flex-col"
          >
            {/* Fixed header zone — never shifts when tabs switch */}
            <div className="flex-shrink-0 px-4 pt-4">
              <div className="mb-6 mt-2">
                <h1 className="text-2xl font-bold text-zinc-800">Learn</h1>
                <p className="text-sm text-zinc-500">Master your saved phrases</p>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-zinc-100 flex flex-col items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mb-2">
                    <Trophy size={20} className="text-green-500" />
                  </div>
                  <span className="text-2xl font-bold text-zinc-800">{totalLessonsDone}</span>
                  <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Lessons Done</span>
                </div>
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-zinc-100 flex flex-col items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center mb-2">
                    <Star size={20} className="text-purple-500" />
                  </div>
                  <span className="text-2xl font-bold text-zinc-800">{avgScore !== null ? `${avgScore}%` : "–"}</span>
                  <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Avg Score</span>
                </div>
              </div>

              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl py-3 px-4 text-white shadow-md mb-4 relative overflow-hidden flex items-center justify-between gap-3">
                <div className="absolute top-0 right-0 w-40 h-40 bg-white opacity-10 rounded-full -mr-12 -mt-12 blur-2xl" />
                <p className="text-sm font-bold relative z-10">Daily Review</p>
                <button
                  onClick={() => setDailyCard(pickRandomVocab())}
                  className="bg-white text-indigo-600 rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0 shadow-md hover:scale-105 active:scale-95 transition-transform z-10 relative"
                >
                  <Play size={16} className="fill-indigo-600 ml-0.5" />
                </button>
              </div>

              {/* Tab switcher */}
              <div className="flex bg-zinc-100 rounded-2xl p-1 mb-4">
                <button
                  onClick={() => setMainTab("standard")}
                  className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all ${
                    mainTab === "standard"
                      ? "bg-white text-zinc-800 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700"
                  }`}
                >
                  Standard Lesson
                </button>
                <button
                  onClick={() => setMainTab("custom")}
                  className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all ${
                    mainTab === "custom"
                      ? "bg-white text-zinc-800 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700"
                  }`}
                >
                  Custom Conversation
                </button>
              </div>
            </div>

            {/* Scrollable tab content only */}
            <div className="flex-1 overflow-y-auto px-4 pb-24">
              {mainTab === "standard" && (
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
              )}

              {mainTab === "custom" && (
                <>
                  {personalLessons.length === 0 ? (
                    <div className="bg-white rounded-2xl p-8 text-center border border-zinc-100 shadow-sm">
                      <BookOpen size={32} className="text-zinc-300 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-zinc-500 mb-1">No custom lessons yet</p>
                      <p className="text-xs text-zinc-400">Go to Saved Conversations and tap the bookmark icon to convert a chat into a lesson.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {personalLessons.map((cl) => (
                        <ConversationLessonCard
                          key={cl.id}
                          lesson={cl}
                          onClick={() => handleSelectConversationLesson(cl)}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {dailyCard && (
              <DailyReviewModal card={dailyCard} onClose={() => setDailyCard(null)} />
            )}
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
            lessonId={activeLevel.lessonId}
            onBack={handleBackToRoadmap}
          />
        )}

        {view === "conversation-lesson" && activeConversationLesson && (
          <ConversationLessonView
            key="conversation-lesson"
            lesson={activeConversationLesson}
            onBack={handleBackToMain}
            onStartExam={handleStartExam}
          />
        )}

        {view === "exam" && activeConversationLesson && (
          <ExamView
            key="exam"
            lesson={activeConversationLesson}
            onBack={() => setView("conversation-lesson")}
            onComplete={handleExamComplete}
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

// ─── ConversationLessonCard ───────────────────────────────────────────────────

function ConversationLessonCard({ lesson, onClick }: { lesson: ConversationLesson; onClick: () => void }) {
  const statusLabel = lesson.examCompleted
    ? "Passed"
    : lesson.examAttempts > 0
    ? "In Progress"
    : "Not started";
  const statusColor = lesson.examCompleted
    ? "bg-green-100 text-green-700"
    : lesson.examAttempts > 0
    ? "bg-orange-100 text-orange-700"
    : "bg-zinc-100 text-zinc-500";

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl p-4 shadow-sm border border-zinc-100 flex items-center gap-4 active:scale-[0.98] transition-transform cursor-pointer hover:border-indigo-100 hover:shadow-md"
    >
      <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
        <MessageCircle size={20} className="text-indigo-500" />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-sm text-zinc-800 truncate">{lesson.title}</h4>
        <p className="text-xs text-zinc-500 mb-1.5">{lesson.vocabulary.length} phrases</p>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor}`}>{statusLabel}</span>
          {lesson.examBestScore !== undefined && (
            <span className="text-xs text-zinc-400">Best: {lesson.examBestScore}%</span>
          )}
        </div>
      </div>
      <ChevronRight size={20} className="text-zinc-300 flex-shrink-0" />
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

function LevelView({ level, lessonId, onBack }: { level: LessonLevel; lessonId: string; onBack: () => void }) {
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
  const { userProfile, phrases, addPhrase, toggleBookmark } = useAppContext();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const items = level.vocabulary;
  const current = items[index];
  const isLast = index === items.length - 1;

  const phraseId = `lesson-${current.cantonese}`;
  const savedPhrase = phrases.find((p) => p.id === phraseId);
  const isBookmarked = savedPhrase?.isBookmarked ?? false;

  const handleBookmark = () => {
    if (!savedPhrase) {
      addPhrase({
        id: phraseId,
        original: current.english,
        dialect: current.cantonese,
        pronunciation: current.pronunciation,
        isBookmarked: true,
        context: level.title,
      });
    } else {
      toggleBookmark(phraseId);
    }
  };

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
              <button
                onClick={(e) => { e.stopPropagation(); handleBookmark(); }}
                className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/20 transition-colors"
              >
                <Bookmark size={16} className={isBookmarked ? "fill-white text-white" : "text-indigo-200"} />
              </button>
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

// ─── ConversationLessonView ───────────────────────────────────────────────────

type LessonPhase = "listen" | "flashcard" | "done";

function ConversationLessonView({
  lesson,
  onBack,
  onStartExam,
}: {
  lesson: ConversationLesson;
  onBack: () => void;
  onStartExam: () => void;
}) {
  const { updateConversationLesson, sessions } = useAppContext();
  const [phase, setPhase] = useState<LessonPhase>(lesson.currentPhase ?? "listen");

  const savePhase = (next: LessonPhase) => {
    setPhase(next);
    updateConversationLesson({ ...lesson, currentPhase: next });
  };

  const vocab = lesson.vocabulary;

  const handleRebuildLesson = () => {
    const session = sessions.find((s) => s.id === lesson.sessionId);
    if (!session) { toast.error("Original conversation not found."); return; }
    const newVocab = extractVocabFromMessages(session.messages);
    if (newVocab.length === 0) { toast.error("No phrases found in conversation."); return; }
    updateConversationLesson({ ...lesson, vocabulary: newVocab, currentPhase: "listen" });
    toast.success(`Rebuilt with ${newVocab.length} phrase${newVocab.length !== 1 ? "s" : ""}.`);
    setPhase("listen");
  };

  const handleBreakdownComplete = (cache: Record<number, WordChunk[]>) => {
    const updatedVocab = vocab.map((item, i) =>
      cache[i] ? { ...item, breakdown: cache[i] } : item
    );
    updateConversationLesson({ ...lesson, vocabulary: updatedVocab, currentPhase: "flashcard" });
    setPhase("flashcard");
  };

  const statusChip = lesson.examCompleted
    ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Passed</span>
    : lesson.examAttempts > 0
    ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">In Progress</span>
    : null;

  if (phase === "flashcard") {
    return (
      <motion.div
        initial={{ x: "100%", opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: "100%", opacity: 0 }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        className="absolute inset-0 bg-zinc-50 z-20 flex flex-col pb-20"
      >
        <div className="flex items-center gap-3 p-4 bg-white/80 backdrop-blur-md border-b border-zinc-200 sticky top-0 z-30">
          <button onClick={() => savePhase("listen")} className="p-2 -ml-2 text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg text-zinc-800 leading-tight">{lesson.title}</h2>
            <p className="text-xs text-zinc-400">Flashcards — flip to reveal</p>
          </div>
          <button
            onClick={() => savePhase("done")}
            className="text-xs font-semibold text-indigo-500 hover:text-indigo-700 transition-colors whitespace-nowrap"
          >
            Skip to Exam →
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
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
      className="absolute inset-0 bg-zinc-50 z-20 flex flex-col pb-20"
    >
      <div className="flex items-center gap-3 p-4 bg-white/80 backdrop-blur-md border-b border-zinc-200 sticky top-0 z-30">
        <button onClick={onBack} className="p-2 -ml-2 text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg text-zinc-800 leading-tight truncate">{lesson.title}</h2>
          <button
            onClick={handleRebuildLesson}
            className="text-xs text-zinc-400 hover:text-indigo-500 transition-colors"
          >
            Rebuild phrases
          </button>
        </div>
        {lesson.examAttempts > 0 && phase === "listen" && (
          <button
            onClick={onStartExam}
            className="text-xs font-semibold text-indigo-500 hover:text-indigo-700 transition-colors whitespace-nowrap"
          >
            Skip to Exam →
          </button>
        )}
        {statusChip}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {phase === "listen" && (
          <PhraseBreakdownExercise
            vocab={vocab}
            onComplete={handleBreakdownComplete}
          />
        )}

        {phase === "done" && (
          <div className="flex flex-col items-center pt-8 pb-4 gap-4">
            <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center mb-2">
              <CheckCircle size={40} className="text-indigo-500" />
            </div>
            <h3 className="text-xl font-extrabold text-zinc-800">Ready for the Exam!</h3>
            <p className="text-sm text-zinc-500 text-center max-w-xs">
              You've completed all practice phases. Take the final exam to earn your score.
            </p>
            {lesson.examBestScore !== undefined && (
              <p className="text-sm text-zinc-400">Your best score: <span className="font-bold text-indigo-600">{lesson.examBestScore}%</span></p>
            )}
            <button
              onClick={onStartExam}
              className="w-full max-w-xs py-4 bg-indigo-500 text-white font-extrabold rounded-2xl shadow-lg hover:bg-indigo-600 active:scale-95 transition-all text-lg mt-2"
            >
              Take Final Exam
            </button>
            <button
              onClick={() => savePhase("listen")}
              className="text-sm text-zinc-400 hover:text-zinc-600"
            >
              Review phrases again
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── PhraseBreakdownExercise ──────────────────────────────────────────────────

function PhraseBreakdownExercise({
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
    vocab.forEach((item, i) => { if (item.breakdown?.length) initial[i] = item.breakdown; });
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
      generateWordBreakdown(vocab[phraseIdx].cantonese, vocab[phraseIdx].pronunciation ?? "", vocab[phraseIdx].english)
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
    <div className="flex flex-col gap-4">
      {/* Phrase progress */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-zinc-400 font-medium">Phrase {phraseIdx + 1} of {vocab.length}</span>
        <div className="flex gap-1">
          {vocab.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${i === phraseIdx ? "w-5 bg-indigo-500" : i < phraseIdx ? "w-2 bg-indigo-200" : "w-2 bg-zinc-200"}`}
            />
          ))}
        </div>
      </div>

      {/* Full phrase — always visible */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
        <p className="text-xs text-zinc-400 mb-1">{item.english}</p>
        <div className="flex items-center gap-2">
          <p className="text-2xl font-bold text-indigo-700">{item.cantonese}</p>
          <PlayButtonDark text={item.cantonese} audioDataUrl={item.audioDataUrl} size="sm" />
        </div>
        {item.pronunciation && (
          <p className="text-sm font-mono text-indigo-400 mt-0.5">{item.pronunciation}</p>
        )}
      </div>

      {/* Chunk card */}
      <div className="min-h-[220px] flex flex-col items-center justify-center gap-4">
        {isLoading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={28} className="animate-spin text-indigo-400" />
            <p className="text-xs text-zinc-400">Breaking down the phrase…</p>
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
                className="w-full bg-white rounded-3xl shadow-sm border border-zinc-100 p-7 flex flex-col items-center gap-3"
              >
                <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                  Word {chunkIdx + 1} of {chunks.length}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-5xl font-bold text-zinc-800">{chunk.characters}</span>
                  <PlayButtonDark text={chunk.characters} />
                </div>
                <span className="text-lg font-mono text-indigo-500">{chunk.pronunciation}</span>
                {chunk.meaning && (
                  <>
                    <div className="w-full h-px bg-zinc-100" />
                    <span className="text-base text-zinc-500 italic text-center">"{chunk.meaning}"</span>
                  </>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Chunk progress dots */}
            <div className="flex gap-1.5">
              {chunks.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${i === chunkIdx ? "w-6 bg-indigo-500" : i < chunkIdx ? "w-2 bg-indigo-200" : "w-2 bg-zinc-200"}`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        {canGoBack && (
          <button
            onClick={goBack}
            className="flex-1 py-3 rounded-2xl border border-zinc-200 text-zinc-600 font-semibold text-sm hover:bg-zinc-50 active:scale-95 transition-all"
          >
            Back
          </button>
        )}
        <button
          onClick={goNext}
          disabled={isLoading || !chunk}
          className={`flex-1 py-3 rounded-2xl font-bold text-sm shadow transition-all active:scale-95 ${!isLoading && chunk ? "bg-indigo-500 text-white hover:bg-indigo-600" : "bg-zinc-100 text-zinc-300 cursor-not-allowed"}`}
        >
          {isLastChunk && isLastPhrase ? "Finish" : isLastChunk ? "Next Phrase →" : "Next Word →"}
        </button>
      </div>
    </div>
  );
}

// ─── ConvFlashcardExercise ────────────────────────────────────────────────────

function ConvFlashcardExercise({ vocab, onComplete }: { vocab: VocabItem[]; onComplete: () => void }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const current = vocab[index];
  const isLast = index === vocab.length - 1;

  if (vocab.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 gap-4">
        <p className="text-zinc-500 text-sm">No phrases available.</p>
        <button onClick={onComplete} className="bg-indigo-500 text-white px-6 py-3 rounded-2xl font-bold">Continue</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center p-6 gap-6">
      <div className="text-sm text-zinc-400 font-medium">{index + 1} / {vocab.length}</div>
      <div className="w-full max-w-sm">
        <div onClick={() => setFlipped((f) => !f)} className="cursor-pointer select-none" style={{ perspective: 1000 }}>
          <motion.div
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ duration: 0.4 }}
            style={{ transformStyle: "preserve-3d", position: "relative", height: 220 }}
          >
            <div className="absolute inset-0 bg-white rounded-3xl shadow-md border border-zinc-100 flex flex-col items-center justify-center p-6" style={{ backfaceVisibility: "hidden" }}>
              <span className="text-xs font-semibold uppercase tracking-widest text-indigo-400 mb-4">English</span>
              <span className="text-2xl font-bold text-zinc-800 text-center">{current.english}</span>
              <span className="text-xs text-zinc-400 mt-4">Tap to reveal</span>
            </div>
            <div className="absolute inset-0 bg-indigo-500 rounded-3xl shadow-md flex flex-col items-center justify-center p-6 gap-3" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold text-white text-center leading-snug">{current.cantonese}</span>
                <PlayButton text={current.cantonese} audioDataUrl={current.audioDataUrl} />
              </div>
              {current.pronunciation && (
                <span className="text-base text-indigo-200 font-mono text-center">{current.pronunciation}</span>
              )}
            </div>
          </motion.div>
        </div>
      </div>
      <div className="flex gap-3 w-full max-w-sm">
        {index > 0 && (
          <button onClick={() => { setIndex((i) => i - 1); setFlipped(false); }} className="flex-1 py-3 rounded-2xl border border-zinc-200 text-zinc-600 font-semibold text-sm hover:bg-zinc-50 active:scale-95 transition-all">Back</button>
        )}
        <button
          onClick={() => { if (isLast) { onComplete(); } else { setIndex((i) => i + 1); setFlipped(false); } }}
          disabled={!flipped}
          className={`flex-1 py-3 rounded-2xl font-bold text-sm shadow transition-all active:scale-95 ${flipped ? "bg-indigo-500 text-white hover:bg-indigo-600" : "bg-zinc-100 text-zinc-300 cursor-not-allowed"}`}
        >
          {isLast ? "Finish" : "Next"}
        </button>
      </div>
      <div className="flex gap-1.5">
        {vocab.map((_, i) => (
          <div key={i} className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-indigo-500" : i < index ? "w-2 bg-indigo-200" : "w-2 bg-zinc-200"}`} />
        ))}
      </div>
    </div>
  );
}

// ─── ExamView ─────────────────────────────────────────────────────────────────

function ExamView({
  lesson,
  onBack,
  onComplete,
}: {
  lesson: ConversationLesson;
  onBack: () => void;
  onComplete: (score: number) => void;
}) {
  const vocab = lesson.vocabulary;
  const [index, setIndex] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [itemScore, setItemScore] = useState<number | null>(null);
  const [transcribed, setTranscribed] = useState<string | null>(null);
  const [finalScore, setFinalScore] = useState<number | null>(null);

  const { startRecording, stopRecording } = useAudioRecorder();
  const current = vocab[index];

  const handleStartRecording = async () => {
    try {
      await startRecording();
      setIsRecording(true);
    } catch {
      toast.error("Microphone access denied.");
    }
  };

  const handleStopRecording = async () => {
    setIsRecording(false);
    setIsProcessing(true);
    try {
      const blob = await stopRecording();
      const result = await transcribeCantonese(blob);
      const score = scoreChineseAccuracy(current.cantonese, result);
      setTranscribed(result);
      setItemScore(score);
    } catch {
      toast.error("Could not process recording. Try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetry = () => { setItemScore(null); setTranscribed(null); };

  const handleNext = () => {
    const updatedScores = [...scores, itemScore ?? 0];
    if (index + 1 >= vocab.length) {
      const avg = Math.round(updatedScores.reduce((a, b) => a + b, 0) / updatedScores.length);
      setFinalScore(avg);
      setScores(updatedScores);
    } else {
      setScores(updatedScores);
      setIndex((i) => i + 1);
      setItemScore(null);
      setTranscribed(null);
    }
  };

  if (finalScore !== null) {
    const passed = finalScore >= 60;
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="absolute inset-0 bg-white z-30 flex flex-col items-center justify-center p-8 text-center"
      >
        <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 ${passed ? "bg-green-100" : "bg-red-100"}`}>
          {passed ? <Trophy size={48} className="text-green-500" /> : <X size={48} className="text-red-500" />}
        </div>
        <h2 className="text-3xl font-extrabold text-zinc-800 mb-2">{finalScore}%</h2>
        <p className={`text-lg font-bold mb-1 ${passed ? "text-green-600" : "text-red-600"}`}>
          {passed ? "Passed!" : "Not quite"}
        </p>
        <p className="text-sm text-zinc-500 mb-8">
          {passed ? "Great job! This lesson is marked complete." : "You need 60% to pass. Keep practising!"}
        </p>
        <button
          onClick={() => onComplete(finalScore)}
          className="w-full max-w-xs py-3.5 bg-indigo-500 text-white font-bold rounded-2xl shadow hover:bg-indigo-600 active:scale-95 transition-all"
        >
          Back to Lesson
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      className="absolute inset-0 bg-zinc-50 z-30 flex flex-col"
    >
      <div className="flex items-center gap-3 p-4 bg-white/80 backdrop-blur-md border-b border-zinc-200 sticky top-0 z-30">
        <button onClick={onBack} className="p-2 -ml-2 text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h2 className="font-bold text-lg text-zinc-800 leading-tight">Final Exam</h2>
          <p className="text-xs text-zinc-400">{index + 1} / {vocab.length}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
        <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2">Recite this phrase</p>
          <p className="text-2xl font-bold text-zinc-800 mb-1">{current.cantonese}</p>
          {current.pronunciation && (
            <p className="text-sm font-mono text-indigo-400 mb-3">{current.pronunciation}</p>
          )}
          <p className="text-sm text-zinc-500 italic">{current.english}</p>
          <div className="mt-4">
            <PlayButtonDark text={current.cantonese} />
          </div>
        </div>

        {itemScore === null ? (
          <div className="flex flex-col items-center gap-4">
            {isProcessing ? (
              <div className="flex items-center gap-2 text-zinc-500">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-sm">Analysing your speech…</span>
              </div>
            ) : isRecording ? (
              <>
                <button
                  onClick={handleStopRecording}
                  className="relative flex items-center justify-center w-24 h-24 rounded-full bg-red-500 text-white shadow-xl shadow-red-200 transition-transform active:scale-95"
                >
                  <span className="absolute w-full h-full rounded-full bg-red-400 animate-ping opacity-75" />
                  <MicOff size={36} className="relative z-10" />
                </button>
                <p className="text-sm text-zinc-500">Recording… tap to stop</p>
              </>
            ) : (
              <>
                <button
                  onClick={handleStartRecording}
                  className="flex items-center justify-center w-24 h-24 rounded-full bg-indigo-600 text-white shadow-xl shadow-indigo-200 transition-transform active:scale-95 hover:scale-105"
                >
                  <Mic size={36} />
                </button>
                <p className="text-sm text-zinc-500">Tap to record your answer</p>
              </>
            )}
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
            <div className={`rounded-2xl p-5 flex flex-col gap-3 ${itemScore >= 60 ? "bg-green-50 border border-green-200" : "bg-orange-50 border border-orange-200"}`}>
              <div className="flex items-center justify-between">
                <span className={`text-4xl font-extrabold ${itemScore >= 60 ? "text-green-600" : "text-orange-500"}`}>{itemScore}%</span>
                <span className={`text-sm font-semibold ${itemScore >= 60 ? "text-green-700" : "text-orange-600"}`}>
                  {itemScore >= 60 ? "Well done!" : "Not quite"}
                </span>
              </div>
              <div className="w-full h-px bg-black/5" />
              <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-semibold text-zinc-400 w-16 pt-0.5 shrink-0">Expected</span>
                  <span className="font-bold text-zinc-700">{current.cantonese}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs font-semibold text-zinc-400 w-16 pt-0.5 shrink-0">You said</span>
                  <span className={`font-bold ${itemScore >= 60 ? "text-green-700" : "text-orange-600"}`}>
                    {transcribed || "—"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleRetry}
                className="flex-1 py-3 rounded-2xl border border-zinc-200 text-zinc-600 font-semibold text-sm hover:bg-zinc-50 active:scale-95 transition-all"
              >
                Try Again
              </button>
              <button
                onClick={handleNext}
                className="flex-1 py-3 bg-indigo-500 text-white font-bold rounded-2xl shadow hover:bg-indigo-600 active:scale-95 transition-all text-sm"
              >
                {index + 1 >= vocab.length ? "See Results" : "Next →"}
              </button>
            </div>
          </motion.div>
        )}

        <div className="flex gap-1.5 justify-center">
          {vocab.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-indigo-500" : i < index ? "w-2 bg-indigo-200" : "w-2 bg-zinc-200"}`} />
          ))}
        </div>
      </div>
    </motion.div>
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

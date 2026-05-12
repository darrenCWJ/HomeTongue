import React, { useState, useRef, useEffect } from "react";
import {
  Play,
  ChevronRight,
  Bookmark,
  BookOpen,
  ArrowLeft,
  CheckCircle,
  Star,
  Check,
  X,
  MessageCircle,
  Volume2,
  Loader2,
  Mic,
  MicOff,
  Trophy,
  Trash2,
  Pencil,
  MoreHorizontal,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { useAudioRecorder, playDataUrl } from "../../hooks/useElevenLabs";
import { speakText, GOOGLE_TTS_VOICES, DEFAULT_VOICE } from "../../hooks/useGoogleTTS";
import type { VoiceKey } from "../../hooks/useGoogleTTS";
import { transcribeCantonese, generateWordBreakdown, scoreCantoneseAccuracy, getExampleMeta } from "../../services/translationService";
import type { WordChunk } from "../../types";
import { motion, AnimatePresence, animate, useMotionValue } from "motion/react";
import { LESSON_CATEGORIES, LESSONS } from "../../data/lessons";
import { LanguageFilter } from "../components/LanguageFilter";
import { toast } from "sonner";
import type { LessonLevel, VocabItem, ConversationTurn, ConversationLesson } from "../../types";

type View = "main" | "roadmap" | "level" | "conversation-lesson" | "exam";


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
        await speakText(text, safeVoiceKey(userProfile?.preferredVoiceId));
      }
    } catch (err) {
      toast.error(`Audio failed: ${err instanceof Error ? err.message : "unknown error"}`);
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
      onPointerDown={(e) => e.stopPropagation()}
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

function PlayButtonDark({ text, size = "md", audioDataUrl, disabled: externalDisabled }: { text: string; size?: "sm" | "md"; audioDataUrl?: string; disabled?: boolean }) {
  const { userProfile } = useAppContext();
  const [isPlaying, setIsPlaying] = useState(false);
  const disabled = isPlaying || !!externalDisabled;

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    setIsPlaying(true);
    try {
      if (audioDataUrl) {
        await playDataUrl(audioDataUrl);
      } else {
        await speakText(text, safeVoiceKey(userProfile?.preferredVoiceId));
      }
    } catch (err) {
      toast.error(`Audio failed: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setIsPlaying(false);
    }
  };

  const sizeClasses = size === "sm" ? "w-7 h-7" : "w-8 h-8";
  const iconSize = size === "sm" ? 13 : 15;

  return (
    <button
      onClick={handlePlay}
      onPointerDown={(e) => e.stopPropagation()}
      disabled={disabled}
      className={`${sizeClasses} rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${disabled && externalDisabled ? "bg-zinc-100 text-zinc-300 cursor-not-allowed" : "bg-brand-blue/15 hover:bg-brand-blue/20 text-brand-blue"}`}
    >
      {isPlaying
        ? <Loader2 size={iconSize} className="animate-spin text-brand-blue/60" />
        : <Volume2 size={iconSize} />
      }
    </button>
  );
}

function safeVoiceKey(id: string | undefined): VoiceKey {
  if (id && id in GOOGLE_TTS_VOICES) return id as VoiceKey;
  return DEFAULT_VOICE;
}

const DAILY_VOCAB_KEY = "hometongue_daily_vocab";

function getDailyVocab(): VocabItem {
  const allVocab = LESSONS.flatMap((l) => l.content.vocabulary);
  const today = new Date().toISOString().slice(0, 10);
  try {
    const stored = localStorage.getItem(DAILY_VOCAB_KEY);
    if (stored) {
      const { date, index } = JSON.parse(stored) as { date: string; index: number };
      if (date === today && index >= 0 && index < allVocab.length) {
        return allVocab[index];
      }
    }
  } catch {
    // ignore parse errors
  }
  const index = Math.floor(Math.random() * allVocab.length);
  try {
    localStorage.setItem(DAILY_VOCAB_KEY, JSON.stringify({ date: today, index }));
  } catch {
    // ignore storage errors
  }
  return allVocab[index];
}

export function LearnPage() {
  const { phrases, lessonProgress, conversationLessons, updateConversationLesson, deleteConversationLesson, userProfile } = useAppContext();
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
            {/* Scrollable page */}
            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-24">
              <div className="flex items-start justify-between mb-6 mt-2">
                <div>
                  <h1 className="text-2xl font-bold text-zinc-800">Learn</h1>
                  <p className="text-sm text-zinc-500">Master your saved phrases</p>
                </div>
                <div data-tour="learn-language-filter"><LanguageFilter /></div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <div data-tour="learn-lessons-done" className="bg-white p-2.5 rounded-xl shadow-sm border border-zinc-100 flex flex-col items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mb-1.5">
                    <Trophy size={16} className="text-green-500" />
                  </div>
                  <span className="text-xl font-bold text-zinc-800">{totalLessonsDone}</span>
                  <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide">Lessons Done</span>
                </div>
                <div data-tour="learn-dialect-fluency" className="bg-white p-2.5 rounded-xl shadow-sm border border-zinc-100 flex flex-col items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-brand-red/15 flex items-center justify-center mb-1.5">
                    <Star size={16} className="text-brand-red" />
                  </div>
                  <span className="text-xl font-bold text-zinc-800">{avgScore !== null ? `${avgScore}%` : "–"}</span>
                  <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide">Dialect Fluency</span>
                </div>
              </div>

              <div data-tour="learn-word-of-day" className="bg-gradient-to-br from-brand-blue to-brand-red rounded-2xl py-3 px-4 text-white shadow-md mb-4 relative overflow-hidden flex items-center justify-between gap-3">
                <div className="absolute top-0 right-0 w-40 h-40 bg-white opacity-10 rounded-full -mr-12 -mt-12 blur-2xl" />
                <p className="text-sm font-bold relative z-10">Word of the Day</p>
                <button
                  onClick={() => setDailyCard(getDailyVocab())}
                  className="bg-white text-brand-blue rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0 shadow-md hover:scale-105 active:scale-95 transition-transform z-10 relative"
                >
                  <Play size={16} className="fill-brand-blue ml-0.5" />
                </button>
              </div>

              {/* Tab switcher */}
              <div data-tour="learn-tab-switcher" className="flex bg-zinc-100 rounded-2xl p-1 mb-4 sticky top-0 z-10">
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
              {mainTab === "standard" && (
                <div data-tour="learn-lesson-cards" className="space-y-3">
                  {LESSON_CATEGORIES.filter((cat) => {
                    const lesson = LESSONS.find((l) => l.categoryId === cat.id);
                    return (lesson?.content.levels?.length ?? 0) > 0;
                  }).map((cat) => {
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
                <div data-tour="learn-conversation-lessons">
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
                          onDelete={() => deleteConversationLesson(cl.id)}
                          onEditTitle={(newTitle) => {
                            updateConversationLesson({ ...cl, title: newTitle });
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
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
        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4"
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
          <div className="bg-gradient-to-r from-brand-blue to-brand-red px-6 pt-6 pb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-0.5">Word of the Day</p>
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
                  <span className="text-xs font-semibold uppercase tracking-widest text-brand-blue/60 mb-3">English</span>
                  <span className="text-2xl font-bold text-zinc-800 text-center">{card.english}</span>
                  <span className="text-xs text-zinc-400 mt-3">Tap to reveal</span>
                </div>
                {/* Back */}
                <div
                  className="absolute inset-0 bg-brand-blue/100 rounded-2xl flex flex-col items-center justify-center p-6"
                  style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                >
                  <span className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-2">Translation</span>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-3xl font-bold text-white">{card.cantonese}</span>
                    <PlayButton text={card.cantonese} />
                  </div>
                  <span className="text-base text-white/70 font-mono">{card.pronunciation}</span>
                </div>
              </motion.div>
            </div>

            {/* How to use it */}
            <div className="bg-brand-blue/10 rounded-2xl p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-blue/60 mb-2">How to use it</p>
              {card.exampleSentence ? (
                <>
                  <p className="text-base font-bold text-zinc-800 mb-1">{personalise(card.exampleSentence, userProfile?.name)}</p>
                  <p className="text-xs text-zinc-500">Use <span className="font-semibold text-brand-blue">{card.cantonese}</span> ({card.pronunciation}) when {card.english.toLowerCase().replace(/[?.!]/g, "")}.</p>
                </>
              ) : (
                <p className="text-sm text-zinc-600">
                  Say <span className="font-bold text-brand-blue">{card.cantonese}</span> ({card.pronunciation}) to mean "<span className="italic">{card.english}</span>" in everyday conversation.
                </p>
              )}
            </div>

            <button
              onClick={() => { setFlipped(false); onClose(); }}
              className="mt-4 w-full py-3 bg-brand-blue/100 text-white font-bold rounded-2xl shadow hover:bg-brand-blue active:scale-95 transition-all"
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
      className="bg-white rounded-2xl p-4 shadow-sm border border-zinc-100 flex items-center gap-4 active:scale-[0.98] transition-transform cursor-pointer hover:border-brand-blue/15 hover:shadow-md"
    >
      <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center flex-shrink-0">
        <BookOpen size={20} className="text-zinc-600" />
      </div>
      <div className="flex-1">
        <h4 className="font-semibold text-sm text-zinc-800">{title}</h4>
        <p className="text-xs text-zinc-500 mb-2">{subtitle}</p>
        <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-brand-blue/100 h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <ChevronRight size={20} className="text-zinc-300" />
    </div>
  );
}

// ─── ConversationLessonCard ───────────────────────────────────────────────────

function ConversationLessonCard({ lesson, onClick, onDelete, onEditTitle }: { lesson: ConversationLesson; onClick: () => void; onDelete: () => void; onEditTitle: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(lesson.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

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

  const commitEdit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== lesson.title) {
      onEditTitle(trimmed);
    } else {
      setDraft(lesson.title);
    }
    setEditing(false);
  };

  return (
    <div
      onClick={editing || menuOpen ? undefined : onClick}
      className="relative bg-white rounded-2xl p-4 shadow-sm border border-zinc-100 flex items-center gap-4 active:scale-[0.98] transition-transform cursor-pointer hover:border-brand-blue/15 hover:shadow-md"
    >
      <div className="absolute top-2 right-2" ref={menuRef}>
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
          aria-label="More options"
        >
          <MoreHorizontal size={16} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-8 z-20 bg-white rounded-xl shadow-lg border border-zinc-100 py-1 min-w-[120px]">
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setEditing(true); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              <Pencil size={14} />
              Edit title
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        )}
      </div>
      <div className="w-12 h-12 rounded-xl bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
        <MessageCircle size={20} className="text-brand-blue" />
      </div>
      <div className="flex-1 min-w-0 pr-6">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") { setDraft(lesson.title); setEditing(false); } }}
              onClick={(e) => e.stopPropagation()}
              maxLength={20}
              className="font-semibold text-sm text-zinc-800 flex-1 min-w-0 border-b border-brand-blue/50 outline-none bg-transparent pb-0.5"
            />
            <button
              onClick={(e) => { e.stopPropagation(); commitEdit(); }}
              className="p-1 rounded-full bg-brand-blue text-white flex-shrink-0"
            >
              <Check size={12} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setDraft(lesson.title); setEditing(false); }}
              className="p-1 rounded-full bg-zinc-100 text-zinc-500 flex-shrink-0"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <h4 className="font-semibold text-sm text-zinc-800 truncate">{lesson.title}</h4>
        )}
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

const EXERCISE_TYPE_META: Record<string, { label: string; color: string }> = {
  flashcard: { label: "Flashcards", color: "bg-blue-100 text-blue-600" },
  matching: { label: "Matching", color: "bg-green-100 text-green-600" },
  "multiple-choice": { label: "Quiz", color: "bg-orange-100 text-orange-600" },
  "fill-blank": { label: "Fill in Blank", color: "bg-brand-red/15 text-brand-red" },
  conversation: { label: "Conversation", color: "bg-pink-100 text-pink-600" },
};

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
  const progressPct = levels.length > 0 ? Math.round((completedCount / levels.length) * 100) : 0;

  return (
    <motion.div
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      className="absolute inset-0 bg-zinc-50 z-20 flex flex-col pb-20"
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
            <p className="text-xs text-zinc-400">{completedCount} of {levels.length} levels complete</p>
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

      {/* Level cards */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {levels.map((lvl) => {
          const isCompleted = lvl.level <= completedCount;
          const isCurrent = lvl.level === completedCount + 1;
          const typeMeta = EXERCISE_TYPE_META[lvl.exerciseType] ?? { label: lvl.exerciseType, color: "bg-zinc-100 text-zinc-500" };

          return (
            <button
              key={lvl.level}
              onClick={() => onSelectLevel(lvl)}
              className={`w-full text-left rounded-2xl p-4 flex items-center gap-4 border transition-all active:scale-[0.98] hover:shadow-md
                ${isCompleted ? "bg-white border-brand-blue/15 shadow-sm" : ""}
                ${isCurrent ? "bg-white border-zinc-100 shadow-sm hover:border-brand-blue/15" : ""}
                ${!isCompleted && !isCurrent ? "bg-white border-zinc-100 shadow-sm hover:border-brand-blue/15" : ""}
              `}
            >
              {/* Level badge */}
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0
                ${isCompleted ? "bg-brand-blue/100" : ""}
                ${isCurrent ? "bg-orange-400" : ""}
                ${!isCompleted && !isCurrent ? "bg-zinc-100" : ""}
              `}>
                {isCompleted && <CheckCircle size={22} className="text-white" />}
                {isCurrent && <Star size={22} className="text-white fill-white" />}
                {!isCompleted && !isCurrent && (
                  <span className="text-sm font-bold text-zinc-400">{lvl.level}</span>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`font-semibold text-sm ${isCompleted ? "text-zinc-700" : isCurrent ? "text-orange-600" : "text-zinc-700"}`}>
                    {lvl.title}
                  </span>
                  {isCompleted && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-brand-blue/15 text-brand-blue">Done</span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mb-2 leading-snug">{lvl.description}</p>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeMeta.color}`}>
                  {typeMeta.label}
                </span>
              </div>

              <ChevronRight size={18} className="text-zinc-300 flex-shrink-0" />
            </button>
          );
        })}
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

type ExampleMeta = { translation: string; pronunciation: string };

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
  const [swipeDir, setSwipeDir] = useState<"right" | "left" | null>(null);
  const [exampleCache, setExampleCache] = useState<Record<number, ExampleMeta | "loading">>({});
  const dragOccurred = React.useRef(false);
  const x = useMotionValue(0);
  const items = level.vocabulary;
  const current = items[index];
  const isLast = index === items.length - 1;
  const currentMeta = exampleCache[index];

  React.useEffect(() => {
    if (!flipped || !current.exampleSentence || exampleCache[index]) return;
    setExampleCache((prev) => ({ ...prev, [index]: "loading" }));
    const sentence = personalise(current.exampleSentence!, userProfile?.name);
    getExampleMeta(sentence).then((meta) => {
      setExampleCache((prev) => ({ ...prev, [index]: meta }));
    });
  }, [flipped, index]);

  const phraseId = `lesson-${current.cantonese}`;
  const savedPhrase = phrases.find((p) => p.id === phraseId);
  const isBookmarked = savedPhrase?.isBookmarked ?? false;

  const handleBookmark = (e: React.MouseEvent) => {
    e.stopPropagation();
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

  const goToCard = async (nextIndex: number, dir: "left" | "right") => {
    setSwipeDir(null);
    const exitX = dir === "left" ? -420 : 420;
    const enterX = dir === "left" ? 420 : -420;
    await animate(x, exitX, { duration: 0.18, ease: [0.32, 0.72, 0, 1] });
    if (nextIndex >= items.length) { onComplete(); return; }
    x.set(enterX);
    setIndex(nextIndex);
    setFlipped(false);
    animate(x, 0, { duration: 0.22, ease: [0.32, 0.72, 0, 1] });
  };

  const handleDragEnd = (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    if (info.offset.x < -80 || info.velocity.x < -500) {
      dragOccurred.current = true;
      goToCard(index + 1, "left");
    } else if ((info.offset.x > 80 || info.velocity.x > 500) && index > 0) {
      dragOccurred.current = true;
      goToCard(index - 1, "right");
    } else {
      animate(x, 0, { type: "spring", stiffness: 400, damping: 40 });
    }
    setTimeout(() => { dragOccurred.current = false; }, 0);
  };

  const cardHeight = current.exampleSentence ? 320 : 220;

  return (
    <div className="flex flex-col items-center p-6 gap-6">
      <div className="text-sm text-zinc-400 font-medium">{index + 1} / {items.length}</div>

      <div className="w-full max-w-sm relative select-none">
        {/* Swipe indicators */}
        <div className={`absolute inset-y-0 left-0 flex items-center pl-2 z-10 pointer-events-none transition-opacity duration-100 ${swipeDir === "right" && index > 0 ? "opacity-100" : "opacity-0"}`}>
          <div className="bg-zinc-100 text-zinc-500 rounded-xl px-2.5 py-1 text-xs font-bold">← Back</div>
        </div>
        <div className={`absolute inset-y-0 right-0 flex items-center pr-2 z-10 pointer-events-none transition-opacity duration-100 ${swipeDir === "left" ? "opacity-100" : "opacity-0"}`}>
          <div className="bg-brand-blue/15 text-brand-blue rounded-xl px-2.5 py-1 text-xs font-bold">{isLast ? "Finish" : "Next"} →</div>
        </div>

        <div style={{ perspective: 1000 }}>
          <motion.div
            style={{ x }}
            drag="x"
            dragConstraints={false}
            whileDrag={{ scale: 1.02 }}
            onDragStart={() => { dragOccurred.current = false; }}
            onDrag={(_, info) => {
              if (Math.abs(info.offset.x) > 8) dragOccurred.current = true;
              if (info.offset.x > 40) setSwipeDir("right");
              else if (info.offset.x < -40) setSwipeDir("left");
              else setSwipeDir(null);
            }}
            onDragEnd={handleDragEnd}
            onClick={() => { if (!dragOccurred.current) setFlipped((f) => !f); }}
            className="cursor-grab active:cursor-grabbing"
          >
            <motion.div
              animate={{ rotateY: flipped ? 180 : 0 }}
              transition={{ duration: 0.4 }}
              style={{ transformStyle: "preserve-3d", position: "relative", height: cardHeight }}
            >
              {/* ── Front face ── */}
              <div
                className="absolute inset-0 bg-white rounded-3xl shadow-md border border-zinc-100 flex flex-col items-center justify-center p-6"
                style={{ backfaceVisibility: "hidden" }}
              >
                <span className="text-xs font-semibold uppercase tracking-widest text-brand-blue/60 mb-4">English</span>
                <span className="text-3xl font-bold text-zinc-800 text-center">{current.english}</span>
                <span className="text-xs text-zinc-400 mt-4">Tap for translation · Swipe to navigate</span>
              </div>

              {/* ── Back face ── */}
              <div
                className="absolute inset-0 bg-brand-blue/100 rounded-3xl shadow-md flex flex-col p-5 overflow-hidden"
                style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
              >
                {/* Bookmark */}
                <button
                  onClick={handleBookmark}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/20 transition-colors z-10"
                >
                  <Bookmark size={16} className={isBookmarked ? "fill-white text-white" : "text-white/40"} />
                </button>

                {/* Main word section */}
                <div className="flex flex-col items-center pt-1 pb-3">
                  <span className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-2">Cantonese</span>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-4xl font-bold text-white text-center">{current.cantonese}</span>
                    <PlayButton text={current.cantonese} />
                  </div>
                  <span className="text-base text-white/70 font-mono">{current.pronunciation}</span>
                </div>

                {/* Example sentence section */}
                {current.exampleSentence && (
                  <div className="bg-brand-blue/50 rounded-2xl p-3.5 flex flex-col gap-2 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white/60 uppercase tracking-widest">How to use</span>
                      <PlayButton text={personalise(current.exampleSentence, userProfile?.name)} size="sm" />
                    </div>
                    <p className="text-sm font-semibold text-white leading-snug">
                      {personalise(current.exampleSentence, userProfile?.name)}
                    </p>
                    {currentMeta === "loading" ? (
                      <div className="flex items-center gap-1.5">
                        <Loader2 size={11} className="animate-spin text-white/40" />
                        <span className="text-xs text-white/40">Loading…</span>
                      </div>
                    ) : currentMeta ? (
                      <>
                        {currentMeta.pronunciation && (
                          <p className="text-xs font-mono text-white/70 leading-snug">{currentMeta.pronunciation}</p>
                        )}
                        {currentMeta.translation && (
                          <p className="text-xs text-brand-white italic">"{currentMeta.translation}"</p>
                        )}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      <div className="flex gap-3 w-full max-w-sm">
        {index > 0 && (
          <button
            onClick={() => goToCard(index - 1, "right")}
            className="flex-1 py-3 rounded-2xl border border-zinc-200 text-zinc-600 font-semibold text-sm hover:bg-zinc-50 active:scale-95 transition-all"
          >
            Back
          </button>
        )}
        <button
          onClick={() => goToCard(index + 1, "left")}
          className="flex-1 py-3 rounded-2xl font-bold text-sm shadow transition-all active:scale-95 bg-brand-blue/100 text-white hover:bg-brand-blue"
        >
          {isLast ? "Finish" : "Next"}
        </button>
      </div>

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
                  ${isSelected && !isMatched ? "bg-brand-blue/10 border-brand-blue text-brand-blue" : ""}
                  ${isWrong ? "bg-red-50 border-red-400 text-red-600" : ""}
                  ${!isMatched && !isSelected && !isWrong ? "bg-white border-zinc-200 text-zinc-700 hover:border-brand-blue/50" : ""}
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
                  ${!isMatched && !isWrong ? "bg-white border-zinc-200 text-zinc-700 hover:border-brand-blue/50" : ""}
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
        <span className="text-xs font-semibold uppercase tracking-widest text-brand-blue/60 mb-4">How do you say…</span>
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
        <button onClick={onComplete} className="bg-brand-blue/100 text-white px-6 py-3 rounded-2xl font-bold">
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
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-blue/60 mb-4">Fill in the blank</p>
        <p className="text-xl font-bold text-zinc-800 text-center leading-relaxed">{sentence}</p>
        <p className="text-xs text-zinc-400 text-center mt-2">{current.english}</p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-sm">
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
            className="mt-3 w-full py-3 bg-brand-blue/100 text-white font-bold rounded-2xl shadow hover:bg-brand-blue active:scale-95 transition-all"
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
        <MessageCircle size={16} className="text-brand-blue/60" />
        <p className="text-sm text-zinc-500">Step through the conversation</p>
        <span className="ml-auto text-xs text-zinc-400">{step + 1} / {turns.length}</span>
      </div>

      <div className="flex flex-col gap-3 max-h-[38vh] overflow-y-auto">
        {turns.slice(0, step).map((turn, i) => (
          <ChatBubble key={i} turn={turn} dimmed />
        ))}
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-brand-blue/15 p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${isUserTurn ? "bg-orange-400" : "bg-brand-blue/60"}`}>
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
              <p className="text-xs text-brand-blue italic mb-3">Hint: {current.hint}</p>
            )}
            {revealed ? (
              <div className="bg-brand-blue/10 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-2xl font-bold text-brand-blue">{current.cantonese}</p>
                  <PlayButton text={current.cantonese} size="sm" />
                </div>
                <p className="text-sm font-mono text-brand-blue/60">{current.pronunciation}</p>
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
                  className="flex-1 py-2.5 rounded-xl bg-brand-blue/100 text-white text-sm font-bold hover:bg-brand-blue active:scale-95 transition-all"
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
          ${!isUserTurn || revealed ? "bg-brand-blue/100 text-white hover:bg-brand-blue" : "bg-zinc-100 text-zinc-300 cursor-not-allowed"}
        `}
      >
        {isLast ? "Complete Conversation" : "Next"}
      </button>

      <div className="flex gap-1 justify-center flex-wrap">
        {turns.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all
              ${i === step ? "w-6 bg-brand-blue/100" : i < step ? "w-2 bg-brand-blue/20" : "w-2 bg-zinc-200"}
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
  const { updateConversationLesson } = useAppContext();
  const [phase, setPhase] = useState<LessonPhase>(lesson.currentPhase ?? "listen");

  const savePhase = (next: LessonPhase) => {
    setPhase(next);
    updateConversationLesson({ ...lesson, currentPhase: next });
  };

  const vocab = lesson.vocabulary;

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
            className="text-xs font-semibold text-brand-blue hover:text-brand-blue transition-colors whitespace-nowrap"
          >
            Skip →
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

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {phase === "listen" && (
          <PhraseBreakdownExercise
            vocab={vocab}
            onComplete={handleBreakdownComplete}
          />
        )}

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
              <p className="text-sm text-zinc-400">Your best score: <span className="font-bold text-brand-blue">{lesson.examBestScore}%</span></p>
            )}
            <button
              onClick={onStartExam}
              className="w-full max-w-xs py-4 bg-brand-blue/100 text-white font-extrabold rounded-2xl shadow-lg hover:bg-brand-blue active:scale-95 transition-all text-lg mt-2"
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
              className={`h-1 rounded-full transition-all ${i === phraseIdx ? "w-5 bg-brand-blue/100" : i < phraseIdx ? "w-2 bg-brand-blue/20" : "w-2 bg-zinc-200"}`}
            />
          ))}
        </div>
      </div>

      {/* Full phrase — always visible */}
      <div className="bg-brand-blue/10 border border-brand-blue/15 rounded-2xl p-4">
        <p className="text-xs text-zinc-400 mb-1">{item.english}</p>
        <div className="flex items-center gap-2">
          <p className="text-2xl font-bold text-brand-blue">{item.cantonese}</p>
          <PlayButtonDark text={item.cantonese} size="sm" />
        </div>
        {item.pronunciation && (
          <p className="text-sm font-mono text-brand-blue/60 mt-0.5">{item.pronunciation}</p>
        )}
      </div>

      {/* Chunk card */}
      <div className="min-h-[220px] flex flex-col items-center justify-center gap-4">
        {isLoading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={28} className="animate-spin text-brand-blue/60" />
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
                <span className="text-lg font-mono text-brand-blue">{chunk.pronunciation}</span>
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
                  className={`h-1.5 rounded-full transition-all ${i === chunkIdx ? "w-6 bg-brand-blue/100" : i < chunkIdx ? "w-2 bg-brand-blue/20" : "w-2 bg-zinc-200"}`}
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
          className={`flex-1 py-3 rounded-2xl font-bold text-sm shadow transition-all active:scale-95 ${!isLoading && chunk ? "bg-brand-blue/100 text-white hover:bg-brand-blue" : "bg-zinc-100 text-zinc-300 cursor-not-allowed"}`}
        >
          {isLastChunk && isLastPhrase ? "Finish" : isLastChunk ? "Next Phrase →" : "Next Word →"}
        </button>
      </div>
    </div>
  );
}

// ─── ConvFlashcardExercise ────────────────────────────────────────────────────

function ConvFlashcardExercise({ vocab, onComplete }: { vocab: VocabItem[]; onComplete: () => void }) {
  const { phrases, addPhrase, toggleBookmark } = useAppContext();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [swipeDir, setSwipeDir] = useState<"right" | "left" | null>(null);
  const dragOccurred = React.useRef(false);
  const x = useMotionValue(0);
  const current = vocab[index];
  const isLast = index === vocab.length - 1;

  if (vocab.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 gap-4">
        <p className="text-zinc-500 text-sm">No phrases available.</p>
        <button onClick={onComplete} className="bg-brand-blue/100 text-white px-6 py-3 rounded-2xl font-bold">Continue</button>
      </div>
    );
  }

  const phraseId = `lesson-${current.cantonese}`;
  const savedPhrase = phrases.find((p) => p.id === phraseId);
  const isBookmarked = savedPhrase?.isBookmarked ?? false;

  const handleBookmark = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!savedPhrase) {
      addPhrase({
        id: phraseId,
        original: current.english,
        dialect: current.cantonese,
        pronunciation: current.pronunciation,
        isBookmarked: true,
        context: "Conversation Lesson",
      });
    } else {
      toggleBookmark(phraseId);
    }
  };

  const goToCard = async (nextIndex: number, dir: "left" | "right") => {
    setSwipeDir(null);
    const exitX = dir === "left" ? -420 : 420;
    const enterX = dir === "left" ? 420 : -420;
    await animate(x, exitX, { duration: 0.18, ease: [0.32, 0.72, 0, 1] });
    if (nextIndex >= vocab.length) { onComplete(); return; }
    x.set(enterX);
    setIndex(nextIndex);
    setFlipped(false);
    animate(x, 0, { duration: 0.22, ease: [0.32, 0.72, 0, 1] });
  };

  const handleDragEnd = (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    if (info.offset.x < -80 || info.velocity.x < -500) {
      dragOccurred.current = true;
      goToCard(index + 1, "left");
    } else if ((info.offset.x > 80 || info.velocity.x > 500) && index > 0) {
      dragOccurred.current = true;
      goToCard(index - 1, "right");
    } else {
      animate(x, 0, { type: "spring", stiffness: 400, damping: 40 });
    }
    setTimeout(() => { dragOccurred.current = false; }, 0);
  };

  return (
    <div className="flex flex-col items-center p-6 gap-6">
      <div className="text-sm text-zinc-400 font-medium">{index + 1} / {vocab.length}</div>

      <div className="w-full max-w-sm relative select-none">
        {/* Swipe indicators */}
        <div className={`absolute inset-y-0 left-0 flex items-center pl-2 z-10 pointer-events-none transition-opacity duration-100 ${swipeDir === "right" && index > 0 ? "opacity-100" : "opacity-0"}`}>
          <div className="bg-zinc-100 text-zinc-500 rounded-xl px-2.5 py-1 text-xs font-bold">← Back</div>
        </div>
        <div className={`absolute inset-y-0 right-0 flex items-center pr-2 z-10 pointer-events-none transition-opacity duration-100 ${swipeDir === "left" ? "opacity-100" : "opacity-0"}`}>
          <div className="bg-brand-blue/15 text-brand-blue rounded-xl px-2.5 py-1 text-xs font-bold">{isLast ? "Finish" : "Next"} →</div>
        </div>

        <div style={{ perspective: 1000 }}>
          <motion.div
            style={{ x }}
            drag="x"
            dragConstraints={false}
            whileDrag={{ scale: 1.02 }}
            onDragStart={() => { dragOccurred.current = false; }}
            onDrag={(_, info) => {
              if (Math.abs(info.offset.x) > 8) dragOccurred.current = true;
              if (info.offset.x > 40) setSwipeDir("right");
              else if (info.offset.x < -40) setSwipeDir("left");
              else setSwipeDir(null);
            }}
            onDragEnd={handleDragEnd}
            onClick={() => { if (!dragOccurred.current) setFlipped((f) => !f); }}
            className="cursor-grab active:cursor-grabbing"
          >
            <motion.div
              animate={{ rotateY: flipped ? 180 : 0 }}
              transition={{ duration: 0.4 }}
              style={{ transformStyle: "preserve-3d", position: "relative", height: 220 }}
            >
              {/* Front face */}
              <div
                className="absolute inset-0 bg-white rounded-3xl shadow-md border border-zinc-100 flex flex-col items-center justify-center p-6"
                style={{ backfaceVisibility: "hidden" }}
              >
                <span className="text-xs font-semibold uppercase tracking-widest text-brand-blue/60 mb-4">English</span>
                <span className="text-3xl font-bold text-zinc-800 text-center">{current.english}</span>
                <span className="text-xs text-zinc-400 mt-4">Tap for translation · Swipe to navigate</span>
              </div>

              {/* Back face */}
              <div
                className="absolute inset-0 bg-brand-blue/100 rounded-3xl shadow-md flex flex-col p-5 overflow-hidden"
                style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
              >
                <button
                  onClick={handleBookmark}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/20 transition-colors z-10"
                >
                  <Bookmark size={16} className={isBookmarked ? "fill-white text-white" : "text-brand-blue/60"} />
                </button>

                <div className="flex flex-col items-center justify-center flex-1">
                  <span className="text-xs font-semibold uppercase tracking-widest text-brand-blue/60 mb-2">Cantonese</span>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-4xl font-bold text-white text-center">{current.cantonese}</span>
                    <PlayButton text={current.cantonese} />
                  </div>
                  {current.pronunciation && (
                    <span className="text-base text-brand-blue/60 font-mono">{current.pronunciation}</span>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      <div className="flex gap-3 w-full max-w-sm">
        {index > 0 && (
          <button
            onClick={() => goToCard(index - 1, "right")}
            className="flex-1 py-3 rounded-2xl border border-zinc-200 text-zinc-600 font-semibold text-sm hover:bg-zinc-50 active:scale-95 transition-all"
          >
            Back
          </button>
        )}
        <button
          onClick={() => goToCard(index + 1, "left")}
          className="flex-1 py-3 rounded-2xl font-bold text-sm shadow transition-all active:scale-95 bg-brand-blue/100 text-white hover:bg-brand-blue"
        >
          {isLast ? "Finish" : "Next"}
        </button>
      </div>

      <div className="flex gap-1.5">
        {vocab.map((_, i) => (
          <div key={i} className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-brand-blue/100" : i < index ? "w-2 bg-brand-blue/20" : "w-2 bg-zinc-200"}`} />
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
  const recordingStartRef = useRef<number | null>(null);
  const recordingTriggerRef = useRef<"tap" | "hold" | null>(null);
  const HOLD_THRESHOLD_MS = 300;

  const startListening = async () => {
    try {
      await startRecording();
      recordingStartRef.current = Date.now();
      setIsRecording(true);
    } catch {
      toast.error("Microphone access denied.");
    }
  };

  const stopListening = async () => {
    recordingTriggerRef.current = null;
    setIsRecording(false);

    const elapsed = recordingStartRef.current ? Date.now() - recordingStartRef.current : 0;
    recordingStartRef.current = null;

    if (elapsed < 1000) {
      stopRecording().catch(() => {});
      toast.error("Recording too short — please record for at least 1 second.");
      return;
    }

    setIsProcessing(true);
    try {
      const blob = await stopRecording();
      const result = await transcribeCantonese(blob);
      const score = await scoreCantoneseAccuracy(current.cantonese, result);
      setTranscribed(result);
      setItemScore(score);
    } catch {
      toast.error("Could not process recording. Try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMicPointerDown = async () => {
    if (isRecording && recordingTriggerRef.current === "tap") {
      stopListening();
      return;
    }
    await startListening();
  };

  const handleMicPointerUp = () => {
    if (!isRecording) return;
    const elapsed = recordingStartRef.current ? Date.now() - recordingStartRef.current : 999;
    if (elapsed < HOLD_THRESHOLD_MS) {
      recordingTriggerRef.current = "tap";
    } else {
      recordingTriggerRef.current = null;
      stopListening();
    }
  };

  const handleMicPointerLeave = () => {
    if (!isRecording || recordingTriggerRef.current === "tap") return;
    stopListening();
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
          className="w-full max-w-xs py-3.5 bg-brand-blue/100 text-white font-bold rounded-2xl shadow hover:bg-brand-blue active:scale-95 transition-all"
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
            <p className="text-sm font-mono text-brand-blue/60 mb-3">{current.pronunciation}</p>
          )}
          <p className="text-sm text-zinc-500 italic">{current.english}</p>
          <div className="mt-4">
            <PlayButtonDark text={current.cantonese} disabled={isRecording || isProcessing} />
          </div>
        </div>

        {itemScore === null ? (
          <div className="flex flex-col items-center gap-4">
            {isProcessing ? (
              <div className="flex items-center gap-2 text-zinc-500">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-sm">Analysing your speech…</span>
              </div>
            ) : (
              <>
                <button
                  onPointerDown={handleMicPointerDown}
                  onPointerUp={handleMicPointerUp}
                  onPointerLeave={handleMicPointerLeave}
                  onContextMenu={(e) => e.preventDefault()}
                  className={`relative flex items-center justify-center w-24 h-24 rounded-full text-white shadow-xl transition-transform active:scale-95 select-none ${isRecording ? "bg-red-500 shadow-red-200 scale-105" : "bg-brand-blue shadow-brand-blue/20 hover:scale-105"}`}
                >
                  {isRecording && (
                    <span className="absolute w-full h-full rounded-full bg-red-400 animate-ping opacity-75" />
                  )}
                  {isRecording
                    ? <MicOff size={36} className="relative z-10" />
                    : <Mic size={36} className="relative z-10" />}
                </button>
                <p className="text-sm text-zinc-500">
                  {isRecording ? "Recording… tap to stop" : "Tap or hold to record"}
                </p>
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
                  <span className="font-bold">
                    {transcribed ? (
                      (() => {
                        const punct = /[，。！？、；：""''（）\s]/;
                        const expectedChars = [...current.cantonese].filter(c => !punct.test(c));
                        return [...transcribed].map((char, ci) => {
                          if (punct.test(char)) return <span key={ci} className="text-zinc-700">{char}</span>;
                          const cleanIdx = [...transcribed.slice(0, ci)].filter(c => !punct.test(c)).length;
                          const isMatch = cleanIdx < expectedChars.length && char === expectedChars[cleanIdx];
                          return <span key={ci} className={isMatch ? "text-green-600" : "text-orange-600"}>{char}</span>;
                        });
                      })()
                    ) : "—"}
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
                className="flex-1 py-3 bg-brand-blue/100 text-white font-bold rounded-2xl shadow hover:bg-brand-blue active:scale-95 transition-all text-sm"
              >
                {index + 1 >= vocab.length ? "See Results" : "Next →"}
              </button>
            </div>
          </motion.div>
        )}

        <div className="flex gap-1.5 justify-center">
          {vocab.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-brand-blue/100" : i < index ? "w-2 bg-brand-blue/20" : "w-2 bg-zinc-200"}`} />
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
            ? "bg-brand-blue/100 text-white rounded-br-sm"
            : "bg-white border border-zinc-100 text-zinc-800 rounded-bl-sm"
        }`}
      >
        <p className={`text-sm font-semibold ${isUser ? "text-white" : "text-zinc-800"}`}>{turn.cantonese}</p>
        <p className={`text-xs mt-0.5 ${isUser ? "text-brand-blue/60" : "text-zinc-400"}`}>{turn.pronunciation}</p>
      </div>
    </div>
  );
}

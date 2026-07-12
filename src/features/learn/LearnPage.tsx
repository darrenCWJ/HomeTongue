import { useState } from "react";
import { Play, BookOpen, Star, Trophy, Repeat, Drama } from "lucide-react";
import { useLibrary } from "../../app/context/LibraryProvider";
import { useProfile } from "../../app/context/ProfileProvider";
import { motion, AnimatePresence } from "motion/react";
import { getLessonLevels } from "../../data/lessons";
import { useLessonContent } from "../../hooks/useLessonContent";
import { resolveLanguagePackByLabel } from "../../languages";
import { filterByLanguage, type LanguageScoped } from "../../languages/scope";
import { LanguageFilter } from "../../app/components/LanguageFilter";
import type { LessonLevel, VocabItem, ConversationLesson } from "../../types";
import { getDailyVocab } from "./dailyVocab";
import { DailyReviewModal } from "./main/DailyReviewModal";
import { LessonCard } from "./main/LessonCard";
import { ConversationLessonCard } from "./main/ConversationLessonCard";
import { RoadmapView } from "./roadmap/RoadmapView";
import { LevelView } from "./roadmap/LevelView";
import { ConversationLessonView } from "./conversation-lesson/ConversationLessonView";
import { ExamView } from "./exam/ExamView";
import { PracticeView } from "./srs/PracticeView";
import { useReviewQueue } from "./srs/useReviewQueue";
import { ScenarioPicker } from "./roleplay/ScenarioPicker";
import { RoleplayView } from "./roleplay/RoleplayView";
import { hasRoleplayScenarios, type RoleplayScenario } from "../../services/roleplayService";

type View =
  "main" | "roadmap" | "level" | "conversation-lesson" | "exam" | "practice" | "roleplay-picker" | "roleplay";

interface ActiveLevel {
  categoryId: string;
  lessonId: string;
  level: LessonLevel;
}

export function LearnPage() {
  const { lessonProgress, conversationLessons, updateConversationLesson, deleteConversationLesson } =
    useLibrary();
  const { dialect } = useProfile();

  // Render-synchronous language derivation: ProfileProvider pushes the dialect
  // into setActiveLanguage() inside an effect (post-render), so reading
  // getActiveLanguagePack() here would lag one render behind a dialect switch.
  // Deriving the code straight from the profile dialect keeps lesson content
  // in lockstep with the render that reflects the new dialect.
  const languageCode = resolveLanguagePackByLabel(dialect).code;
  // Reactive: re-renders when DB-published lesson content lands (cloud mode).
  const { categories: lessonCategories, lessons } = useLessonContent(languageCode);
  const hasDailyVocab = lessons.some((l) => l.content.vocabulary.length > 0);

  // Conversation lessons without a languageCode are legacy Cantonese data
  // (see src/languages/scope.ts). The cast bridges until the optional
  // `languageCode` field lands on ConversationLesson in src/types.ts — drop
  // it once that field exists.
  const scopedConversationLessons = filterByLanguage(
    conversationLessons as Array<ConversationLesson & LanguageScoped>,
    languageCode
  );
  const personalLessons = scopedConversationLessons.filter((l) => !l.persona || l.persona === "personal");

  const [view, setView] = useState<View>("main");
  const [mainTab, setMainTab] = useState<"standard" | "custom">("standard");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [activeLevel, setActiveLevel] = useState<ActiveLevel | null>(null);
  const [dailyCard, setDailyCard] = useState<VocabItem | null>(null);
  const [activeConversationLesson, setActiveConversationLesson] = useState<ConversationLesson | null>(null);
  const [activeRoleplayScenario, setActiveRoleplayScenario] = useState<RoleplayScenario | null>(null);

  // Single queue instance shared with PracticeView so the due-count badge on
  // this page stays accurate as cards are graded.
  const review = useReviewQueue();

  const activeCategoryTitle =
    lessonCategories.find((c) => c.id === activeCategoryId)?.title ?? activeCategoryId ?? "";

  const completedConvLessons = personalLessons.filter((l) => l.examCompleted).length;
  const completedStandardLessons = lessons.filter((lesson) => {
    const prog = lessonProgress[lesson.id];
    return prog ? prog.completedLevels >= prog.totalLevels : false;
  }).length;
  const totalLessonsDone = completedConvLessons + completedStandardLessons;

  // Honest fluency stat: average conversation-lesson exam scores AND the last
  // graded accuracy of standard lessons, so users who only do standard
  // lessons still see a real number instead of a permanent blank. Both inputs
  // are scoped to the active language (conversation lessons via
  // filterByLanguage above; standard-lesson progress via the active lesson
  // id set, since lesson ids are globally unique across languages).
  const activeLessonIds = new Set(lessons.map((l) => l.id));
  const convScores = personalLessons
    .map((l) => l.examBestScore)
    .filter((s): s is number => typeof s === "number");
  const standardScores = Object.values(lessonProgress)
    .filter((p) => activeLessonIds.has(p.lessonId))
    .map((p) => p.lastAccuracy)
    .filter((a): a is number => typeof a === "number");
  const allScores = [...convScores, ...standardScores];
  const avgScore =
    allScores.length > 0
      ? Math.round(allScores.reduce((sum, score) => sum + score, 0) / allScores.length)
      : null;

  const handleSelectCategory = (categoryId: string) => {
    setActiveCategoryId(categoryId);
    setView("roadmap");
  };

  const handleSelectLevel = (lessonId: string, level: LessonLevel) => {
    if (!activeCategoryId) return;
    setActiveLevel({ categoryId: activeCategoryId, lessonId, level });
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
    setActiveRoleplayScenario(null);
    setView("main");
  };

  const handleSelectRoleplayScenario = (scenario: RoleplayScenario) => {
    setActiveRoleplayScenario(scenario);
    setView("roleplay");
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
      examBestScore:
        activeConversationLesson.examBestScore === undefined
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
            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-24 scrollbar-none">
              <div className="flex items-start justify-between mb-6 mt-2">
                <div>
                  <h1 className="text-2xl font-bold text-zinc-800">Learn</h1>
                  <p className="text-sm text-zinc-500">Master your saved phrases</p>
                </div>
                <div data-tour="learn-language-filter">
                  <LanguageFilter />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <div
                  data-tour="learn-lessons-done"
                  className="bg-white p-2.5 rounded-xl shadow-sm border border-zinc-100 flex flex-col items-center justify-center"
                >
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mb-1.5">
                    <Trophy size={16} className="text-green-500" />
                  </div>
                  <span className="text-xl font-bold text-zinc-800">{totalLessonsDone}</span>
                  <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide">
                    Lessons Done
                  </span>
                </div>
                <div
                  data-tour="learn-dialect-fluency"
                  className="bg-white p-2.5 rounded-xl shadow-sm border border-zinc-100 flex flex-col items-center justify-center"
                >
                  <div className="w-8 h-8 rounded-full bg-brand-red/15 flex items-center justify-center mb-1.5">
                    <Star size={16} className="text-brand-red" />
                  </div>
                  <span className="text-xl font-bold text-zinc-800">
                    {avgScore !== null ? `${avgScore}%` : "–"}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide">
                    Dialect Fluency
                  </span>
                </div>
              </div>

              <button
                data-tour="learn-practice-phrases"
                onClick={() => setView("practice")}
                className="w-full bg-white rounded-2xl p-3.5 shadow-sm border border-zinc-100 flex items-center justify-between mb-3 hover:border-brand-blue/40 active:scale-[0.99] transition-all text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-blue/15 flex items-center justify-center flex-shrink-0">
                    <Repeat size={18} className="text-brand-blue" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-800">Practice my phrases</p>
                    <p className="text-xs text-zinc-500">
                      {review.isLoading
                        ? "Loading…"
                        : review.dueCount > 0
                          ? `${review.dueCount} phrase${review.dueCount === 1 ? "" : "s"} due for review`
                          : review.totalBookmarked > 0
                            ? "All caught up — nothing due"
                            : "Bookmark phrases to start reviewing"}
                    </p>
                  </div>
                </div>
                {review.dueCount > 0 && (
                  <span className="bg-brand-red text-white text-xs font-bold rounded-full px-2.5 py-1 flex-shrink-0">
                    {review.dueCount}
                  </span>
                )}
              </button>

              {/* Gated on the roleplay registry: the card shows only when the
                  active pack has authored scenarios (see
                  src/languages/roleplayRegistry.ts). */}
              {hasRoleplayScenarios(languageCode) && (
                <button
                  data-tour="learn-roleplay"
                  onClick={() => setView("roleplay-picker")}
                  className="w-full bg-white rounded-2xl p-3.5 shadow-sm border border-zinc-100 flex items-center justify-between mb-3 hover:border-brand-red/40 active:scale-[0.99] transition-all text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-red/15 flex items-center justify-center flex-shrink-0">
                      <Drama size={18} className="text-brand-red" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-800">Rehearse a conversation</p>
                      <p className="text-xs text-zinc-500">
                        Roleplay real-life scenarios before the real thing
                      </p>
                    </div>
                  </div>
                </button>
              )}

              {hasDailyVocab && (
                <div
                  data-tour="learn-word-of-day"
                  className="bg-gradient-to-br from-brand-blue to-brand-red rounded-2xl py-3 px-4 text-white shadow-md mb-4 relative overflow-hidden flex items-center justify-between gap-3"
                >
                  <div className="absolute top-0 right-0 w-40 h-40 bg-white opacity-10 rounded-full -mr-12 -mt-12 blur-2xl" />
                  <p className="text-sm font-bold relative z-10">Word of the Day</p>
                  <button
                    onClick={() => setDailyCard(getDailyVocab(languageCode))}
                    className="bg-white text-brand-blue rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0 shadow-md hover:scale-105 active:scale-95 transition-transform z-10 relative"
                  >
                    <Play size={16} className="fill-brand-blue ml-0.5" />
                  </button>
                </div>
              )}

              {/* Tab switcher */}
              <div
                data-tour="learn-tab-switcher"
                className="flex bg-zinc-100 rounded-2xl p-1 mb-4 sticky top-0 z-10"
              >
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
                  {lessonCategories
                    .filter((cat) =>
                      lessons.some((l) => l.categoryId === cat.id && getLessonLevels(l).length > 0)
                    )
                    .map((cat) => {
                      const catLessons = lessons.filter((l) => l.categoryId === cat.id);
                      const totalLevels = catLessons.reduce((sum, l) => sum + getLessonLevels(l).length, 0);
                      const completedLevels = catLessons.reduce((sum, l) => {
                        const prog = lessonProgress[l.id];
                        return sum + Math.min(prog?.completedLevels ?? 0, getLessonLevels(l).length);
                      }, 0);
                      const progressPct =
                        totalLevels > 0 ? Math.round((completedLevels / totalLevels) * 100) : 0;
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
                      <p className="text-xs text-zinc-400">
                        Go to Saved Conversations and tap the bookmark icon to convert a chat into a lesson.
                      </p>
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

            {dailyCard && <DailyReviewModal card={dailyCard} onClose={() => setDailyCard(null)} />}
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

        {view === "practice" && <PracticeView key="practice" review={review} onBack={handleBackToMain} />}

        {view === "roleplay-picker" && (
          <ScenarioPicker
            key="roleplay-picker"
            languageCode={languageCode}
            onBack={handleBackToMain}
            onSelect={handleSelectRoleplayScenario}
          />
        )}

        {view === "roleplay" && activeRoleplayScenario && (
          <RoleplayView
            key={`roleplay-${activeRoleplayScenario.id}`}
            scenario={activeRoleplayScenario}
            onBack={() => {
              setActiveRoleplayScenario(null);
              setView("roleplay-picker");
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

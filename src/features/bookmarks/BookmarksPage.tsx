import { useState, useEffect } from "react";
import { Search, X } from "lucide-react";
import type { PersonaType, Session } from "../../types";
import { useProfile } from "../../app/context/ProfileProvider";
import { useLibrary } from "../../app/context/LibraryProvider";
import { toast } from "sonner";
import { filterByLanguage } from "../../languages/scope";
import { useActiveLanguageCode } from "../../hooks/useActiveLanguageCode";
import { LanguageFilter } from "../../app/components/LanguageFilter";
import { useTour } from "../../app/components/tour/TourProvider";
import { useUndoableDeletions } from "./hooks/useUndoableDeletions";
import { useBookmarkPlayback } from "./hooks/useBookmarkPlayback";
import { useBookmarkPhraseSelection } from "./hooks/useBookmarkPhraseSelection";
import { useSessionLessonActions } from "./hooks/useSessionLessonActions";
import { PhraseTagFilterBar } from "./components/PhraseTagFilterBar";
import { SessionTagFilterBar } from "./components/SessionTagFilterBar";
import { PhrasesTab } from "./components/PhrasesTab";
import { SessionsTab } from "./components/SessionsTab";
import { PhraseSelectionSheet } from "./components/PhraseSelectionSheet";
import { SessionViewer } from "./components/SessionViewer";
import { SessionMenu } from "./components/SessionMenu";
import { DeleteSessionDialog } from "./components/DeleteSessionDialog";

export function BookmarksPage() {
  const { userProfile } = useProfile();
  const {
    phrases,
    toggleBookmark,
    addPhrase,
    updatePhrase,
    sessions,
    renameSession,
    deleteSession,
    deleteSessionMessage,
    conversationLessons,
    saveConversationLesson,
    phraseTags,
    sessionTags,
    createTag,
    deleteTag,
    setPhraseTags,
    setSessionTags,
  } = useLibrary();
  const activeLanguageCode = useActiveLanguageCode();
  const { isActive: isTourActive, activeTour, currentStep } = useTour();
  const isTourMode = isTourActive && activeTour === "bookmarks";
  const [activeTab, setActiveTab] = useState<"phrases" | "sessions">("phrases");

  useEffect(() => {
    if (!isTourMode) return;
    if (currentStep === 4) {
      setActiveTab("sessions");
    } else if (currentStep < 4) {
      setActiveTab("phrases");
    }
  }, [isTourMode, currentStep]);
  const [selectedTagFilters, setSelectedTagFilters] = useState<Set<string>>(new Set());
  const [sessionTagFilters, setSessionTagFilters] = useState<Set<string>>(new Set());
  const [sessionPersonaFilters, setSessionPersonaFilters] = useState<Set<PersonaType>>(new Set());
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [editingTagsPhraseId, setEditingTagsPhraseId] = useState<string | null>(null);
  const [editingTagsSessionId, setEditingTagsSessionId] = useState<string | null>(null);
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [openMenuSessionId, setOpenMenuSessionId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const [viewingSession, setViewingSession] = useState<Session | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [deleteConfirmSessionId, setDeleteConfirmSessionId] = useState<string | null>(null);

  const { pendingTagDeletions, pendingMsgDeletions, handleDeleteTag, handleDeleteMessage } =
    useUndoableDeletions({
      deleteTag,
      deleteSessionMessage,
      setSelectedTagFilters,
      setSessionTagFilters,
      setViewingSession,
    });

  const { playingId, handleSpeak, playMessage } = useBookmarkPlayback({ sessions, userProfile });

  const {
    phraseSelectionData,
    phraseSelectionText,
    setPhraseSelectionText,
    handleSessionBookmark,
    handleBubblePointerDown,
    cancelBubbleLongPress,
    handleBubblePointerMove,
    handleSaveSelectedPhrase,
    cancelPhraseSelection,
  } = useBookmarkPhraseSelection({ phrases, addPhrase, toggleBookmark, activeLanguageCode });

  const {
    editingSessionId,
    setEditingSessionId,
    editingTitle,
    setEditingTitle,
    titleInputRef,
    startEditing,
    commitTitle,
    pendingConvertSession,
    setPendingConvertSession,
    audioSourceType,
    setAudioSourceType,
    handleMakeLesson,
    convertToLesson,
  } = useSessionLessonActions({ renameSession, conversationLessons, saveConversationLesson });

  // All saved-content lists are scoped to the active language; a dialect
  // switch must never show mixed-language data (see src/languages/scope.ts).
  const scopedPhrases = filterByLanguage(phrases, activeLanguageCode);
  const scopedSessions = filterByLanguage(sessions, activeLanguageCode);
  const scopedConversationLessons = filterByLanguage(conversationLessons, activeLanguageCode);

  const allBookmarked = scopedPhrases.filter((p) => p.isBookmarked || (p.tags?.length ?? 0) > 0);
  const searchLower = searchQuery.toLowerCase().trim();
  const bookmarkedPhrases = allBookmarked
    .filter((p) => selectedTagFilters.size === 0 || p.tags?.some((t) => selectedTagFilters.has(t)))
    .filter((p) => !searchLower || p.original.toLowerCase().includes(searchLower))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Header */}
      <div className="bg-card px-4 py-4 border-b border-border sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-foreground">Saved Content</h1>
          <div data-tour="bookmarks-language-filter">
            <LanguageFilter />
          </div>
        </div>

        {/* Tabs */}
        <div data-tour="bookmarks-tabs" className="flex bg-muted rounded-lg p-1 mb-4">
          <button
            onClick={() => {
              setActiveTab("phrases");
              setSelectedTagFilters(new Set());
            }}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "phrases"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground/90"
            }`}
          >
            Phrases
          </button>
          <button
            onClick={() => setActiveTab("sessions")}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "sessions"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground/90"
            }`}
          >
            Conversations
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2 mb-3">
          <Search size={16} className="text-faint" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by English translation..."
            className="bg-transparent border-none outline-none text-sm w-full placeholder:text-faint"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-faint hover:text-muted-foreground">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Tag filter chips — phrases tab only */}
        {activeTab === "phrases" && (
          <PhraseTagFilterBar
            phraseTags={phraseTags}
            pendingTagDeletions={pendingTagDeletions}
            selectedTagFilters={selectedTagFilters}
            setSelectedTagFilters={setSelectedTagFilters}
            isEditingTags={isEditingTags}
            setIsEditingTags={setIsEditingTags}
            isCreatingTag={isCreatingTag}
            setIsCreatingTag={setIsCreatingTag}
            newTagName={newTagName}
            setNewTagName={setNewTagName}
            tagsExpanded={tagsExpanded}
            setTagsExpanded={setTagsExpanded}
            createTag={createTag}
            onDeleteTag={handleDeleteTag}
          />
        )}

        {/* Persona + tag filter chips — sessions tab only */}
        {activeTab === "sessions" && (
          <SessionTagFilterBar
            sessionTags={sessionTags}
            pendingTagDeletions={pendingTagDeletions}
            sessionTagFilters={sessionTagFilters}
            setSessionTagFilters={setSessionTagFilters}
            sessionPersonaFilters={sessionPersonaFilters}
            setSessionPersonaFilters={setSessionPersonaFilters}
            isEditingTags={isEditingTags}
            setIsEditingTags={setIsEditingTags}
            isCreatingTag={isCreatingTag}
            setIsCreatingTag={setIsCreatingTag}
            newTagName={newTagName}
            setNewTagName={setNewTagName}
            tagsExpanded={tagsExpanded}
            setTagsExpanded={setTagsExpanded}
            createTag={createTag}
            onDeleteTag={handleDeleteTag}
          />
        )}
      </div>

      {/* List */}
      <div className="p-4 space-y-3 overflow-y-auto scrollbar-none">
        {activeTab === "phrases" ? (
          <PhrasesTab
            bookmarkedPhrases={bookmarkedPhrases}
            isTourMode={isTourMode}
            phraseTags={phraseTags}
            editingTagsPhraseId={editingTagsPhraseId}
            setEditingTagsPhraseId={setEditingTagsPhraseId}
            playingId={playingId}
            onSpeak={handleSpeak}
            updatePhrase={updatePhrase}
            setPhraseTags={setPhraseTags}
          />
        ) : (
          <SessionsTab
            sessions={scopedSessions}
            sessionPersonaFilters={sessionPersonaFilters}
            sessionTagFilters={sessionTagFilters}
            searchLower={searchLower}
            isTourMode={isTourMode}
            sessionTags={sessionTags}
            conversationLessons={scopedConversationLessons}
            expandedSessionId={expandedSessionId}
            setExpandedSessionId={setExpandedSessionId}
            editingSessionId={editingSessionId}
            setEditingSessionId={setEditingSessionId}
            editingTitle={editingTitle}
            setEditingTitle={setEditingTitle}
            titleInputRef={titleInputRef}
            commitTitle={commitTitle}
            openMenuSessionId={openMenuSessionId}
            setOpenMenuSessionId={setOpenMenuSessionId}
            setMenuPosition={setMenuPosition}
            onView={setViewingSession}
            editingTagsSessionId={editingTagsSessionId}
            setSessionTags={setSessionTags}
            pendingConvertSession={pendingConvertSession}
            setPendingConvertSession={setPendingConvertSession}
            audioSourceType={audioSourceType}
            setAudioSourceType={setAudioSourceType}
            onMakeLesson={handleMakeLesson}
            onConvertToLesson={convertToLesson}
          />
        )}
      </div>

      {/* Save partial phrase sheet */}
      <PhraseSelectionSheet
        isOpen={!!phraseSelectionData}
        phraseSelectionText={phraseSelectionText}
        setPhraseSelectionText={setPhraseSelectionText}
        onSave={handleSaveSelectedPhrase}
        onCancel={cancelPhraseSelection}
      />

      {/* Full-screen conversation view */}
      <SessionViewer
        session={viewingSession}
        onClose={() => setViewingSession(null)}
        phrases={phrases}
        playingId={playingId}
        pendingMsgDeletions={pendingMsgDeletions}
        onPlayMessage={playMessage}
        onBookmarkMessage={handleSessionBookmark}
        onDeleteMessage={handleDeleteMessage}
        onBubblePointerDown={handleBubblePointerDown}
        onBubblePointerMove={handleBubblePointerMove}
        onBubblePointerCancel={cancelBubbleLongPress}
      />

      {/* Fixed dropdown menu for session actions */}
      {openMenuSessionId && menuPosition && (
        <SessionMenu
          menuPosition={menuPosition}
          onClose={() => {
            setOpenMenuSessionId(null);
            setMenuPosition(null);
          }}
          onEditName={() => {
            startEditing(
              openMenuSessionId,
              sessions.find((s) => s.id === openMenuSessionId)?.title ?? "Conversation"
            );
            setOpenMenuSessionId(null);
            setMenuPosition(null);
          }}
          onEditLabel={() => {
            setEditingTagsSessionId(editingTagsSessionId === openMenuSessionId ? null : openMenuSessionId);
            setOpenMenuSessionId(null);
            setMenuPosition(null);
          }}
          onAddNote={() => {
            toast.info("Notes coming soon!");
            setOpenMenuSessionId(null);
            setMenuPosition(null);
          }}
          onDelete={() => {
            setDeleteConfirmSessionId(openMenuSessionId);
            setOpenMenuSessionId(null);
            setMenuPosition(null);
          }}
        />
      )}

      {/* Delete confirmation dialog */}
      <DeleteSessionDialog
        isOpen={!!deleteConfirmSessionId}
        onCancel={() => setDeleteConfirmSessionId(null)}
        onConfirm={() => {
          if (!deleteConfirmSessionId) return;
          deleteSession(deleteConfirmSessionId);
          if (expandedSessionId === deleteConfirmSessionId) setExpandedSessionId(null);
          setDeleteConfirmSessionId(null);
          toast.success("Conversation deleted.");
        }}
      />
    </div>
  );
}

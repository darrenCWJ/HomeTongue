import React, { useState, useRef, useCallback, useEffect } from "react";
import { Search, X } from "lucide-react";
import type { PersonaType, Session } from "../../types";
import { useAppContext } from "../../app/context/AppContext";
import { playDataUrl } from "../../hooks/audio";
import { speakText } from "../../hooks/useGoogleTTS";
import { toast } from "sonner";
import { extractVocabFromMessages } from "../../utils/vocab";
import { LanguageFilter } from "../../app/components/LanguageFilter";
import { useTour } from "../../app/components/tour/TourProvider";
import { PhraseTagFilterBar } from "./components/PhraseTagFilterBar";
import { SessionTagFilterBar } from "./components/SessionTagFilterBar";
import { PhrasesTab } from "./components/PhrasesTab";
import { SessionsTab } from "./components/SessionsTab";
import { PhraseSelectionSheet } from "./components/PhraseSelectionSheet";
import { SessionViewer } from "./components/SessionViewer";
import { SessionMenu } from "./components/SessionMenu";
import { DeleteSessionDialog } from "./components/DeleteSessionDialog";

export function BookmarksPage() {
  const {
    phrases,
    toggleBookmark,
    addPhrase,
    updatePhrase,
    sessions,
    userProfile,
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
  } = useAppContext();
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
  const [pendingTagDeletions, setPendingTagDeletions] = useState<Set<string>>(new Set());
  const [pendingMsgDeletions, setPendingMsgDeletions] = useState<Set<string>>(new Set());
  const deleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const msgDeleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const handleDeleteTag = useCallback(
    (tagId: string) => {
      setPendingTagDeletions((prev) => new Set([...prev, tagId]));
      setSelectedTagFilters((prev) => {
        const next = new Set(prev);
        next.delete(tagId);
        return next;
      });
      setSessionTagFilters((prev) => {
        const next = new Set(prev);
        next.delete(tagId);
        return next;
      });

      const timer = setTimeout(() => {
        deleteTag(tagId);
        setPendingTagDeletions((prev) => {
          const next = new Set(prev);
          next.delete(tagId);
          return next;
        });
        deleteTimers.current.delete(tagId);
      }, 5000);
      deleteTimers.current.set(tagId, timer);

      toast("Tag deleted", {
        duration: 5000,
        action: {
          label: "Undo",
          onClick: () => {
            clearTimeout(deleteTimers.current.get(tagId));
            deleteTimers.current.delete(tagId);
            setPendingTagDeletions((prev) => {
              const next = new Set(prev);
              next.delete(tagId);
              return next;
            });
          },
        },
      });
    },
    [deleteTag]
  );

  const allBookmarked = phrases.filter((p) => p.isBookmarked || (p.tags?.length ?? 0) > 0);
  const searchLower = searchQuery.toLowerCase().trim();
  const bookmarkedPhrases = allBookmarked
    .filter((p) => selectedTagFilters.size === 0 || p.tags?.some((t) => selectedTagFilters.has(t)))
    .filter((p) => !searchLower || p.original.toLowerCase().includes(searchLower))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const [pendingConvertSession, setPendingConvertSession] = useState<Session | null>(null);
  const [deleteConfirmSessionId, setDeleteConfirmSessionId] = useState<string | null>(null);
  const [audioSourceType, setAudioSourceType] = useState<"recorded" | "transcribed">("recorded");
  const [phraseSelectionData, setPhraseSelectionData] = useState<{
    dialect: string;
    original: string;
  } | null>(null);
  const [phraseSelectionText, setPhraseSelectionText] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const LONG_PRESS_MS = 500;
  const LONG_PRESS_MOVE_THRESHOLD = 8;

  const startEditing = (id: string, currentTitle: string) => {
    setEditingSessionId(id);
    setEditingTitle(currentTitle);
    setTimeout(() => titleInputRef.current?.focus(), 50);
  };

  const commitTitle = (id: string) => {
    const trimmed = editingTitle.trim();
    if (trimmed) renameSession(id, trimmed);
    setEditingSessionId(null);
  };

  const handleMakeLesson = (session: Session) => {
    const alreadyExists = conversationLessons.some((l) => l.sessionId === session.id);
    if (alreadyExists) {
      toast.info("This conversation is already a lesson.");
      return;
    }
    if ((session.persona ?? "personal") === "personal") {
      setAudioSourceType("recorded");
      setPendingConvertSession(session);
    } else {
      convertToLesson(session, "transcribed");
    }
  };

  const convertToLesson = (session: Session, audioSource: "recorded" | "transcribed") => {
    const vocab = extractVocabFromMessages(session.messages, audioSource);
    if (vocab.length === 0) {
      toast.error("No vocabulary found in this conversation.");
      return;
    }
    saveConversationLesson({
      id: session.id,
      sessionId: session.id,
      title: session.title ?? "Conversation",
      createdAt: new Date().toISOString(),
      vocabulary: vocab,
      examCompleted: false,
      examAttempts: 0,
    });
    setPendingConvertSession(null);
    toast.success("Added to Learn!");
  };

  const handleSessionBookmark = (msg: {
    id: string;
    sender: string;
    text?: string;
    cantoneseText?: string;
    englishTranslation?: string;
    audioDataUrl?: string;
    audioDataUrls?: string[];
  }) => {
    const existing = phrases.find((p) => p.id === msg.id);
    if (existing) {
      toggleBookmark(msg.id);
    } else {
      const dialectText = msg.sender === "bot" ? (msg.text ?? "") : (msg.cantoneseText ?? "");
      const originalText = msg.sender === "bot" ? (msg.englishTranslation ?? "") : (msg.text ?? "");
      if (!dialectText) return;
      const urls = msg.audioDataUrls ?? (msg.audioDataUrl ? [msg.audioDataUrl] : []);
      addPhrase({
        id: msg.id,
        original: originalText,
        dialect: dialectText,
        pronunciation: "",
        isBookmarked: true,
        context: "",
        audioDataUrl: urls[0],
        audioDataUrls: urls.length > 1 ? urls : undefined,
      });
    }
  };

  const handleBubblePointerDown = (e: React.PointerEvent, dialectText: string, originalText: string) => {
    if (!dialectText) return;
    longPressStartPosRef.current = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = setTimeout(() => {
      setPhraseSelectionData({ dialect: dialectText, original: originalText });
      setPhraseSelectionText(dialectText);
      longPressTimerRef.current = null;
    }, LONG_PRESS_MS);
  };

  const cancelBubbleLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartPosRef.current = null;
  };

  const handleBubblePointerMove = (e: React.PointerEvent) => {
    if (!longPressStartPosRef.current || !longPressTimerRef.current) return;
    const dx = Math.abs(e.clientX - longPressStartPosRef.current.x);
    const dy = Math.abs(e.clientY - longPressStartPosRef.current.y);
    if (dx > LONG_PRESS_MOVE_THRESHOLD || dy > LONG_PRESS_MOVE_THRESHOLD) {
      cancelBubbleLongPress();
    }
  };

  const handleSaveSelectedPhrase = () => {
    if (!phraseSelectionData || !phraseSelectionText.trim()) return;
    addPhrase({
      id: Date.now().toString(),
      original: phraseSelectionData.original,
      dialect: phraseSelectionText.trim(),
      pronunciation: "",
      isBookmarked: true,
      context: "",
    });
    setPhraseSelectionData(null);
    setPhraseSelectionText("");
    toast.success("Phrase saved to bookmarks!");
  };

  const handleSpeak = async (
    phraseId: string,
    text: string,
    audioDataUrl?: string,
    audioDataUrls?: string[]
  ) => {
    if (playingId) return;
    setPlayingId(phraseId);
    try {
      let urls = audioDataUrls ?? [];
      if (urls.length === 0) {
        const msg = sessions.flatMap((s) => s.messages).find((m) => m.id === phraseId);
        urls = msg?.audioDataUrls ?? (msg?.audioDataUrl ? [msg.audioDataUrl] : []);
      }
      if (urls.length === 0 && audioDataUrl) {
        urls = [audioDataUrl];
      }
      if (urls.length > 0) {
        for (const url of urls) {
          await playDataUrl(url);
        }
      } else {
        await speakText(text, userProfile?.preferredVoiceId);
      }
    } catch {
      toast.error("Audio playback failed. Check your connection.");
    } finally {
      setPlayingId(null);
    }
  };

  const playMessage = async (
    msgId: string,
    audioDataUrl?: string,
    audioDataUrls?: string[],
    fallbackText?: string
  ) => {
    if (playingId) return;
    setPlayingId(msgId);
    try {
      const urls = audioDataUrls ?? (audioDataUrl ? [audioDataUrl] : []);
      if (urls.length > 0) {
        for (const url of urls) {
          await playDataUrl(url);
        }
      } else if (fallbackText) {
        await speakText(fallbackText, userProfile?.preferredVoiceId);
      }
    } catch {
      toast.error("Audio playback failed.");
    } finally {
      setPlayingId(null);
    }
  };

  const handleDeleteMessage = (sessionId: string, msgId: string) => {
    setPendingMsgDeletions((prev) => new Set([...prev, msgId]));
    const timer = setTimeout(() => {
      deleteSessionMessage(sessionId, msgId);
      setViewingSession((prev) =>
        prev ? { ...prev, messages: prev.messages.filter((m) => m.id !== msgId) } : null
      );
      setPendingMsgDeletions((prev) => {
        const next = new Set(prev);
        next.delete(msgId);
        return next;
      });
      msgDeleteTimers.current.delete(msgId);
    }, 4000);
    msgDeleteTimers.current.set(msgId, timer);
    toast("Message deleted", {
      duration: 4000,
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(msgDeleteTimers.current.get(msgId));
          msgDeleteTimers.current.delete(msgId);
          setPendingMsgDeletions((prev) => {
            const next = new Set(prev);
            next.delete(msgId);
            return next;
          });
        },
      },
    });
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50 relative">
      {/* Header */}
      <div className="bg-white px-4 py-4 border-b border-zinc-200 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-zinc-800">Saved Content</h1>
          <div data-tour="bookmarks-language-filter">
            <LanguageFilter />
          </div>
        </div>

        {/* Tabs */}
        <div data-tour="bookmarks-tabs" className="flex bg-zinc-100 rounded-lg p-1 mb-4">
          <button
            onClick={() => {
              setActiveTab("phrases");
              setSelectedTagFilters(new Set());
            }}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "phrases"
                ? "bg-white text-zinc-800 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Phrases
          </button>
          <button
            onClick={() => setActiveTab("sessions")}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "sessions"
                ? "bg-white text-zinc-800 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Conversations
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-zinc-100 rounded-xl px-3 py-2 mb-3">
          <Search size={16} className="text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by English translation..."
            className="bg-transparent border-none outline-none text-sm w-full placeholder-zinc-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-zinc-400 hover:text-zinc-600">
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
            sessions={sessions}
            sessionPersonaFilters={sessionPersonaFilters}
            sessionTagFilters={sessionTagFilters}
            searchLower={searchLower}
            isTourMode={isTourMode}
            sessionTags={sessionTags}
            conversationLessons={conversationLessons}
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
        onCancel={() => {
          setPhraseSelectionData(null);
          setPhraseSelectionText("");
        }}
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

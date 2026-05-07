import React, { useState, useRef, useCallback } from "react";
import { Bookmark, Volume2, Search, History, ChevronDown, Pencil, Trash2, Check, X, BookOpen, Home, Briefcase, Mic, Plus, Tag as TagIcon, StickyNote, ArrowLeft } from "lucide-react";
import type { PersonaType, Session } from "../../types";
import { useAppContext } from "../context/AppContext";
import { playDataUrl } from "../../hooks/useElevenLabs";
import { speakText } from "../../hooks/useGoogleTTS";
import { toast } from "sonner";
import { extractVocabFromMessages } from "../../utils/vocab";
import { LanguageFilter } from "../components/LanguageFilter";
import { motion, AnimatePresence } from "motion/react";


export function BookmarksPage() {
  const { phrases, toggleBookmark, addPhrase, sessions, userProfile, renameSession, deleteSession, conversationLessons, saveConversationLesson, phraseTags, sessionTags, createTag, deleteTag, setPhraseTags, setSessionTags } = useAppContext();
  const [activeTab, setActiveTab] = useState<"phrases" | "sessions">("phrases");
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [sessionTagFilter, setSessionTagFilter] = useState<string | null>(null);
  const [sessionPersonaFilter, setSessionPersonaFilter] = useState<"all" | PersonaType>("all");
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
  const deleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const handleDeleteTag = useCallback((tagId: string) => {
    setPendingTagDeletions((prev) => new Set([...prev, tagId]));
    if (selectedTagFilter === tagId) setSelectedTagFilter(null);
    if (sessionTagFilter === tagId) setSessionTagFilter(null);

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
  }, [deleteTag, selectedTagFilter, sessionTagFilter]);

  const allBookmarked = phrases.filter((p) => p.isBookmarked || (p.tags?.length ?? 0) > 0);
  const searchLower = searchQuery.toLowerCase().trim();
  const bookmarkedPhrases = allBookmarked
    .filter((p) => !selectedTagFilter || p.tags?.includes(selectedTagFilter))
    .filter((p) => !searchLower || p.original.toLowerCase().includes(searchLower));
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [pendingConvertSession, setPendingConvertSession] = useState<Session | null>(null);
  const [audioSourceType, setAudioSourceType] = useState<"recorded" | "transcribed">("recorded");
  const [phraseSelectionData, setPhraseSelectionData] = useState<{ dialect: string; original: string } | null>(null);
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

  const handleDeleteClick = (id: string) => {
    if (confirmDeleteId === id) {
      deleteSession(id);
      if (expandedSessionId === id) setExpandedSessionId(null);
      setConfirmDeleteId(null);
      toast.success("Conversation deleted.");
    } else {
      setConfirmDeleteId(id);
    }
  };

  const handleSessionBookmark = (msg: { id: string; sender: string; text?: string; cantoneseText?: string; englishTranslation?: string; audioDataUrl?: string; audioDataUrls?: string[] }) => {
    const existing = phrases.find((p) => p.id === msg.id);
    if (existing) {
      toggleBookmark(msg.id);
    } else {
      const dialectText = msg.sender === "bot" ? (msg.text ?? "") : (msg.cantoneseText ?? "");
      const originalText = msg.sender === "bot" ? (msg.englishTranslation ?? "") : (msg.text ?? "");
      if (!dialectText) return;
      const urls = msg.audioDataUrls ?? (msg.audioDataUrl ? [msg.audioDataUrl] : []);
      addPhrase({ id: msg.id, original: originalText, dialect: dialectText, pronunciation: "", isBookmarked: true, context: "", audioDataUrl: urls[0], audioDataUrls: urls.length > 1 ? urls : undefined });
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
    addPhrase({ id: Date.now().toString(), original: phraseSelectionData.original, dialect: phraseSelectionText.trim(), pronunciation: "", isBookmarked: true, context: "" });
    setPhraseSelectionData(null);
    setPhraseSelectionText("");
    toast.success("Phrase saved to bookmarks!");
  };

  const handleSpeak = async (phraseId: string, text: string, audioDataUrl?: string, audioDataUrls?: string[]) => {
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

  const playMessage = async (msgId: string, audioDataUrl?: string, audioDataUrls?: string[], fallbackText?: string) => {
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

  return (
    <div className="flex flex-col h-full bg-zinc-50 relative">
      {/* Header */}
      <div className="bg-white px-4 py-4 border-b border-zinc-200 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-zinc-800">Saved Content</h1>
          <LanguageFilter />
        </div>
        
        {/* Tabs */}
        <div className="flex bg-zinc-100 rounded-lg p-1 mb-4">
          <button
            onClick={() => { setActiveTab("phrases"); setSelectedTagFilter(null); }}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "phrases" ? "bg-white text-zinc-800 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Phrases
          </button>
          <button
            onClick={() => setActiveTab("sessions")}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "sessions" ? "bg-white text-zinc-800 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
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
        {activeTab === "phrases" && (() => {
          const visiblePhraseTags = phraseTags.filter((t) => !pendingTagDeletions.has(t.id));
          const displayedPhraseTags = tagsExpanded ? visiblePhraseTags : visiblePhraseTags.slice(0, 3);
          const hasMorePhraseTags = visiblePhraseTags.length > 3;
          return (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedTagFilter(null)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                !selectedTagFilter
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              }`}
            >
              All
            </button>
            {displayedPhraseTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => !isEditingTags && setSelectedTagFilter(selectedTagFilter === tag.id ? null : tag.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1 ${
                  selectedTagFilter === tag.id
                    ? "bg-indigo-600 text-white"
                    : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                }`}
              >
                {tag.name}
                {isEditingTags && (
                  <span
                    onClick={(e) => { e.stopPropagation(); handleDeleteTag(tag.id); }}
                    className="ml-0.5 rounded-full hover:bg-indigo-200 p-0.5"
                  >
                    <X size={10} />
                  </span>
                )}
              </button>
            ))}
            {hasMorePhraseTags && (
              <button
                onClick={() => setTagsExpanded(!tagsExpanded)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-500 hover:bg-zinc-200 transition-colors flex items-center gap-1"
              >
                <ChevronDown size={12} className={`transition-transform duration-200 ${tagsExpanded ? "rotate-180" : ""}`} />
                {tagsExpanded ? "Less" : `+${visiblePhraseTags.length - 3}`}
              </button>
            )}
            {isCreatingTag ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTagName.trim()) {
                      createTag(newTagName.trim(), "phrase");
                      setNewTagName("");
                      setIsCreatingTag(false);
                    }
                    if (e.key === "Escape") { setIsCreatingTag(false); setNewTagName(""); }
                  }}
                  placeholder="Tag name"
                  autoFocus
                  className="px-3 py-1.5 rounded-full text-xs border-2 border-indigo-300 focus:border-indigo-500 focus:outline-none w-24"
                />
                <button
                  onClick={() => {
                    if (newTagName.trim()) {
                      createTag(newTagName.trim(), "phrase");
                      setNewTagName("");
                      setIsCreatingTag(false);
                    }
                  }}
                  className="p-1.5 rounded-full bg-indigo-600 text-white"
                >
                  <Check size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsCreatingTag(true)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-zinc-300 text-zinc-400 hover:border-indigo-300 hover:text-indigo-500 transition-all flex items-center gap-1"
              >
                <Plus size={12} />
                New
              </button>
            )}
            <button
              onClick={() => setIsEditingTags(!isEditingTags)}
              className={`flex-shrink-0 p-1.5 rounded-full transition-colors ${
                isEditingTags
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-400 hover:text-indigo-500 hover:bg-zinc-100"
              }`}
            >
              {isEditingTags ? <Check size={12} /> : <Pencil size={12} />}
            </button>
          </div>
          );
        })()}

        {/* Persona + tag filter chips — sessions tab only */}
        {activeTab === "sessions" && (() => {
          const visibleSessionTags = sessionTags.filter((t) => !pendingTagDeletions.has(t.id));
          const displayedSessionTags = tagsExpanded ? visibleSessionTags : visibleSessionTags.slice(0, 3);
          const hasMoreSessionTags = visibleSessionTags.length > 3;
          return (
          <div className="flex flex-wrap gap-2">
            {([
              { id: "all", label: "All" },
              { id: "personal", label: "Personal", icon: <Home size={11} /> },
              { id: "work", label: "Work", icon: <Briefcase size={11} /> },
            ] as { id: "all" | PersonaType; label: string; icon?: React.ReactNode }[]).map((f) => (
              <button
                key={f.id}
                onClick={() => { setSessionPersonaFilter(f.id); setSessionTagFilter(null); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  sessionPersonaFilter === f.id && !sessionTagFilter
                    ? "bg-indigo-600 text-white"
                    : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                }`}
              >
                {f.icon}
                {f.label}
              </button>
            ))}
            {displayedSessionTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => !isEditingTags && setSessionTagFilter(sessionTagFilter === tag.id ? null : tag.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1 ${
                  sessionTagFilter === tag.id
                    ? "bg-indigo-600 text-white"
                    : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                }`}
              >
                {tag.name}
                {isEditingTags && (
                  <span
                    onClick={(e) => { e.stopPropagation(); handleDeleteTag(tag.id); }}
                    className="ml-0.5 rounded-full hover:bg-indigo-200 p-0.5"
                  >
                    <X size={10} />
                  </span>
                )}
              </button>
            ))}
            {hasMoreSessionTags && (
              <button
                onClick={() => setTagsExpanded(!tagsExpanded)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-500 hover:bg-zinc-200 transition-colors flex items-center gap-1"
              >
                <ChevronDown size={12} className={`transition-transform duration-200 ${tagsExpanded ? "rotate-180" : ""}`} />
                {tagsExpanded ? "Less" : `+${visibleSessionTags.length - 3}`}
              </button>
            )}
            {isCreatingTag ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTagName.trim()) {
                      createTag(newTagName.trim(), "session");
                      setNewTagName("");
                      setIsCreatingTag(false);
                    }
                    if (e.key === "Escape") { setIsCreatingTag(false); setNewTagName(""); }
                  }}
                  placeholder="Tag name"
                  autoFocus
                  className="px-3 py-1.5 rounded-full text-xs border-2 border-indigo-300 focus:border-indigo-500 focus:outline-none w-24"
                />
                <button
                  onClick={() => {
                    if (newTagName.trim()) {
                      createTag(newTagName.trim(), "session");
                      setNewTagName("");
                      setIsCreatingTag(false);
                    }
                  }}
                  className="p-1.5 rounded-full bg-indigo-600 text-white"
                >
                  <Check size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsCreatingTag(true)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-zinc-300 text-zinc-400 hover:border-indigo-300 hover:text-indigo-500 transition-all flex items-center gap-1"
              >
                <Plus size={12} />
                New
              </button>
            )}
            <button
              onClick={() => setIsEditingTags(!isEditingTags)}
              className={`flex-shrink-0 p-1.5 rounded-full transition-colors ${
                isEditingTags
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-400 hover:text-indigo-500 hover:bg-zinc-100"
              }`}
            >
              {isEditingTags ? <Check size={12} /> : <Pencil size={12} />}
            </button>
          </div>
          );
        })()}
      </div>

      {/* List */}
      <div className="p-4 space-y-3 overflow-y-auto">
        {activeTab === "phrases" ? (
          bookmarkedPhrases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mb-4">
                <Bookmark size={24} className="text-zinc-400" />
              </div>
              <h3 className="text-lg font-medium text-zinc-800 mb-1">No saved phrases yet</h3>
              <p className="text-sm text-zinc-500">
                Bookmark phrases in the chat to build your personal dialect phrasebook.
              </p>
            </div>
          ) : (
            bookmarkedPhrases.map((phrase) => (
              <div key={phrase.id} className="bg-white rounded-2xl p-4 shadow-sm border border-zinc-100 relative">
                <div className="absolute top-4 right-4 flex items-center gap-1">
                  <button
                    onClick={() => setEditingTagsPhraseId(editingTagsPhraseId === phrase.id ? null : phrase.id)}
                    className={`p-1.5 rounded-full transition-colors ${
                      editingTagsPhraseId === phrase.id
                        ? "bg-indigo-100 text-indigo-600"
                        : "text-zinc-400 hover:text-indigo-500 hover:bg-zinc-100"
                    }`}
                  >
                    <TagIcon size={16} />
                  </button>
                  <button
                    onClick={() => toggleBookmark(phrase.id)}
                    className="text-indigo-500 hover:text-indigo-600"
                  >
                    <Bookmark size={20} className="fill-indigo-500" />
                  </button>
                </div>

                <div className="pr-16">
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    {phrase.context && (
                      <span className="text-[10px] font-medium text-indigo-500 uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded-full">
                        {phrase.context}
                      </span>
                    )}
                    {phrase.tags?.map((tagId) => {
                      const tag = phraseTags.find((t) => t.id === tagId);
                      if (!tag) return null;
                      return (
                        <span key={tagId} className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                          {tag.name}
                        </span>
                      );
                    })}
                  </div>
                  <p className="text-lg font-medium text-zinc-800 mb-1">{phrase.dialect}</p>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-sm text-zinc-500 italic">{phrase.pronunciation}</p>
                    <button
                      onClick={() => handleSpeak(phrase.id, phrase.dialect, phrase.audioDataUrl, phrase.audioDataUrls)}
                      disabled={playingId !== null}
                      className={`p-1.5 rounded-full transition-colors ${
                        playingId === phrase.id
                          ? "bg-indigo-100 text-indigo-600"
                          : "bg-zinc-50 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                      } disabled:cursor-not-allowed`}
                    >
                      <Volume2 size={14} className={playingId === phrase.id ? "animate-pulse" : ""} />
                    </button>
                  </div>
                  <div className="bg-zinc-50 rounded-lg p-2.5 border border-zinc-100">
                    <p className="text-xs text-zinc-600 font-medium line-clamp-2">
                      <span className="text-zinc-400 font-normal mr-1">Meaning:</span>
                      {phrase.original}
                    </p>
                  </div>
                </div>

                {/* Inline tag editor */}
                {editingTagsPhraseId === phrase.id && (
                  <div className="mt-3 pt-3 border-t border-zinc-100">
                    <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Tags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {phraseTags.map((tag) => {
                        const isSelected = phrase.tags?.includes(tag.id) ?? false;
                        return (
                          <button
                            key={tag.id}
                            onClick={() => {
                              const current = phrase.tags ?? [];
                              const updated = isSelected
                                ? current.filter((t) => t !== tag.id)
                                : [...current, tag.id];
                              setPhraseTags(phrase.id, updated);
                            }}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                              isSelected
                                ? "bg-indigo-600 text-white"
                                : "bg-zinc-100 text-zinc-500 hover:bg-indigo-50 hover:text-indigo-600"
                            }`}
                          >
                            {tag.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))
          )
        ) : (
          (() => {
            let filteredSessions = sessionTagFilter
              ? sessions.filter((s) => s.tags?.includes(sessionTagFilter))
              : sessionPersonaFilter === "all"
                ? sessions
                : sessions.filter((s) => (s.persona ?? "personal") === sessionPersonaFilter);
            if (searchLower) {
              filteredSessions = filteredSessions.filter((s) =>
                s.messages.some((m) =>
                  (m.englishTranslation ?? "").toLowerCase().includes(searchLower) ||
                  (m.sender === "user" && (m.text ?? "").toLowerCase().includes(searchLower))
                )
              );
            }
            return filteredSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mb-4">
                <History size={24} className="text-zinc-400" />
              </div>
              <h3 className="text-lg font-medium text-zinc-800 mb-1">No saved sessions</h3>
              <p className="text-sm text-zinc-500">
                Finish and save your roleplay conversations to review them later.
              </p>
            </div>
            ) : (
            filteredSessions.map((session) => {
              const hasAudio = session.messages.some((m) => m.audioDataUrl);
              return (
                <div key={session.id} className="bg-white rounded-2xl shadow-sm border border-zinc-100">
                  {/* Session header */}
                  <div className="p-5 flex items-center gap-3">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedSessionId(expandedSessionId === session.id ? null : session.id)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        {editingSessionId === session.id ? (
                          <input
                            ref={titleInputRef}
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitTitle(session.id);
                              if (e.key === "Escape") setEditingSessionId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="text-base font-semibold text-zinc-800 border-b-2 border-indigo-400 outline-none bg-transparent w-36"
                          />
                        ) : (
                          <p className="font-semibold text-zinc-800 text-base truncate">
                            {session.title ?? "Conversation"}
                          </p>
                        )}
                        {hasAudio && (
                          <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded-full flex-shrink-0">
                            🔊 Audio saved
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 flex items-center gap-1.5">
                        {session.date} · {session.messages.length} messages
                        {session.persona === "work"
                          ? <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded-full text-[10px] font-semibold"><Briefcase size={9} /> Work</span>
                          : <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-50 text-indigo-500 rounded-full text-[10px] font-semibold"><Home size={9} /> Personal</span>
                        }
                      </p>
                      {session.tags && session.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {session.tags.map((tagId) => {
                            const tag = sessionTags.find((t) => t.id === tagId);
                            if (!tag) return null;
                            return (
                              <span key={tagId} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-600">
                                {tag.name}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {session.messages[0]?.text && (
                        <p className="text-xs text-zinc-400 truncate mt-0.5 italic">{session.messages[0].text}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {editingSessionId === session.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => commitTitle(session.id)}
                            className="p-2.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => setEditingSessionId(null)}
                            className="p-2.5 rounded-lg bg-zinc-100 text-zinc-500 hover:bg-zinc-200 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            if (openMenuSessionId === session.id) {
                              setOpenMenuSessionId(null);
                              setMenuPosition(null);
                            } else {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setMenuPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                              setOpenMenuSessionId(session.id);
                            }
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            openMenuSessionId === session.id
                              ? "bg-zinc-200 text-zinc-700"
                              : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                          }`}
                        >
                          More
                        </button>
                      )}
                      <button
                        onClick={() => setViewingSession(session)}
                        className="flex items-center gap-1.5 bg-indigo-50 rounded-full px-2.5 py-1.5 text-indigo-600 flex-shrink-0"
                      >
                        <ChevronDown size={14} className="rotate-[-90deg]" />
                        <span className="text-xs font-medium">View</span>
                      </button>
                    </div>
                  </div>

                  {/* Inline tag editor for session */}
                  {editingTagsSessionId === session.id && (
                    <div className="px-5 pb-4 pt-2 border-t border-zinc-100">
                      <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Tags</p>
                      <div className="flex flex-wrap gap-1.5">
                        {sessionTags.map((tag) => {
                          const isSelected = session.tags?.includes(tag.id) ?? false;
                          return (
                            <button
                              key={tag.id}
                              onClick={() => {
                                const current = session.tags ?? [];
                                const updated = isSelected
                                  ? current.filter((t) => t !== tag.id)
                                  : [...current, tag.id];
                                setSessionTags(session.id, updated);
                              }}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                                isSelected
                                  ? "bg-indigo-600 text-white"
                                  : "bg-zinc-100 text-zinc-500 hover:bg-indigo-50 hover:text-indigo-600"
                              }`}
                            >
                              {tag.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Convert to lesson strip */}
                  {conversationLessons.some((l) => l.sessionId === session.id) ? (
                    <div className="w-full flex items-center justify-center gap-2 py-2.5 border-t border-indigo-100 bg-indigo-50/50 text-indigo-400 text-xs font-medium">
                      <BookOpen size={13} /> Already a lesson
                    </div>
                  ) : pendingConvertSession?.id === session.id ? (
                    <div className="border-t border-indigo-100 bg-indigo-50/30 p-4 space-y-3">
                      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Choose voice for lesson</p>
                      <div className="flex gap-2">
                        {(["recorded", "transcribed"] as const).map((src) => (
                          <button
                            key={src}
                            onClick={() => setAudioSourceType(src)}
                            className={`flex-1 flex items-center gap-2.5 px-3 py-3 rounded-2xl border-2 transition-all ${
                              audioSourceType === src
                                ? "border-indigo-500 bg-white"
                                : "border-zinc-200 bg-white hover:border-indigo-200"
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${audioSourceType === src ? "bg-indigo-500" : "bg-zinc-100"}`}>
                              <Mic size={15} className={audioSourceType === src ? "text-white" : "text-zinc-400"} />
                            </div>
                            <div className="text-left">
                              <p className={`text-xs font-semibold leading-tight ${audioSourceType === src ? "text-indigo-700" : "text-zinc-700"}`}>
                                {src === "recorded" ? "Recorded" : "Synthesised"}
                              </p>
                              <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                                {src === "recorded" ? "Actual dialect audio" : "Text-to-speech"}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setPendingConvertSession(null)}
                          className="flex-1 py-2.5 rounded-xl border border-zinc-200 text-zinc-500 text-sm font-medium hover:bg-zinc-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => convertToLesson(session, audioSourceType)}
                          className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
                        >
                          Convert
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleMakeLesson(session)}
                      className="w-full flex items-center justify-center gap-2 py-3 border-t border-indigo-100 bg-indigo-50 text-indigo-600 text-sm font-semibold hover:bg-indigo-100 transition-colors active:scale-[0.99]"
                    >
                      <BookOpen size={15} />
                      Convert to Lesson
                    </button>
                  )}

                  {/* Inline preview (first few messages) */}
                  {expandedSessionId === session.id && (
                    <div className="border-t border-zinc-100 p-3 space-y-2 bg-zinc-50 max-h-48 overflow-y-auto">
                      {session.messages
                        .filter((m) => m.sender !== "bot" || !!m.englishTranslation || !!m.cantoneseText)
                        .slice(0, 4)
                        .map((msg, i) => {
                          const isBot = msg.sender === "bot";
                          const displayText = isBot ? msg.text : (msg.cantoneseText ?? msg.text);
                          const subText = isBot ? msg.englishTranslation : msg.text;
                          return (
                            <div key={i} className={`flex items-end gap-2 ${isBot ? "justify-start" : "justify-end"}`}>
                              {isBot && (
                                <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center text-[9px] font-bold text-purple-600 flex-shrink-0 mb-1">
                                  粵
                                </div>
                              )}
                              <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${isBot ? "rounded-bl-sm bg-white border border-zinc-200" : "rounded-br-sm bg-indigo-500 text-white"}`}>
                                <p className={`text-sm font-semibold leading-snug ${isBot ? "text-zinc-800" : "text-white"}`}>
                                  {displayText}
                                </p>
                                {subText && (
                                  <p className={`text-xs mt-0.5 ${isBot ? "text-indigo-500" : "text-indigo-200"}`}>
                                    {subText}
                                  </p>
                                )}
                              </div>
                              {!isBot && (
                                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-[9px] font-bold text-indigo-600 flex-shrink-0 mb-1">
                                  EN
                                </div>
                              )}
                            </div>
                          );
                        })}
                      {session.messages.filter((m) => m.sender !== "bot" || !!m.englishTranslation || !!m.cantoneseText).length > 4 && (
                        <p className="text-center text-xs text-zinc-400 pt-1">
                          Tap View to see full conversation
                        </p>
                      )}
                    </div>
                  )}

                </div>
              );
            })
          );
          })()
        )}
      </div>

      {/* Save partial phrase sheet */}
      <AnimatePresence>
        {phraseSelectionData && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border-t border-zinc-100 z-[60] pt-8 pb-12 px-6 flex flex-col"
          >
            <div className="text-center mb-5">
              <h3 className="text-xl font-bold text-zinc-800 mb-1">Save as Phrase</h3>
              <p className="text-sm text-zinc-500">Edit to keep just the part you want</p>
            </div>
            <textarea
              value={phraseSelectionText}
              onChange={(e) => setPhraseSelectionText(e.target.value)}
              autoFocus
              rows={3}
              className="w-full px-4 py-3 border-2 border-indigo-200 rounded-xl focus:border-indigo-500 focus:outline-none text-zinc-800 text-base resize-none mb-4"
            />
            <button
              onClick={handleSaveSelectedPhrase}
              disabled={!phraseSelectionText.trim()}
              className="w-full py-3.5 bg-indigo-600 text-white rounded-2xl font-semibold text-base hover:bg-indigo-700 transition-colors disabled:opacity-40 mb-3"
            >
              Save Phrase
            </button>
            <button
              onClick={() => { setPhraseSelectionData(null); setPhraseSelectionText(""); }}
              className="text-zinc-400 font-medium text-sm hover:text-zinc-600 text-center"
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-screen conversation view */}
      <AnimatePresence>
        {viewingSession && (
          <motion.div
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="absolute inset-0 z-50 bg-zinc-50 flex flex-col"
          >
            {/* Header */}
            <div className="bg-white px-4 py-4 border-b border-zinc-200 flex items-center gap-3 shadow-sm">
              <button
                onClick={() => setViewingSession(null)}
                className="p-2 rounded-lg hover:bg-zinc-100 transition-colors"
              >
                <ArrowLeft size={20} className="text-zinc-700" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-zinc-800 text-base truncate">
                  {viewingSession.title ?? "Conversation"}
                </p>
                <p className="text-xs text-zinc-400">
                  {viewingSession.date} · {viewingSession.messages.length} messages
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {viewingSession.messages
                .filter((m) => m.sender !== "bot" || !!m.englishTranslation || !!m.cantoneseText)
                .map((msg, i) => {
                  const isBot = msg.sender === "bot";
                  const displayText = isBot ? msg.text : (msg.cantoneseText ?? msg.text);
                  const subText = isBot ? msg.englishTranslation : msg.text;
                  const audioKey = `view-${viewingSession.id}-${i}`;
                  const isPlaying = playingId === audioKey;
                  const hasAudioForMsg = !!msg.audioDataUrl || (msg.audioDataUrls && msg.audioDataUrls.length > 0);
                  const fallback = isBot ? msg.text : (msg.cantoneseText ?? msg.text);
                  const isBookmarked = phrases.find((p) => p.id === msg.id)?.isBookmarked ?? false;

                  return (
                    <div key={i} className={`flex items-end gap-2 ${isBot ? "justify-start" : "justify-end"}`}>
                      {isBot && (
                        <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-[10px] font-bold text-purple-600 flex-shrink-0 mb-1">
                          粵
                        </div>
                      )}
                      <div
                        className={`relative max-w-[75%] rounded-2xl px-4 py-3 ${isBot ? "rounded-bl-sm bg-white border border-zinc-200" : "rounded-br-sm bg-indigo-500 text-white"}`}
                        onPointerDown={(e) => {
                          const dialectText = isBot ? (msg.text ?? "") : (msg.cantoneseText ?? "");
                          const originalText = isBot ? (msg.englishTranslation ?? "") : (msg.text ?? "");
                          handleBubblePointerDown(e, dialectText, originalText);
                        }}
                        onPointerUp={cancelBubbleLongPress}
                        onPointerMove={handleBubblePointerMove}
                        onPointerLeave={cancelBubbleLongPress}
                        onContextMenu={(e) => e.preventDefault()}
                      >
                        <button
                          onClick={() => handleSessionBookmark(msg)}
                          onPointerDown={(e) => e.stopPropagation()}
                          className={`absolute top-2 right-2 transition-colors ${
                            isBookmarked
                              ? (isBot ? "text-zinc-600" : "text-white")
                              : (isBot ? "text-zinc-300 hover:text-zinc-500" : "text-indigo-300 hover:text-white")
                          }`}
                        >
                          <Bookmark size={14} className={isBookmarked ? "fill-current" : ""} />
                        </button>
                        <p className={`text-sm font-semibold leading-snug pr-6 ${isBot ? "text-zinc-800" : "text-white"}`}>
                          {displayText}
                        </p>
                        {subText && (
                          <p className={`text-xs mt-1 ${isBot ? "text-indigo-500" : "text-indigo-200"}`}>
                            {subText}
                          </p>
                        )}
                        {(hasAudioForMsg || fallback) && (
                          <button
                            onClick={() => playMessage(audioKey, msg.audioDataUrl, msg.audioDataUrls, fallback)}
                            onPointerDown={(e) => e.stopPropagation()}
                            disabled={!!playingId}
                            className={`mt-2 flex items-center gap-1.5 text-[11px] font-medium transition-colors disabled:opacity-40
                              ${isBot ? "text-zinc-400 hover:text-indigo-500" : "text-indigo-200 hover:text-white"}
                            `}
                          >
                            <Volume2 size={12} className={isPlaying ? "animate-pulse" : ""} />
                            {isPlaying ? "Playing…" : hasAudioForMsg ? "Play recording" : "Play TTS"}
                          </button>
                        )}
                      </div>
                      {!isBot && (
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600 flex-shrink-0 mb-1">
                          EN
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fixed dropdown menu for session actions */}
      {openMenuSessionId && menuPosition && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpenMenuSessionId(null); setMenuPosition(null); }} />
          <div
            className="fixed z-50 bg-white rounded-xl shadow-lg border border-zinc-200 py-1.5 w-44"
            style={{ top: menuPosition.top, right: menuPosition.right }}
          >
            <button
              onClick={() => { startEditing(openMenuSessionId, sessions.find((s) => s.id === openMenuSessionId)?.title ?? "Conversation"); setOpenMenuSessionId(null); setMenuPosition(null); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              <Pencil size={14} className="text-zinc-400" />
              Edit Name
            </button>
            <button
              onClick={() => { setEditingTagsSessionId(editingTagsSessionId === openMenuSessionId ? null : openMenuSessionId); setOpenMenuSessionId(null); setMenuPosition(null); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              <TagIcon size={14} className="text-zinc-400" />
              Edit Label
            </button>
            <button
              onClick={() => { toast.info("Notes coming soon!"); setOpenMenuSessionId(null); setMenuPosition(null); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              <StickyNote size={14} className="text-zinc-400" />
              Add Note
            </button>
            <div className="my-1 border-t border-zinc-100" />
            <button
              onClick={() => { handleDeleteClick(openMenuSessionId); setOpenMenuSessionId(null); setMenuPosition(null); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} className="text-red-400" />
              Delete
            </button>
          </div>
        </>
      )}

    </div>
  );
}

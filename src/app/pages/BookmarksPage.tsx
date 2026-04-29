import React, { useState, useRef } from "react";
import { Bookmark, Volume2, Search, History, Play, Pencil, Trash2, Check, X, BookOpen } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { playDataUrl } from "../../hooks/useElevenLabs";
import { speakText } from "../../hooks/useGoogleTTS";
import { toast } from "sonner";
import { extractVocabFromMessages } from "../../utils/vocab";

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "greetings", label: "Greetings", keywords: ["greeting", "hello", "meet", "introduction", "farewell", "welcome"] },
  { id: "food", label: "Food & Dining", keywords: ["food", "eat", "drink", "restaurant", "dining", "hungry", "meal", "order", "cuisine"] },
  { id: "transport", label: "Transport", keywords: ["transport", "mtr", "station", "train", "bus", "taxi", "travel", "ride", "getting around"] },
  { id: "shopping", label: "Shopping", keywords: ["shop", "buy", "price", "cost", "pay", "money", "market", "store", "asking price", "purchase"] },
  { id: "apologies", label: "Apologies", keywords: ["apolog", "sorry", "excuse", "pardon", "forgive"] },
  { id: "thanks", label: "Thanks", keywords: ["thank", "gratitude", "grateful", "appreciat"] },
  { id: "weather", label: "Weather", keywords: ["weather", "rain", "sun", "hot", "cold", "wind", "temperature", "climate"] },
  { id: "directions", label: "Directions", keywords: ["direction", "where", "left", "right", "turn", "street", "road", "lost", "navigate", "location"] },
  { id: "numbers", label: "Numbers & Time", keywords: ["number", "count", "how many", "how much", "time", "date", "quantity", "amount"] },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

function matchCategory(context: string): CategoryId {
  const lower = context.toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.id === "all") continue;
    if ("keywords" in cat && cat.keywords.some((kw) => lower.includes(kw))) return cat.id;
  }
  return "all";
}

export function BookmarksPage() {
  const { phrases, toggleBookmark, sessions, userProfile, renameSession, deleteSession, conversationLessons, saveConversationLesson } = useAppContext();
  const [activeTab, setActiveTab] = useState<"phrases" | "sessions">("phrases");
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>("all");

  const allBookmarked = phrases.filter((p) => p.isBookmarked);
  const bookmarkedPhrases = selectedCategory === "all"
    ? allBookmarked
    : allBookmarked.filter((p) => matchCategory(p.context) === selectedCategory);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

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

  const handleMakeLesson = (session: typeof sessions[number]) => {
    const alreadyExists = conversationLessons.some((l) => l.sessionId === session.id);
    if (alreadyExists) {
      toast.info("This conversation is already a lesson.");
      return;
    }
    const vocab = extractVocabFromMessages(session.messages);
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

  const handleSpeak = async (phraseId: string, text: string) => {
    if (playingId) return;
    setPlayingId(phraseId);
    try {
      await speakText(text, userProfile?.preferredVoiceId);
    } catch {
      toast.error("Audio playback failed. Check your connection.");
    } finally {
      setPlayingId(null);
    }
  };

  const playMessage = async (msgId: string, audioDataUrl?: string, fallbackText?: string) => {
    if (playingId) return;
    setPlayingId(msgId);
    try {
      if (audioDataUrl) {
        await playDataUrl(audioDataUrl);
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
    <div className="flex flex-col h-full bg-zinc-50 pb-20">
      {/* Header */}
      <div className="bg-white px-4 py-4 border-b border-zinc-200 sticky top-0 z-10 shadow-sm">
        <h1 className="text-xl font-bold text-zinc-800 mb-4">Saved Content</h1>
        
        {/* Tabs */}
        <div className="flex bg-zinc-100 rounded-lg p-1 mb-4">
          <button
            onClick={() => { setActiveTab("phrases"); setSelectedCategory("all"); }}
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
            placeholder="Search saved..."
            className="bg-transparent border-none outline-none text-sm w-full placeholder-zinc-400"
          />
        </div>

        {/* Category filter chips — phrases tab only */}
        {activeTab === "phrases" && (
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  selectedCategory === cat.id
                    ? "bg-indigo-600 text-white"
                    : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}
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
                <button 
                  onClick={() => toggleBookmark(phrase.id)}
                  className="absolute top-4 right-4 text-indigo-500 hover:text-indigo-600"
                >
                  <Bookmark size={20} className="fill-indigo-500" />
                </button>
                
                <div className="pr-8">
                  <span className="text-[10px] font-medium text-indigo-500 uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded-full inline-block mb-2">
                    {phrase.context}
                  </span>
                  <p className="text-lg font-medium text-zinc-800 mb-1">{phrase.dialect}</p>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-sm text-zinc-500 italic">{phrase.pronunciation}</p>
                    <button
                      onClick={() => handleSpeak(phrase.id, phrase.dialect)}
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
              </div>
            ))
          )
        ) : (
          sessions.length === 0 ? (
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
            sessions.map((session) => {
              const isExpanded = expandedSessionId === session.id;
              const hasAudio = session.messages.some((m) => m.audioDataUrl);
              return (
                <div key={session.id} className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
                  {/* Session header */}
                  <div className="p-4 flex items-center gap-3">
                    <button
                      onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                      className="flex items-center gap-3 flex-1 text-left min-w-0"
                    >
                      <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0">
                        <Play size={14} className="ml-0.5" />
                      </div>
                      <div className="min-w-0">
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
                              className="text-sm font-semibold text-zinc-800 border-b-2 border-indigo-400 outline-none bg-transparent w-36"
                            />
                          ) : (
                            <p className="font-semibold text-zinc-800 text-sm truncate">
                              {session.title ?? "Conversation"}
                            </p>
                          )}
                          {hasAudio && (
                            <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded-full flex-shrink-0">
                              🔊 Audio saved
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400">{session.date} · {session.messages.length} messages</p>
                      </div>
                    </button>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {editingSessionId === session.id ? (
                        <>
                          <button
                            onClick={() => commitTitle(session.id)}
                            className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => setEditingSessionId(null)}
                            className="p-1.5 rounded-lg bg-zinc-100 text-zinc-500 hover:bg-zinc-200 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleMakeLesson(session)}
                            title={conversationLessons.some((l) => l.sessionId === session.id) ? "Already a lesson" : "Make lesson"}
                            className={`p-1.5 rounded-lg transition-colors ${
                              conversationLessons.some((l) => l.sessionId === session.id)
                                ? "text-indigo-400 bg-indigo-50"
                                : "text-zinc-400 hover:bg-indigo-50 hover:text-indigo-500"
                            }`}
                          >
                            <BookOpen size={14} />
                          </button>
                          <button
                            onClick={() => startEditing(session.id, session.title ?? "Conversation")}
                            className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(session.id)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              confirmDeleteId === session.id
                                ? "bg-red-100 text-red-600 hover:bg-red-200"
                                : "text-zinc-400 hover:bg-zinc-100 hover:text-red-500"
                            }`}
                          >
                            <Trash2 size={14} />
                          </button>
                          {confirmDeleteId === session.id && (
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="p-1.5 rounded-lg bg-zinc-100 text-zinc-500 hover:bg-zinc-200 transition-colors"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </>
                      )}
                      <button
                        onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                        className="text-xs text-indigo-500 font-medium ml-1 px-1"
                      >
                        {isExpanded ? "Close" : "Replay"}
                      </button>
                    </div>
                  </div>

                  {/* Expanded replay */}
                  {isExpanded && (
                    <div className="border-t border-zinc-100 p-3 space-y-2 bg-zinc-50 max-h-[60vh] overflow-y-auto">
                      {session.messages
                        .filter((m) => m.sender !== "bot" || !!m.englishTranslation || !!m.cantoneseText)
                        .map((msg, i) => {
                          const isBot = msg.sender === "bot";
                          const displayText = isBot ? msg.text : (msg.cantoneseText ?? msg.text);
                          const subText = isBot ? msg.englishTranslation : msg.text;
                          const audioKey = `${session.id}-${i}`;
                          const isPlaying = playingId === audioKey;
                          const hasAudioForMsg = !!msg.audioDataUrl;
                          const fallback = isBot ? msg.text : (msg.cantoneseText ?? msg.text);

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
                                {(hasAudioForMsg || fallback) && (
                                  <button
                                    onClick={() => playMessage(audioKey, msg.audioDataUrl, fallback)}
                                    disabled={!!playingId}
                                    className={`mt-1.5 flex items-center gap-1 text-[10px] font-medium transition-colors disabled:opacity-40
                                      ${isBot ? "text-zinc-400 hover:text-indigo-500" : "text-indigo-200 hover:text-white"}
                                    `}
                                  >
                                    <Volume2 size={11} className={isPlaying ? "animate-pulse" : ""} />
                                    {isPlaying ? "Playing…" : hasAudioForMsg ? "Play recording" : "Play TTS"}
                                  </button>
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
                    </div>
                  )}
                </div>
              );
            })
          )
        )}
      </div>
    </div>
  );
}

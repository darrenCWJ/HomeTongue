import React, { useState } from "react";
import { Bookmark, Volume2, Search, Filter, History, Play, ChevronDown } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { speakText, playDataUrl } from "../../hooks/useElevenLabs";
import { toast } from "sonner";

export function BookmarksPage() {
  const { phrases, toggleBookmark, sessions, userProfile } = useAppContext();
  const bookmarkedPhrases = phrases.filter((p) => p.isBookmarked);
  const [activeTab, setActiveTab] = useState<"phrases" | "sessions">("phrases");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

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
            onClick={() => setActiveTab("phrases")}
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

        {/* Search & Filter */}
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-zinc-100 rounded-xl px-3 py-2">
            <Search size={16} className="text-zinc-400" />
            <input 
              type="text" 
              placeholder="Search saved..." 
              className="bg-transparent border-none outline-none text-sm w-full placeholder-zinc-400"
            />
          </div>
          <button className="p-2 bg-zinc-100 rounded-xl text-zinc-600 hover:bg-zinc-200">
            <Filter size={18} />
          </button>
        </div>
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
                  <button
                    onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                    className="w-full p-4 flex items-center justify-between text-left hover:bg-zinc-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0">
                        <Play size={14} className="ml-0.5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-zinc-800 text-sm">Conversation</p>
                          {hasAudio && (
                            <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded-full">
                              🔊 Audio saved
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400">{session.date} · {session.messages.length} messages</p>
                      </div>
                    </div>
                    <span className="text-xs text-indigo-500 font-medium">
                      {isExpanded ? "Close" : "Replay"}
                    </span>
                  </button>

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

import React, { useState, useRef, useEffect } from "react";
import { Mic, Bookmark, Volume2, Save, Keyboard, Send, RotateCcw, RefreshCw, BookOpen, Home, Briefcase, ChevronDown, Languages } from "lucide-react";
import { WORK_JOB_TITLES, DIALECTS, type WorkJobTitle, type PersonaType } from "../../types";
import { useAppContext } from "../context/AppContext";
import type { Phrase, Message } from "../../types";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useAudioRecorder, blobToDataUrl, playDataUrl } from "../../hooks/useElevenLabs";
import { speakText, speakTextAndCapture } from "../../hooks/useGoogleTTS";
import { translate, transcribeCantonese, transcribeEnglish, translateCantoneseToEnglish, curateAndGroupVocab } from "../../services/translationService";
import { getSuggestions } from "../../services/suggestionService";

export function ChatPage() {
  const {
    phrases,
    tone,
    toggleBookmark,
    addPhrase,
    updatePhrase,
    messages,
    addMessage,
    addBotSuggestions,
    updateMessage,
    removeMessage,
    saveSession,
    discardChat,
    userProfile,
    updateUserProfile,
    saveConversationLesson,
    activePersona,
    dialect,
    setDialect,
  } = useAppContext();

  const [isPersonaSheetOpen, setIsPersonaSheetOpen] = useState(false);
  const [isDialectSheetOpen, setIsDialectSheetOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [convertToLesson, setConvertToLesson] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [latestSuggestions, setLatestSuggestions] = useState<Phrase[]>([]);
  const [listeningMode, setListeningMode] = useState<"english" | "cantonese" | null>(null);
  const isListening = listeningMode !== null;
  const [stage, setStage] = useState<"transcribing" | "translating" | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [typedReply, setTypedReply] = useState("");
  const [pendingEnglish, setPendingEnglish] = useState<{
    text: string;
    resultPromise: Promise<{ phrase: Phrase; audioDataUrl: string; play: () => Promise<void> }>;
  } | null>(null);

  const { startRecording, stopRecording } = useAudioRecorder();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  type PrefetchResult = { phrase: Phrase; audioDataUrl: string; play: () => Promise<void> };
  const prefetchCacheRef = useRef<Map<string, Promise<PrefetchResult>>>(new Map());

  type RecordRef = { msgId: string; suggestionMsgId: string | null; mode: "cantonese" | "english"; timestamp: number; fullText: string; audioDataUrls: string[] };
  const lastRecordRef = useRef<RecordRef | null>(null);
  const suggestionGenRef = useRef(0);
  const recordingStartRef = useRef<number | null>(null);

  // Refs so the persona-change effect always calls the latest version without stale closures
  const fetchSuggestionsRef = useRef<(e: string, prev: string | null) => void>(() => {});
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, stage]);

  const isBusy = stage !== null || pendingEnglish !== null;

  // After showing a Cantonese message, fetch suggestions, remove stale ones, and prefetch TTS
  const fetchSuggestions = (englishTranslation: string, prevSuggestionMsgId: string | null = null) => {
    const gen = ++suggestionGenRef.current;
    const suggestionMsgId = `sug-${Date.now()}`;
    if (prevSuggestionMsgId) removeMessage(prevSuggestionMsgId);
    if (lastRecordRef.current) {
      lastRecordRef.current = { ...lastRecordRef.current, suggestionMsgId };
    }
    getSuggestions(englishTranslation, messages, userProfile)
      .then((chips) => {
        if (suggestionGenRef.current !== gen) return; // superseded by a newer fetch
        if (chips.length === 0) return;
        addBotSuggestions("", chips, suggestionMsgId);
        setLatestSuggestions(chips);
        chips.forEach((chip) => {
          const cacheKey = `${chip.original}:${tone}`;
          if (prefetchCacheRef.current.has(cacheKey)) return;
          const promise: Promise<PrefetchResult> = translate({ text: chip.original, preferredTone: tone }).then(
            async (result) => {
              const variant = result[tone];
              const { audioDataUrl, play } = await speakTextAndCapture(variant.text);
              const phrase: Phrase = {
                id: chip.id,
                original: chip.original,
                dialect: variant.text,
                pronunciation: variant.pronunciation,
                isBookmarked: false,
                context: result.context,
              };
              return { phrase, audioDataUrl, play };
            }
          );
          prefetchCacheRef.current.set(cacheKey, promise);
        });
      })
      .catch(() => {});
  };

  // Keep ref current so the effect below always calls the latest closure
  fetchSuggestionsRef.current = fetchSuggestions;

  // Regenerate suggestions when the user switches persona
  useEffect(() => {
    const last = lastRecordRef.current;
    if (!last || last.mode !== "cantonese") return;
    const lastMsg = messagesRef.current.find((m) => m.id === last.msgId);
    if (!lastMsg?.englishTranslation) return;
    fetchSuggestionsRef.current(lastMsg.englishTranslation, last.suggestionMsgId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePersona]);

  const startListeningCantonese = async () => {
    try {
      await startRecording();
      recordingStartRef.current = Date.now();
      setListeningMode("cantonese");
    } catch {
      toast.error("Microphone access denied. Please allow microphone permissions.");
    }
  };

  const startListeningEnglish = async () => {
    try {
      await startRecording();
      recordingStartRef.current = Date.now();
      setListeningMode("english");
    } catch {
      toast.error("Microphone access denied. Please allow microphone permissions.");
    }
  };

  const stopListening = async () => {
    const mode = listeningMode;
    setListeningMode(null);

    const elapsed = recordingStartRef.current ? Date.now() - recordingStartRef.current : 0;
    recordingStartRef.current = null;

    if (elapsed < 1000) {
      stopRecording().catch(() => {});
      toast.error("Recording too short — hold the button for at least 1 second.");
      return;
    }

    setStage("transcribing");
    try {
      const blob = await stopRecording();
      if (mode === "cantonese") {
        const [cantoneseText, audioDataUrl] = await Promise.all([
          transcribeCantonese(blob),
          blobToDataUrl(blob),
        ]);
        if (!cantoneseText) {
          toast.error("No speech detected. Please try again.");
          return;
        }
        setStage("translating");
        const isAppend =
          lastRecordRef.current?.mode === "cantonese" &&
          Date.now() - lastRecordRef.current.timestamp < 60_000;
        if (isAppend) {
          const prev = lastRecordRef.current!;
          const combinedText = `${prev.fullText} ${cantoneseText}`;
          const accumulatedUrls = [...prev.audioDataUrls, audioDataUrl];
          const englishTranslation = await translateCantoneseToEnglish(combinedText);
          updateMessage(prev.msgId, { text: combinedText, englishTranslation, audioDataUrls: accumulatedUrls });
          const prevSuggestionMsgId = prev.suggestionMsgId;
          lastRecordRef.current = { ...prev, fullText: combinedText, timestamp: Date.now(), suggestionMsgId: null, audioDataUrls: accumulatedUrls };
          fetchSuggestions(englishTranslation, prevSuggestionMsgId);
          toast.info("Added to previous message");
        } else {
          const englishTranslation = await translateCantoneseToEnglish(cantoneseText);
          const msgId = Date.now().toString();
          addMessage({ id: msgId, sender: "bot", text: cantoneseText, englishTranslation, audioDataUrls: [audioDataUrl] });
          lastRecordRef.current = { msgId, suggestionMsgId: null, mode: "cantonese", timestamp: Date.now(), fullText: cantoneseText, audioDataUrls: [audioDataUrl] };
          fetchSuggestions(englishTranslation, null);
        }
      } else {
        const englishText = await transcribeEnglish(blob);
        if (!englishText) {
          toast.error("No speech detected. Please try again.");
          return;
        }
        // Kick off translation + TTS immediately while user reviews the transcript
        const resultPromise = translate({ text: englishText, preferredTone: tone }).then(async (result) => {
          const variant = result[tone];
          const { audioDataUrl, play } = await speakTextAndCapture(variant.text);
          const phrase: Phrase = {
            id: Date.now().toString(),
            original: englishText,
            dialect: variant.text,
            pronunciation: variant.pronunciation,
            isBookmarked: false,
            context: result.context,
          };
          return { phrase, audioDataUrl, play };
        });
        setPendingEnglish({ text: englishText, resultPromise });
        // setStage(null) runs in the finally block; user reviews transcript in the overlay
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed: ${msg}`);
    } finally {
      setStage(null);
    }
  };

  const confirmEnglishReply = async () => {
    if (!pendingEnglish) return;
    const { text, resultPromise } = pendingEnglish;
    setPendingEnglish(null);
    lastRecordRef.current = null;
    setStage("translating");
    try {
      const { phrase, audioDataUrl, play } = await resultPromise;
      addPhrase(phrase);
      addMessage({
        id: phrase.id,
        sender: "user",
        text,
        cantoneseText: phrase.dialect,
        pronunciation: phrase.pronunciation,
        audioDataUrl,
      });
      setPlayingId(phrase.id);
      try {
        await play();
      } catch {
        // autoplay may be blocked on this platform; audio is saved for manual replay
      } finally {
        setPlayingId(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Translation failed: ${msg}`);
    } finally {
      setStage(null);
    }
  };

  const cancelEnglishReply = () => {
    setPendingEnglish(null);
  };

  // Reply flow: English speaker selects/types → translate → TTS → show
  // Suggestions are prefetched; cache hit means zero-wait on selection
  const handleReply = async (englishText: string) => {
    lastRecordRef.current = null; // chip/typed reply ends the append window
    setLatestSuggestions([]);
    setStage("translating");
    try {
      const cacheKey = `${englishText}:${tone}`;
      const cached = prefetchCacheRef.current.get(cacheKey);
      let phrase: Phrase;
      let audioDataUrl: string;
      let play: () => Promise<void>;
      if (cached) {
        ({ phrase, audioDataUrl, play } = await cached);
      } else {
        const result = await translate({ text: englishText, preferredTone: tone });
        const variant = result[tone];
        ({ audioDataUrl, play } = await speakTextAndCapture(variant.text));
        phrase = {
          id: Date.now().toString(),
          original: englishText,
          dialect: variant.text,
          pronunciation: variant.pronunciation,
          isBookmarked: false,
          context: result.context,
        };
      }
      addPhrase(phrase);
      addMessage({
        id: phrase.id,
        sender: "user",
        text: englishText,
        cantoneseText: phrase.dialect,
        pronunciation: phrase.pronunciation,
        audioDataUrl,
      });
      setPlayingId(phrase.id);
      try {
        await play();
      } catch {
        // autoplay may be blocked on this platform; audio is saved for manual replay
      } finally {
        setPlayingId(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Reply failed: ${msg}`);
    } finally {
      setStage(null);
    }
  };

  const handleSubmitTyped = async () => {
    const text = typedReply.trim();
    if (!text) return;
    setIsTyping(false);
    setTypedReply("");
    await handleReply(text);
  };

  const replayPhrase = async (id: string, text: string) => {
    if (playingId) return;
    setPlayingId(id);
    try {
      const msg = messages.find((m) => m.id === id);
      const urls = msg?.audioDataUrls ?? (msg?.audioDataUrl ? [msg.audioDataUrl] : []);
      if (urls.length > 0) {
        try {
          for (const url of urls) {
            await playDataUrl(url);
          }
          return;
        } catch {
          // cached audio failed, fall through to fresh TTS
        }
      }
      await speakText(text, userProfile?.preferredVoiceId);
    } catch {
      toast.error("Audio playback failed.");
    } finally {
      setPlayingId(null);
    }
  };

  const openSaveDialog = () => {
    if (messages.length === 0) {
      toast.error("No conversation to save yet.");
      return;
    }
    setSaveTitle("");
    setConvertToLesson(false);
    setIsSaveDialogOpen(true);
  };

  const confirmSave = async () => {
    const title = saveTitle.trim();
    if (!title) return;
    setIsSaving(true);
    const sessionId = Date.now().toString();
    try {
      saveSession(messages, title);
      if (convertToLesson) {
        const groups = await curateAndGroupVocab(messages);
        const total = groups.length;
        groups.forEach((vocab, i) => {
          saveConversationLesson({
            id: `${sessionId}-${i}`,
            sessionId,
            title: total > 1 ? `${title} (${i + 1}/${total})` : title,
            createdAt: new Date().toISOString(),
            vocabulary: vocab,
            examCompleted: false,
            examAttempts: 0,
            persona: "personal",
          });
        });
      }
      setIsSaveDialogOpen(false);
      toast.success(convertToLesson ? "Saved & added to Learn!" : "Session saved!");
    } catch {
      toast.error("Failed to process lesson. Session saved without lesson.");
      setIsSaveDialogOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleNewChat = () => {
    if (messages.length === 0) return;
    prefetchCacheRef.current.clear();
    lastRecordRef.current = null;
    setPendingEnglish(null);
    discardChat(messages);
  };

  const stageLabel = stage === "transcribing" ? "Listening..." : "Translating...";

  return (
    <div className="flex flex-col h-full bg-zinc-50 relative">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 bg-white/80 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-zinc-800">Live Translation</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <button
              onClick={() => setIsPersonaSheetOpen(true)}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-indigo-600 transition-colors"
            >
              {activePersona === "work" ? <Briefcase size={11} /> : <Home size={11} />}
              <span className="capitalize">{activePersona}</span>
              <ChevronDown size={10} />
            </button>
            <span className="text-zinc-300 text-xs">·</span>
            <button
              onClick={() => setIsDialectSheetOpen(true)}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-indigo-600 transition-colors"
            >
              <Languages size={11} />
              <span>{dialect}</span>
              <ChevronDown size={10} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={handleNewChat}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 text-zinc-600 rounded-full text-xs font-medium hover:bg-zinc-200 transition-colors"
            >
              <RefreshCw size={13} />
              New Chat
            </button>
          )}
          <button
            onClick={openSaveDialog}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-xs font-medium hover:bg-indigo-100 transition-colors"
          >
            <Save size={14} />
            Save Conversation
          </button>
        </div>
      </div>

      {/* Empty state */}
      {messages.length === 0 && !stage ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <h2 className="text-xl font-bold text-zinc-800 mb-1">Start Conversation</h2>
          <p className="text-zinc-500 text-sm mb-8 max-w-[300px]">
            Everyone takes a turn. Hold the button for whoever is speaking, or type your reply.
          </p>

          {/* Direction cards */}
          <div className="w-full max-w-sm space-y-3 mb-8">
            <div className="flex items-center gap-4 bg-purple-50 border border-purple-200 rounded-2xl px-4 py-3 text-left">
              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 text-lg font-bold text-purple-700">
                粵
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-800">Dialect speaker talks</p>
                <p className="text-xs text-zinc-500 mt-0.5">Their speech → shown in English for you</p>
              </div>
            </div>
            <div className="flex items-center gap-3 justify-center text-zinc-400 text-xs font-medium">
              ↕ and vice versa
            </div>
            <div className="flex items-center gap-4 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3 text-left">
              <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-sm font-bold text-indigo-700">
                EN
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-800">You speak (non-dialect)</p>
                <p className="text-xs text-zinc-500 mt-0.5">Your speech → translated & spoken in their dialect</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="flex flex-col items-center gap-2">
              <button
                onPointerDown={startListeningCantonese}
                onPointerUp={listeningMode === "cantonese" ? stopListening : undefined}
                onPointerLeave={listeningMode === "cantonese" ? stopListening : undefined}
                onContextMenu={(e) => e.preventDefault()}
                disabled={isListening && listeningMode !== "cantonese"}
                className={`relative flex items-center justify-center w-20 h-20 rounded-full text-white shadow-xl transition-transform active:scale-95 disabled:opacity-50 ${listeningMode === "cantonese" ? "bg-red-500 shadow-red-200 scale-105" : "bg-purple-600 shadow-purple-200"}`}
              >
                {listeningMode === "cantonese" && (
                  <span className="absolute w-full h-full rounded-full bg-red-400 animate-ping opacity-75" />
                )}
                <Mic size={30} className="relative z-10" />
              </button>
              <span className="text-xs font-bold text-purple-600">Dialect</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={() => setIsTyping(true)}
                className="flex items-center justify-center w-14 h-14 rounded-full bg-white border-2 border-zinc-300 text-zinc-500 shadow-lg shadow-zinc-100 transition-transform active:scale-95"
              >
                <Keyboard size={22} />
              </button>
              <span className="text-[10px] font-bold text-zinc-400">Type</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button
                onPointerDown={startListeningEnglish}
                onPointerUp={listeningMode === "english" ? stopListening : undefined}
                onPointerLeave={listeningMode === "english" ? stopListening : undefined}
                onContextMenu={(e) => e.preventDefault()}
                disabled={isListening && listeningMode !== "english"}
                className={`relative flex items-center justify-center w-20 h-20 rounded-full text-white shadow-xl transition-transform active:scale-95 disabled:opacity-50 ${listeningMode === "english" ? "bg-red-500 shadow-red-200 scale-105" : "bg-indigo-600 shadow-indigo-200"}`}
              >
                {listeningMode === "english" && (
                  <span className="absolute w-full h-full rounded-full bg-red-400 animate-ping opacity-75" />
                )}
                <Mic size={30} className="relative z-10" />
              </button>
              <span className="text-xs font-bold text-indigo-600">Non-Dialect</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 pb-52 space-y-3">
          {messages.map((msg) => {
            const isIncomingCantonese = msg.sender === "bot" && !!msg.englishTranslation;
            const isSuggestionRow = msg.sender === "bot" && !msg.englishTranslation && !!msg.suggestions?.length;
            const isOutgoingReply = msg.sender === "user";
            const isPlaying = playingId === msg.id;
            const phraseForBookmark = msg.id ? phrases.find((p) => p.id === msg.id) : undefined;
            const isBookmarked = phraseForBookmark?.isBookmarked ?? false;

            if (isIncomingCantonese) {
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-end gap-2 justify-start"
                >
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 mb-1 text-xs font-bold text-purple-600">
                    粵
                  </div>
                  <div className="max-w-[78%] bg-white rounded-2xl rounded-bl-sm shadow-sm border border-zinc-200 px-4 py-3">
                    <p className="text-lg font-semibold text-zinc-900 leading-snug">{msg.text}</p>
                    <p className="text-xs text-indigo-500 mt-1 font-medium">{msg.englishTranslation}</p>
                    <div className="mt-2 pt-2 border-t border-zinc-100">
                      <button
                        onClick={() => replayPhrase(msg.id, msg.text)}
                        disabled={!!playingId}
                        className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 disabled:opacity-50 transition-colors"
                      >
                        {isPlaying ? <Volume2 size={12} className="animate-pulse" /> : <RotateCcw size={12} />}
                        {isPlaying ? "Playing..." : "Replay"}
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            }

            if (isSuggestionRow) return null;

            if (isOutgoingReply) {
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-end gap-2 justify-end"
                >
                  <div className="max-w-[78%] bg-indigo-600 text-white rounded-2xl rounded-br-sm shadow-sm px-4 py-3">
                    <p className="text-sm font-medium leading-snug">{msg.text}</p>
                    {msg.cantoneseText && (
                      <p className="text-indigo-200 text-base font-semibold mt-1">{msg.cantoneseText}</p>
                    )}
                    {msg.pronunciation && (
                      <p className="text-indigo-300 text-xs font-mono mt-0.5">{msg.pronunciation}</p>
                    )}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-indigo-500">
                      <button
                        onClick={() => msg.cantoneseText && replayPhrase(msg.id, msg.cantoneseText)}
                        disabled={!!playingId}
                        className="flex items-center gap-1 text-xs text-indigo-200 hover:text-white disabled:opacity-50"
                      >
                        {isPlaying ? <Volume2 size={12} className="animate-pulse" /> : <RotateCcw size={12} />}
                        {isPlaying ? "Playing..." : "Replay"}
                      </button>
                      <button
                        onClick={() => toggleBookmark(msg.id)}
                        className="text-indigo-300 hover:text-white transition-colors"
                      >
                        <Bookmark
                          size={14}
                          className={isBookmarked ? "fill-white text-white" : ""}
                        />
                      </button>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mb-1 text-xs font-bold text-indigo-600">
                    EN
                  </div>
                </motion.div>
              );
            }

            // Plain bot message fallback
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start pl-10"
              >
                <div className="max-w-[78%] bg-white border border-zinc-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <p className="text-sm text-zinc-700">{msg.text}</p>
                </div>
              </motion.div>
            );
          })}

          {stage && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start pl-10">
              <div className="bg-white border border-zinc-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-2">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
                <span className="text-xs text-zinc-500">{stageLabel}</span>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} className="h-4" />
        </div>
      )}

      {/* Suggestion strip */}
      <AnimatePresence>
        {latestSuggestions.length > 0 && messages.length > 0 && !isBusy && !isListening && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="absolute bottom-[112px] left-0 right-0 z-20 px-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">Say</span>
              {latestSuggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleReply(s.original)}
                  disabled={isBusy}
                  className="px-3 py-1.5 bg-white border border-indigo-200 rounded-full text-xs font-medium text-zinc-700 shadow-sm hover:border-indigo-400 hover:bg-indigo-50 active:scale-95 transition-all disabled:opacity-50 whitespace-nowrap"
                >
                  {s.original}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom action bar */}
      {messages.length > 0 && !isBusy && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex gap-3 items-end">
          <div className="flex flex-col items-center gap-1">
            <button
              onPointerDown={startListeningCantonese}
              onPointerUp={listeningMode === "cantonese" ? stopListening : undefined}
              onPointerLeave={listeningMode === "cantonese" ? stopListening : undefined}
              onContextMenu={(e) => e.preventDefault()}
              disabled={isListening && listeningMode !== "cantonese"}
              className={`relative flex items-center justify-center w-14 h-14 rounded-full text-white shadow-lg transition-transform active:scale-95 disabled:opacity-50 ${listeningMode === "cantonese" ? "bg-red-500 shadow-red-200 scale-110" : "bg-purple-600 shadow-purple-200"}`}
            >
              {listeningMode === "cantonese" && (
                <span className="absolute w-full h-full rounded-full bg-red-400 animate-ping opacity-75" />
              )}
              <Mic size={22} className="relative z-10" />
            </button>
            <span className="text-[10px] font-bold text-purple-600">Dialect</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => setIsTyping(true)}
              disabled={isListening}
              className="flex items-center justify-center w-14 h-14 rounded-full bg-white border-2 border-zinc-300 text-zinc-500 shadow-lg shadow-zinc-100 transition-transform active:scale-95 disabled:opacity-50"
            >
              <Keyboard size={22} />
            </button>
            <span className="text-[10px] font-bold text-zinc-400">Type</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <button
              onPointerDown={startListeningEnglish}
              onPointerUp={listeningMode === "english" ? stopListening : undefined}
              onPointerLeave={listeningMode === "english" ? stopListening : undefined}
              onContextMenu={(e) => e.preventDefault()}
              disabled={isListening && listeningMode !== "english"}
              className={`relative flex items-center justify-center w-14 h-14 rounded-full text-white shadow-lg transition-transform active:scale-95 disabled:opacity-50 ${listeningMode === "english" ? "bg-red-500 shadow-red-200 scale-110" : "bg-indigo-600 shadow-indigo-200"}`}
            >
              {listeningMode === "english" && (
                <span className="absolute w-full h-full rounded-full bg-red-400 animate-ping opacity-75" />
              )}
              <Mic size={22} className="relative z-10" />
            </button>
            <span className="text-[10px] font-bold text-indigo-600">Non-Dialect</span>
          </div>
        </div>
      )}

      {/* Typing overlay */}
      <AnimatePresence>
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border-t border-zinc-100 z-30 pt-8 pb-12 px-6 flex flex-col items-center"
          >
            <div className="text-center mb-6 w-full">
              <h3 className="text-2xl font-bold text-zinc-800 mb-1">Your reply</h3>
              <p className="text-sm text-zinc-500">Type in English — it will be spoken in their dialect</p>
            </div>
            <div className="relative w-full max-w-md">
              <input
                type="text"
                value={typedReply}
                onChange={(e) => setTypedReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitTyped();
                  }
                }}
                placeholder="e.g. Nice to meet you!"
                autoFocus
                className="w-full px-4 py-3 pr-12 border-2 border-indigo-200 rounded-xl focus:border-indigo-500 focus:outline-none text-zinc-800"
              />
              <button
                onClick={handleSubmitTyped}
                disabled={!typedReply.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                <Send size={18} />
              </button>
            </div>
            <button
              onClick={() => setIsTyping(false)}
              className="mt-8 text-zinc-400 font-medium text-sm hover:text-zinc-600"
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save dialog overlay */}
      <AnimatePresence>
        {isSaveDialogOpen && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border-t border-zinc-100 z-30 pt-8 pb-12 px-6 flex flex-col"
          >
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-zinc-800 mb-1">Save Conversation</h3>
              <p className="text-sm text-zinc-500">Give it a title so you can find it later</p>
            </div>

            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">Title</label>
            <input
              type="text"
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmSave(); }}
              placeholder="e.g. Ordering at a restaurant"
              autoFocus
              className="w-full px-4 py-3 border-2 border-indigo-200 rounded-xl focus:border-indigo-500 focus:outline-none text-zinc-800 mb-5"
            />

            <button
              onClick={() => setConvertToLesson((v) => !v)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 mb-6 transition-all ${
                convertToLesson
                  ? "border-indigo-400 bg-indigo-50"
                  : "border-zinc-200 bg-white hover:border-indigo-200"
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${convertToLesson ? "bg-indigo-500" : "bg-zinc-100"}`}>
                <BookOpen size={18} className={convertToLesson ? "text-white" : "text-zinc-500"} />
              </div>
              <div className="text-left flex-1">
                <p className={`text-sm font-semibold ${convertToLesson ? "text-indigo-700" : "text-zinc-700"}`}>
                  Convert to Lesson
                </p>
                <p className="text-xs text-zinc-400">Practice this conversation in Learn mode</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${convertToLesson ? "bg-indigo-500 border-indigo-500" : "border-zinc-300"}`}>
                {convertToLesson && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </button>

            <button
              onClick={confirmSave}
              disabled={!saveTitle.trim() || isSaving}
              className="w-full py-3.5 bg-indigo-600 text-white rounded-2xl font-semibold text-base hover:bg-indigo-700 transition-colors disabled:opacity-40"
            >
              {isSaving ? "Processing…" : "Save"}
            </button>
            <button
              onClick={() => setIsSaveDialogOpen(false)}
              className="mt-4 text-zinc-400 font-medium text-sm hover:text-zinc-600 text-center"
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Persona switcher sheet */}
      <AnimatePresence>
        {isPersonaSheetOpen && (
          <>
            <motion.div
              key="persona-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/30 z-30"
              onClick={() => setIsPersonaSheetOpen(false)}
            />
            <motion.div
              key="persona-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl z-40 px-6 pt-6 pb-10"
            >
              <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto mb-5" />
              <h3 className="text-lg font-bold text-zinc-800 mb-1">Switch Persona</h3>
              <p className="text-xs text-zinc-500 mb-4">Changes how the AI interprets your tone and suggestions.</p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                {(["personal", "work"] as PersonaType[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => updateUserProfile({ activePersona: p })}
                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                      activePersona === p
                        ? "bg-indigo-50 border-indigo-400 shadow-sm"
                        : "bg-zinc-50 border-zinc-100 hover:border-zinc-200"
                    }`}
                  >
                    {p === "work"
                      ? <Briefcase size={24} className={activePersona === p ? "text-indigo-600" : "text-zinc-400"} />
                      : <Home size={24} className={activePersona === p ? "text-indigo-600" : "text-zinc-400"} />}
                    <span className={`font-semibold text-sm capitalize ${activePersona === p ? "text-indigo-700" : "text-zinc-600"}`}>
                      {p}
                    </span>
                  </button>
                ))}
              </div>

              {activePersona === "work" && (
                <div>
                  <p className="text-xs text-zinc-500 font-medium mb-2">Job title</p>
                  <div className="flex flex-wrap gap-2">
                    {WORK_JOB_TITLES.map((title) => {
                      const current = userProfile?.personaProfiles?.work?.jobTitle;
                      const isSelected = current === title;
                      const handleJobTitle = (t: WorkJobTitle) => {
                        updateUserProfile({
                          personaProfiles: {
                            ...userProfile?.personaProfiles,
                            work: {
                              tone: userProfile?.personaProfiles?.work?.tone ?? "formal",
                              ...userProfile?.personaProfiles?.work,
                              jobTitle: isSelected ? undefined : t,
                            },
                          },
                        });
                      };
                      return (
                        <button
                          key={title}
                          onClick={() => handleJobTitle(title)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                            isSelected
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:border-zinc-300"
                          }`}
                        >
                          {title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Dialect switcher sheet */}
      <AnimatePresence>
        {isDialectSheetOpen && (
          <>
            <motion.div
              key="dialect-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/30 z-30"
              onClick={() => setIsDialectSheetOpen(false)}
            />
            <motion.div
              key="dialect-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl z-40 px-6 pt-6 pb-10"
            >
              <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto mb-5" />
              <h3 className="text-lg font-bold text-zinc-800 mb-1">Select Dialect</h3>
              <p className="text-xs text-zinc-500 mb-4">Choose which dialect to translate into.</p>

              <div className="space-y-2">
                {DIALECTS.map((d) => (
                  <button
                    key={d.value}
                    disabled={!d.available}
                    onClick={() => {
                      if (d.available) {
                        setDialect(d.value);
                        setIsDialectSheetOpen(false);
                      }
                    }}
                    className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl border-2 transition-all ${
                      dialect === d.value && d.available
                        ? "bg-indigo-50 border-indigo-400"
                        : d.available
                        ? "bg-zinc-50 border-zinc-100 hover:border-zinc-200"
                        : "bg-zinc-50 border-zinc-100 opacity-40 cursor-not-allowed"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                      dialect === d.value && d.available
                        ? "bg-indigo-500 text-white"
                        : d.available
                        ? "bg-zinc-200 text-zinc-600"
                        : "bg-zinc-200 text-zinc-400"
                    }`}>
                      {d.character}
                    </div>
                    <div className="flex-1 text-left">
                      <p className={`text-sm font-semibold ${
                        dialect === d.value && d.available ? "text-indigo-700" : d.available ? "text-zinc-700" : "text-zinc-400"
                      }`}>
                        {d.label}
                      </p>
                      {!d.available && (
                        <p className="text-xs text-zinc-400">Coming soon</p>
                      )}
                    </div>
                    {dialect === d.value && d.available && (
                      <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center flex-shrink-0">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* English transcript review overlay */}
      <AnimatePresence>
        {pendingEnglish && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border-t border-zinc-100 z-30 pt-8 pb-12 px-6 flex flex-col items-center"
          >
            <div className="text-center mb-6 w-full">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold mb-3 bg-indigo-100 text-indigo-700">
                Non-Dialect speaker
              </div>
              <h3 className="text-2xl font-bold text-zinc-800 mb-1">Did you say this?</h3>
              <p className="text-sm text-zinc-500">Check your recording, then send in Cantonese</p>
            </div>
            <div className="w-full max-w-md bg-indigo-50 border border-indigo-200 rounded-2xl px-5 py-4 mb-8">
              <p className="text-lg font-semibold text-zinc-900 text-center">{pendingEnglish.text}</p>
            </div>
            <button
              onClick={confirmEnglishReply}
              className="w-full max-w-md py-3.5 bg-indigo-600 text-white rounded-2xl font-semibold text-base hover:bg-indigo-700 transition-colors"
            >
              Send in Cantonese
            </button>
            <button
              onClick={cancelEnglishReply}
              className="mt-4 text-zinc-400 font-medium text-sm hover:text-zinc-600"
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

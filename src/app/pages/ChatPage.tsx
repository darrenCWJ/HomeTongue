import React, { useState, useRef, useEffect } from "react";
import { Mic, Square, Bookmark, Volume2, Keyboard, Send, RotateCcw, Home, Briefcase, ChevronDown, ChevronRight, Languages, Pencil, ThumbsUp, ThumbsDown, Plus, Check } from "lucide-react";
import { DIALECTS, type PersonaType } from "../../types";
import { useAppContext } from "../context/AppContext";
import type { Phrase, Message } from "../../types";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useAudioRecorder, blobToDataUrl, playDataUrl } from "../../hooks/useElevenLabs";
import { speakText, speakTextAndCapture } from "../../hooks/useGoogleTTS";
import { translate, transcribeCantonese, transcribeEnglish, translateCantoneseToEnglish } from "../../services/translationService";
import { getSuggestions } from "../../services/suggestionService";
import { useTour } from "../components/tour/TourProvider";

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
    activePersona,
    dialect,
    setDialect,
    phraseTags,
    sessionTags,
    createTag,
    setPhraseTags,
  } = useAppContext();
  const { isActive: isTourActive, activeTour } = useTour();
  const showDemoBubble = isTourActive && activeTour === "chat" && !messages.some((m) => m.sender === "bot" && !!m.englishTranslation);

  const [isPersonaSheetOpen, setIsPersonaSheetOpen] = useState(false);
  const [isDialectSheetOpen, setIsDialectSheetOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [latestSuggestions, setLatestSuggestions] = useState<Phrase[]>([]);
  const [pendingEditText, setPendingEditText] = useState("");
  const [isEditingPending, setIsEditingPending] = useState(false);
  const [listeningMode, setListeningMode] = useState<"english" | "cantonese" | null>(null);
  const [isTapMode, setIsTapMode] = useState(false);
  const [phraseSelectionMsg, setPhraseSelectionMsg] = useState<Message | null>(null);
  const [phraseSelectionText, setPhraseSelectionText] = useState("");
  const [phraseTagSelection, setPhraseTagSelection] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");
  const [isCreatingPhraseTag, setIsCreatingPhraseTag] = useState(false);
  const [isCreatingSessionTag, setIsCreatingSessionTag] = useState(false);
  const [newSessionTagInput, setNewSessionTagInput] = useState("");
  const [saveSessionTags, setSaveSessionTags] = useState<string[]>([]);
  const isListening = listeningMode !== null;
  const [stage, setStage] = useState<"transcribing" | "translating" | null>(null);
  const [stageIsUserSide, setStageIsUserSide] = useState(false);
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
  const recordingTriggerRef = useRef<"tap" | "hold" | null>(null);
  const recordingModeRef = useRef<"cantonese" | "english" | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const LONG_PRESS_MS = 500;
  const LONG_PRESS_MOVE_THRESHOLD = 8;

  // Refs so the persona-change effect always calls the latest version without stale closures
  const fetchSuggestionsRef = useRef<(e: string, prev: string | null) => void>(() => {});
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, stage]);

  const handleMicPointerDown = async (startFn: () => Promise<void>, mode: "cantonese" | "english") => {
    if (isListening || recordingModeRef.current) {
      stopListening();
      return;
    }
    recordingStartRef.current = Date.now();
    recordingModeRef.current = mode;
    await startFn();
  };

  const handleMicPointerUp = (mode: "cantonese" | "english") => {
    if (recordingModeRef.current !== mode) return;
    const elapsed = recordingStartRef.current ? Date.now() - recordingStartRef.current : 999;
    if (elapsed < 1000) {
      recordingTriggerRef.current = "tap";
      setIsTapMode(true);
    } else {
      recordingTriggerRef.current = null;
      stopListening();
    }
  };

  const handleMicPointerLeave = (mode: "cantonese" | "english") => {
    if (recordingModeRef.current !== mode || recordingTriggerRef.current === "tap") return;
    stopListening();
  };

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
              const { audioDataUrl, play } = await speakTextAndCapture(variant.text, userProfile?.preferredVoiceId);
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
      setListeningMode("cantonese");
    } catch {
      recordingStartRef.current = null;
      toast.error("Microphone access denied. Please allow microphone permissions.");
    }
  };

  const startListeningEnglish = async () => {
    try {
      setLatestSuggestions([]);
      await startRecording();
      setListeningMode("english");
    } catch {
      recordingStartRef.current = null;
      toast.error("Microphone access denied. Please allow microphone permissions.");
    }
  };

  const stopListening = async () => {
    const mode = listeningMode || recordingModeRef.current;
    recordingTriggerRef.current = null;
    recordingModeRef.current = null;
    setIsTapMode(false);
    setListeningMode(null);

    if (!mode) {
      stopRecording().catch(() => {});
      recordingStartRef.current = null;
      return;
    }

    const elapsed = recordingStartRef.current ? Date.now() - recordingStartRef.current : 0;
    recordingStartRef.current = null;

    if (elapsed < 1000) {
      stopRecording().catch(() => {});
      toast.error("Recording too short — please record for at least 1 second.");
      return;
    }

    setStageIsUserSide(mode === "english");
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
          const existingPhrase = phrases.find((p) => p.id === prev.msgId);
          updatePhrase({ id: prev.msgId, original: englishTranslation, dialect: combinedText, pronunciation: "", isBookmarked: existingPhrase?.isBookmarked ?? false, context: existingPhrase?.context ?? "", audioDataUrl: accumulatedUrls[0], audioDataUrls: accumulatedUrls });
          const prevSuggestionMsgId = prev.suggestionMsgId;
          lastRecordRef.current = { ...prev, fullText: combinedText, timestamp: Date.now(), suggestionMsgId: null, audioDataUrls: accumulatedUrls };
          fetchSuggestions(englishTranslation, prevSuggestionMsgId);
          toast.info("Added to previous message");
        } else {
          const englishTranslation = await translateCantoneseToEnglish(cantoneseText);
          const msgId = Date.now().toString();
          addPhrase({ id: msgId, original: englishTranslation, dialect: cantoneseText, pronunciation: "", isBookmarked: false, context: "", audioDataUrl, audioDataUrls: [audioDataUrl] });
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
          const { audioDataUrl, play } = await speakTextAndCapture(variant.text, userProfile?.preferredVoiceId);
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
        setPendingEditText(englishText);
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
    const { text: originalText, resultPromise } = pendingEnglish;
    const finalText = pendingEditText.trim() || originalText;
    setPendingEnglish(null);
    setIsEditingPending(false);
    lastRecordRef.current = null;
    setStageIsUserSide(true);
    setStage("translating");
    try {
      let phrase: Phrase;
      let audioDataUrl: string;
      let play: () => Promise<void>;
      if (finalText !== originalText) {
        const result = await translate({ text: finalText, preferredTone: tone });
        const variant = result[tone];
        ({ audioDataUrl, play } = await speakTextAndCapture(variant.text, userProfile?.preferredVoiceId));
        phrase = { id: Date.now().toString(), original: finalText, dialect: variant.text, pronunciation: variant.pronunciation, isBookmarked: false, context: result.context };
      } else {
        ({ phrase, audioDataUrl, play } = await resultPromise);
      }
      addPhrase(phrase);
      addMessage({
        id: phrase.id,
        sender: "user",
        text: finalText,
        cantoneseText: phrase.dialect,
        pronunciation: phrase.pronunciation,
        audioDataUrl,
      });
      setStage(null);
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
    setPendingEditText("");
    setIsEditingPending(false);
  };

  const handleBubblePointerDown = (e: React.PointerEvent, msg: Message) => {
    longPressStartPosRef.current = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = setTimeout(() => {
      const preText = msg.sender === "bot" ? msg.text : (msg.cantoneseText ?? "");
      if (!preText) return;
      setPhraseSelectionMsg(msg);
      setPhraseSelectionText(preText);
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

  const handleSaveSelectedPhrase = async () => {
    if (!phraseSelectionMsg || !phraseSelectionText.trim()) return;
    const msg = phraseSelectionMsg;
    const dialectText = phraseSelectionText.trim();
    const original = msg.sender === "bot" ? (msg.englishTranslation ?? "") : (msg.text ?? "");
    const originalDialect = msg.sender === "bot" ? msg.text : (msg.cantoneseText ?? "");
    const wasEdited = dialectText !== originalDialect.trim();
    const phraseId = Date.now().toString();

    try {
      if (!wasEdited) {
        const urls = msg.audioDataUrls ?? (msg.audioDataUrl ? [msg.audioDataUrl] : []);
        addPhrase({ id: phraseId, original, dialect: dialectText, pronunciation: "", isBookmarked: true, context: "", audioDataUrl: urls[0], audioDataUrls: urls.length > 1 ? urls : undefined, tags: phraseTagSelection });
        for (const url of urls) {
          try { await playDataUrl(url); } catch { /* skip failed clip */ }
        }
      } else {
        const { audioDataUrl, play } = await speakTextAndCapture(dialectText, userProfile?.preferredVoiceId);
        addPhrase({ id: phraseId, original, dialect: dialectText, pronunciation: "", isBookmarked: true, context: "", audioDataUrl, tags: phraseTagSelection });
        await play();
      }
      toast.success("Phrase saved!");
    } catch {
      toast.error("Failed to save phrase.");
    }

    setPhraseSelectionMsg(null);
    setPhraseSelectionText("");
    setPhraseTagSelection([]);
  };

  // Reply flow: English speaker selects/types → translate → TTS → show
  // Suggestions are prefetched; cache hit means zero-wait on selection
  const handleReply = async (englishText: string) => {
    lastRecordRef.current = null; // chip/typed reply ends the append window
    setLatestSuggestions([]);
    setStageIsUserSide(true);
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
        ({ audioDataUrl, play } = await speakTextAndCapture(variant.text, userProfile?.preferredVoiceId));
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
      setStage(null);
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
    setSaveSessionTags([]);
    setIsSaveDialogOpen(true);
  };

  const confirmSave = async () => {
    const title = saveTitle.trim();
    if (!title) return;
    setIsSaving(true);
    try {
      saveSession(messages, title, saveSessionTags.length > 0 ? saveSessionTags : undefined);
      setIsSaveDialogOpen(false);
      toast.success("Session saved!");
    } catch {
      toast.error("Failed to save session.");
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
              data-tour="chat-persona-selector"
              onClick={() => setIsPersonaSheetOpen(true)}
              disabled={messages.length > 0}
              className={`flex items-center gap-1 text-xs transition-colors ${messages.length > 0 ? "text-zinc-300 cursor-not-allowed" : "text-zinc-500 hover:text-brand-blue"}`}
            >
              {activePersona === "work" ? <Briefcase size={11} /> : <Home size={11} />}
              <span className="capitalize">{activePersona}</span>
              <ChevronDown size={10} />
            </button>
            <span className="text-zinc-300 text-xs">·</span>
            <button
              data-tour="chat-dialect-selector"
              onClick={() => setIsDialectSheetOpen(true)}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-brand-blue transition-colors"
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
              New Chat
            </button>
          )}
          <button
            data-tour="chat-save-conversation"
            onClick={openSaveDialog}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue/10 text-brand-blue rounded-full text-xs font-medium hover:bg-brand-blue/15 transition-colors"
          >
            Save Conversation
          </button>
        </div>
      </div>

      {/* Empty state */}
      {messages.length === 0 && !stage && !showDemoBubble ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-zinc-400 text-sm text-center">
            Tap the mic button or type your message for translation
          </p>
        </div>
      ) : showDemoBubble ? (
        <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-3 scrollbar-none">
          <div className="flex items-end gap-2 justify-start">
            <div className="w-8 h-8 rounded-full bg-brand-red/15 flex items-center justify-center flex-shrink-0 mb-1 text-xs font-bold text-brand-red">
              粵
            </div>
            <div className="flex flex-col max-w-[78%]">
              <div
                data-tour="chat-message-bubble"
                className="relative bg-white rounded-2xl rounded-bl-sm shadow-sm border border-zinc-200 px-4 py-3"
              >
                <button
                  data-tour="chat-bookmark-button"
                  className="absolute top-2 right-2 text-zinc-300 hover:text-zinc-500 transition-colors"
                >
                  <Bookmark size={14} />
                </button>
                <p className="text-lg font-semibold text-zinc-900 leading-snug pr-5">你好，好高興認識你！</p>
                <p className="text-xs text-brand-blue mt-1 font-medium">Hello, nice to meet you!</p>
                <div className="mt-2 pt-2 border-t border-zinc-100">
                  <button
                    data-tour="chat-replay-button"
                    className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
                  >
                    <RotateCcw size={12} />
                    Replay
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-3 scrollbar-none">
          {messages.map((msg, msgIndex) => {
            const isIncomingCantonese = msg.sender === "bot" && !!msg.englishTranslation;
            const isFirstBotMsg = isIncomingCantonese && msgIndex === messages.findIndex((m) => m.sender === "bot" && !!m.englishTranslation);
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
                  <div className="w-8 h-8 rounded-full bg-brand-red/15 flex items-center justify-center flex-shrink-0 mb-1 text-xs font-bold text-brand-red">
                    粵
                  </div>
                  <div className="flex flex-col max-w-[78%]">
                    <div
                      {...(isFirstBotMsg ? { "data-tour": "chat-message-bubble" } : {})}
                      className="relative bg-white rounded-2xl rounded-bl-sm shadow-sm border border-zinc-200 px-4 py-3"
                      onPointerDown={(e) => handleBubblePointerDown(e, msg)}
                      onPointerUp={cancelBubbleLongPress}
                      onPointerMove={handleBubblePointerMove}
                      onPointerLeave={cancelBubbleLongPress}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <button
                        {...(isFirstBotMsg ? { "data-tour": "chat-bookmark-button" } : {})}
                        onClick={() => toggleBookmark(msg.id)}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="absolute top-2 right-2 text-zinc-300 hover:text-zinc-500 transition-colors"
                      >
                        <Bookmark size={14} className={isBookmarked ? "fill-zinc-600 text-zinc-600" : ""} />
                      </button>
                      <p className="text-lg font-semibold text-zinc-900 leading-snug pr-5">{msg.text}</p>
                      <p className="text-xs text-brand-blue mt-1 font-medium">{msg.englishTranslation}</p>
                      <div className="mt-2 pt-2 border-t border-zinc-100">
                        <button
                          {...(isFirstBotMsg ? { "data-tour": "chat-replay-button" } : {})}
                          onClick={() => replayPhrase(msg.id, msg.text)}
                          onPointerDown={(e) => e.stopPropagation()}
                          disabled={!!playingId}
                          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 disabled:opacity-50 transition-colors"
                        >
                          {isPlaying ? <Volume2 size={12} className="animate-pulse" /> : <RotateCcw size={12} />}
                          {isPlaying ? "Playing..." : "Replay"}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-1 ml-1">
                      <button
                        onClick={() => updateMessage(msg.id, { rating: msg.rating === "up" ? undefined : "up" })}
                        className={`p-1 rounded transition-colors ${msg.rating === "up" ? "text-green-600 bg-green-50" : "text-zinc-300 hover:text-green-500"}`}
                      >
                        <ThumbsUp size={12} className={msg.rating === "up" ? "fill-green-600" : ""} />
                      </button>
                      <button
                        onClick={() => updateMessage(msg.id, { rating: msg.rating === "down" ? undefined : "down" })}
                        className={`p-1 rounded transition-colors ${msg.rating === "down" ? "text-red-500 bg-red-50" : "text-zinc-300 hover:text-red-400"}`}
                      >
                        <ThumbsDown size={12} className={msg.rating === "down" ? "fill-red-500" : ""} />
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
                  <div className="flex flex-col items-end max-w-[78%]">
                    <div
                      className="relative bg-brand-blue text-white rounded-2xl rounded-br-sm shadow-sm px-4 py-3"
                      onPointerDown={(e) => handleBubblePointerDown(e, msg)}
                      onPointerUp={cancelBubbleLongPress}
                      onPointerMove={handleBubblePointerMove}
                      onPointerLeave={cancelBubbleLongPress}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <button
                        onClick={() => toggleBookmark(msg.id)}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="absolute top-2 right-2 text-white/40 hover:text-white transition-colors"
                      >
                        <Bookmark size={14} className={isBookmarked ? "fill-white text-white" : ""} />
                      </button>
                      <p className="text-sm font-medium leading-snug pr-5">{msg.text}</p>
                      {msg.cantoneseText && (
                        <p className="text-white/80 text-base font-semibold mt-1">{msg.cantoneseText}</p>
                      )}
                      {msg.pronunciation && (
                        <p className="text-white/50 text-xs font-mono mt-0.5">{msg.pronunciation}</p>
                      )}
                      <div className="mt-2 pt-2 border-t border-white/20">
                        <button
                          onClick={() => msg.cantoneseText && replayPhrase(msg.id, msg.cantoneseText)}
                          onPointerDown={(e) => e.stopPropagation()}
                          disabled={!!playingId}
                          className="flex items-center gap-1 text-xs text-white/60 hover:text-white disabled:opacity-50"
                        >
                          {isPlaying ? <Volume2 size={12} className="animate-pulse" /> : <RotateCcw size={12} />}
                          {isPlaying ? "Playing..." : "Replay"}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-1 mr-1">
                      <button
                        onClick={() => updateMessage(msg.id, { rating: msg.rating === "up" ? undefined : "up" })}
                        className={`p-1 rounded transition-colors ${msg.rating === "up" ? "text-green-600 bg-green-50" : "text-zinc-300 hover:text-green-500"}`}
                      >
                        <ThumbsUp size={12} className={msg.rating === "up" ? "fill-green-600" : ""} />
                      </button>
                      <button
                        onClick={() => updateMessage(msg.id, { rating: msg.rating === "down" ? undefined : "down" })}
                        className={`p-1 rounded transition-colors ${msg.rating === "down" ? "text-red-500 bg-red-50" : "text-zinc-300 hover:text-red-400"}`}
                      >
                        <ThumbsDown size={12} className={msg.rating === "down" ? "fill-red-500" : ""} />
                      </button>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-brand-blue/15 flex items-center justify-center flex-shrink-0 mb-1 text-xs font-bold text-brand-blue">
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
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`flex items-start ${stageIsUserSide ? "justify-end pr-10" : "pl-10"}`}
            >
              <div className={`rounded-2xl px-4 py-3 shadow-sm flex items-center gap-2 ${
                stageIsUserSide
                  ? "bg-brand-blue rounded-br-sm"
                  : "bg-white border border-zinc-200 rounded-tl-sm"
              }`}>
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className={`w-2 h-2 rounded-full animate-bounce ${stageIsUserSide ? "bg-white/60" : "bg-brand-blue/60"}`}
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
                <span className={`text-xs ${stageIsUserSide ? "text-white/80" : "text-zinc-500"}`}>{stageLabel}</span>
              </div>
            </motion.div>
          )}

          <AnimatePresence>
            {userProfile?.suggestedRepliesEnabled !== false && latestSuggestions.length > 0 && !isBusy && !isListening && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="flex flex-col gap-2 pt-1 w-full"
              >
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">Suggested replies</span>
                {latestSuggestions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleReply(s.original)}
                    disabled={isBusy}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-brand-blue/10 border border-brand-blue/15 rounded-2xl text-sm font-medium text-zinc-700 hover:bg-brand-blue/15 hover:border-brand-blue/20 active:scale-[0.99] transition-all disabled:opacity-50 text-left"
                  >
                    <span>{s.original}</span>
                    <ChevronRight size={16} className="text-brand-blue/60 flex-shrink-0" />
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} className="h-4" />
        </div>
      )}

      {/* Button area background mask — covers scroll content behind buttons */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-zinc-50 z-20 pointer-events-none" />

      {/* Bottom action bar */}
      {!isBusy && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex gap-3 items-center select-none">
          <button
            data-tour="chat-dialect-mic"
            onPointerDown={() => handleMicPointerDown(startListeningCantonese, "cantonese")}
            onPointerUp={() => handleMicPointerUp("cantonese")}
            onPointerLeave={() => handleMicPointerLeave("cantonese")}
            onContextMenu={(e) => e.preventDefault()}
            disabled={isListening && listeningMode !== "cantonese"}
            className={`relative flex items-center justify-center gap-2 w-[7.5rem] py-3 rounded-full text-white shadow-lg transition-transform active:scale-95 disabled:opacity-50 select-none ${listeningMode === "cantonese" ? "bg-brand-red shadow-brand-red/30 scale-105" : "bg-brand-red shadow-brand-red/20"}`}
          >
            {listeningMode === "cantonese" && (
              <span className="absolute inset-0 rounded-full bg-brand-red/60 animate-ping opacity-75" />
            )}
            {listeningMode === "cantonese" && isTapMode
              ? <Square size={16} fill="currentColor" className="relative z-10" />
              : <Mic size={18} className="relative z-10" />}
            <span className="relative z-10 text-sm font-bold">Dialect</span>
          </button>

          <button
            data-tour="chat-type-button"
            onClick={() => setIsTyping(true)}
            disabled={isListening}
            className="flex items-center gap-2 px-5 py-3 rounded-full bg-white border-2 border-zinc-300 text-zinc-600 shadow-lg shadow-zinc-100 transition-transform active:scale-95 disabled:opacity-50 select-none"
          >
            <Keyboard size={18} />
            <span className="text-sm font-bold">Type</span>
          </button>

          <button
            data-tour="chat-english-mic"
            onPointerDown={() => handleMicPointerDown(startListeningEnglish, "english")}
            onPointerUp={() => handleMicPointerUp("english")}
            onPointerLeave={() => handleMicPointerLeave("english")}
            onContextMenu={(e) => e.preventDefault()}
            disabled={isListening && listeningMode !== "english"}
            className={`relative flex items-center justify-center gap-2 w-[7.5rem] py-3 rounded-full text-white shadow-lg transition-transform active:scale-95 disabled:opacity-50 select-none ${listeningMode === "english" ? "bg-brand-red shadow-brand-red/20 scale-105" : "bg-brand-blue shadow-brand-blue/20"}`}
          >
            {listeningMode === "english" && (
              <span className="absolute inset-0 rounded-full bg-brand-red/60 animate-ping opacity-75" />
            )}
            {listeningMode === "english" && isTapMode
              ? <Square size={16} fill="currentColor" className="relative z-10" />
              : <Mic size={18} className="relative z-10" />}
            <span className="relative z-10 text-sm font-bold">Non-Dialect</span>
          </button>
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
                className="w-full px-4 py-3 pr-12 border-2 border-brand-blue/20 rounded-xl focus:border-brand-blue focus:outline-none text-zinc-800"
              />
              <button
                onClick={handleSubmitTyped}
                disabled={!typedReply.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-brand-blue text-white rounded-lg hover:bg-brand-blue/90 transition-colors disabled:opacity-50"
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
              className="w-full px-4 py-3 border-2 border-brand-blue/20 rounded-xl focus:border-brand-blue focus:outline-none text-zinc-800 mb-4"
            />

            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Tags</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {sessionTags.map((tag) => {
                const isSelected = saveSessionTags.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => setSaveSessionTags((prev) => isSelected ? prev.filter((t) => t !== tag.id) : [...prev, tag.id])}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                      isSelected
                        ? "bg-brand-blue text-white border-brand-blue"
                        : "bg-white text-zinc-600 border-zinc-200 hover:border-brand-blue/20"
                    }`}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 mb-5">
              {isCreatingSessionTag ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newSessionTagInput}
                    onChange={(e) => setNewSessionTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newSessionTagInput.trim()) {
                        const tag = createTag(newSessionTagInput.trim(), "session");
                        setSaveSessionTags((prev) => [...prev, tag.id]);
                        setNewSessionTagInput("");
                        setIsCreatingSessionTag(false);
                      }
                      if (e.key === "Escape") { setIsCreatingSessionTag(false); setNewSessionTagInput(""); }
                    }}
                    placeholder="Tag name"
                    autoFocus
                    className="px-3 py-1.5 rounded-full text-xs border-2 border-brand-blue/50 focus:border-brand-blue focus:outline-none w-24"
                  />
                  <button
                    onClick={() => {
                      if (newSessionTagInput.trim()) {
                        const tag = createTag(newSessionTagInput.trim(), "session");
                        setSaveSessionTags((prev) => [...prev, tag.id]);
                        setNewSessionTagInput("");
                        setIsCreatingSessionTag(false);
                      }
                    }}
                    className="p-1.5 rounded-full bg-brand-blue text-white"
                  >
                    <Check size={12} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsCreatingSessionTag(true)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-zinc-300 text-zinc-400 hover:border-brand-blue/50 hover:text-brand-blue transition-all flex items-center gap-1"
                >
                  <Plus size={12} />
                  New
                </button>
              )}
            </div>

            <button
              onClick={confirmSave}
              disabled={!saveTitle.trim() || isSaving}
              className="w-full py-3.5 bg-brand-blue text-white rounded-2xl font-semibold text-base hover:bg-brand-blue/90 transition-colors disabled:opacity-40"
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
                        ? "bg-brand-blue/10 border-brand-blue shadow-sm"
                        : "bg-zinc-50 border-zinc-100 hover:border-zinc-200"
                    }`}
                  >
                    {p === "work"
                      ? <Briefcase size={24} className={activePersona === p ? "text-brand-blue" : "text-zinc-400"} />
                      : <Home size={24} className={activePersona === p ? "text-brand-blue" : "text-zinc-400"} />}
                    <span className={`font-semibold text-sm capitalize ${activePersona === p ? "text-brand-blue" : "text-zinc-600"}`}>
                      {p}
                    </span>
                  </button>
                ))}
              </div>

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
                        ? "bg-brand-blue/10 border-brand-blue"
                        : d.available
                        ? "bg-zinc-50 border-zinc-100 hover:border-zinc-200"
                        : "bg-zinc-50 border-zinc-100 opacity-40 cursor-not-allowed"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                      dialect === d.value && d.available
                        ? "bg-brand-blue/100 text-white"
                        : d.available
                        ? "bg-zinc-200 text-zinc-600"
                        : "bg-zinc-200 text-zinc-400"
                    }`}>
                      {d.character}
                    </div>
                    <div className="flex-1 text-left">
                      <p className={`text-sm font-semibold ${
                        dialect === d.value && d.available ? "text-brand-blue" : d.available ? "text-zinc-700" : "text-zinc-400"
                      }`}>
                        {d.label}
                      </p>
                      {!d.available && (
                        <p className="text-xs text-zinc-400">Coming soon</p>
                      )}
                    </div>
                    {dialect === d.value && d.available && (
                      <div className="w-5 h-5 rounded-full bg-brand-blue/100 flex items-center justify-center flex-shrink-0">
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

      {/* Save partial phrase sheet */}
      <AnimatePresence>
        {phraseSelectionMsg && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border-t border-zinc-100 z-30 pt-8 pb-12 px-6 flex flex-col"
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
              className="w-full px-4 py-3 border-2 border-brand-blue/20 rounded-xl focus:border-brand-blue focus:outline-none text-zinc-800 text-base resize-none mb-4"
            />
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Tags</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {phraseTags.map((tag) => {
                const isSelected = phraseTagSelection.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => setPhraseTagSelection((prev) => isSelected ? prev.filter((t) => t !== tag.id) : [...prev, tag.id])}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                      isSelected
                        ? "bg-brand-blue text-white border-brand-blue"
                        : "bg-white text-zinc-600 border-zinc-200 hover:border-brand-blue/20"
                    }`}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 mb-5">
              {isCreatingPhraseTag ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newTagInput.trim()) {
                        const tag = createTag(newTagInput.trim(), "phrase");
                        setPhraseTagSelection((prev) => [...prev, tag.id]);
                        setNewTagInput("");
                        setIsCreatingPhraseTag(false);
                      }
                      if (e.key === "Escape") { setIsCreatingPhraseTag(false); setNewTagInput(""); }
                    }}
                    placeholder="Tag name"
                    autoFocus
                    className="px-3 py-1.5 rounded-full text-xs border-2 border-brand-blue/50 focus:border-brand-blue focus:outline-none w-24"
                  />
                  <button
                    onClick={() => {
                      if (newTagInput.trim()) {
                        const tag = createTag(newTagInput.trim(), "phrase");
                        setPhraseTagSelection((prev) => [...prev, tag.id]);
                        setNewTagInput("");
                        setIsCreatingPhraseTag(false);
                      }
                    }}
                    className="p-1.5 rounded-full bg-brand-blue text-white"
                  >
                    <Check size={12} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsCreatingPhraseTag(true)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-zinc-300 text-zinc-400 hover:border-brand-blue/50 hover:text-brand-blue transition-all flex items-center gap-1"
                >
                  <Plus size={12} />
                  New
                </button>
              )}
            </div>
            <button
              onClick={handleSaveSelectedPhrase}
              disabled={!phraseSelectionText.trim()}
              className="w-full py-3.5 bg-brand-blue text-white rounded-2xl font-semibold text-base hover:bg-brand-blue/90 transition-colors disabled:opacity-40 mb-3"
            >
              Save Phrase
            </button>
            <button
              onClick={() => { setPhraseSelectionMsg(null); setPhraseSelectionText(""); setPhraseTagSelection([]); setNewTagInput(""); setIsCreatingPhraseTag(false); }}
              className="text-zinc-400 font-medium text-sm hover:text-zinc-600 text-center"
            >
              Cancel
            </button>
          </motion.div>
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
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold mb-3 bg-brand-blue/15 text-brand-blue">
                Non-Dialect speaker
              </div>
              <h3 className="text-2xl font-bold text-zinc-800 mb-1">Did you say this?</h3>
              <p className="text-sm text-zinc-500">Check your recording, then send in Cantonese</p>
            </div>
            <div className="w-full max-w-md mb-8">
              {isEditingPending ? (
                <input
                  type="text"
                  value={pendingEditText}
                  onChange={(e) => setPendingEditText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); confirmEnglishReply(); } }}
                  autoFocus
                  className="w-full bg-brand-blue/10 border-2 border-brand-blue rounded-2xl px-5 py-4 text-lg font-semibold text-zinc-900 text-center focus:outline-none"
                />
              ) : (
                <div className="flex items-center gap-3 bg-brand-blue/10 border border-brand-blue/20 rounded-2xl px-5 py-4">
                  <p className="flex-1 text-lg font-semibold text-zinc-900 text-center">{pendingEditText}</p>
                  <button
                    onClick={() => setIsEditingPending(true)}
                    className="flex-shrink-0 p-1.5 rounded-lg text-brand-blue/60 hover:text-brand-blue hover:bg-brand-blue/15 transition-colors"
                  >
                    <Pencil size={16} />
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={confirmEnglishReply}
              className="w-full max-w-md py-3.5 bg-brand-blue text-white rounded-2xl font-semibold text-base hover:bg-brand-blue/90 transition-colors"
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

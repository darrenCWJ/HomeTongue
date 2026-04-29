import React, { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Bookmark, Volume2, Save, Keyboard, Send, RotateCcw, RefreshCw, BookOpen } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import type { Phrase, VocabItem, Message } from "../../types";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useAudioRecorder, blobToDataUrl, playDataUrl } from "../../hooks/useElevenLabs";
import { speakText, speakTextAndCapture } from "../../hooks/useGoogleTTS";
import { translate, transcribeCantonese, transcribeEnglish, translateCantoneseToEnglish } from "../../services/translationService";
import { getSuggestions } from "../../services/suggestionService";

const PUNCT_RE = /[。！？，、；：…!?,;:]/g;
const hasTwoChinese = (s: string) => (s.match(/[一-鿿㐀-䶿]/g) ?? []).length >= 2;

function extractVocabFromMessages(msgs: Message[]): VocabItem[] {
  const items: VocabItem[] = [];
  for (const msg of msgs) {
    if (msg.sender === "bot" && msg.text && msg.englishTranslation) {
      msg.text.split(PUNCT_RE).filter(hasTwoChinese).forEach((s) =>
        items.push({ english: msg.englishTranslation!, cantonese: s.trim(), pronunciation: "" })
      );
    }
    if (msg.sender === "user" && msg.cantoneseText) {
      msg.cantoneseText.split(PUNCT_RE).filter(hasTwoChinese).forEach((s) =>
        items.push({ english: msg.text, cantonese: s.trim(), pronunciation: msg.pronunciation ?? "" })
      );
    }
  }
  return items;
}

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
    saveConversationLesson,
    activePersona,
  } = useAppContext();

  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [convertToLesson, setConvertToLesson] = useState(false);

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

  type RecordRef = { msgId: string; suggestionMsgId: string | null; mode: "cantonese" | "english"; timestamp: number; fullText: string };
  const lastRecordRef = useRef<RecordRef | null>(null);
  const suggestionGenRef = useRef(0);

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

  const startListeningCantonese = async () => {
    try {
      await startRecording();
      setListeningMode("cantonese");
    } catch {
      toast.error("Microphone access denied. Please allow microphone permissions.");
    }
  };

  const startListeningEnglish = async () => {
    try {
      await startRecording();
      setListeningMode("english");
    } catch {
      toast.error("Microphone access denied. Please allow microphone permissions.");
    }
  };

  const stopListening = async () => {
    const mode = listeningMode;
    setListeningMode(null);
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
          const englishTranslation = await translateCantoneseToEnglish(combinedText);
          updateMessage(prev.msgId, { text: combinedText, englishTranslation, audioDataUrl });
          const prevSuggestionMsgId = prev.suggestionMsgId;
          lastRecordRef.current = { ...prev, fullText: combinedText, timestamp: Date.now(), suggestionMsgId: null };
          fetchSuggestions(englishTranslation, prevSuggestionMsgId);
          toast.info("Added to previous message");
        } else {
          const englishTranslation = await translateCantoneseToEnglish(cantoneseText);
          const msgId = Date.now().toString();
          addMessage({ id: msgId, sender: "bot", text: cantoneseText, englishTranslation, audioDataUrl });
          lastRecordRef.current = { msgId, suggestionMsgId: null, mode: "cantonese", timestamp: Date.now(), fullText: cantoneseText };
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

  const cancelListening = () => {
    stopRecording().catch(() => {});
    setListeningMode(null);
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
      const stored = messages.find((m) => m.id === id)?.audioDataUrl;
      if (stored) {
        try {
          await playDataUrl(stored);
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

  const confirmSave = () => {
    const title = saveTitle.trim();
    if (!title) return;
    const sessionId = Date.now().toString();
    saveSession(messages, title);
    if (convertToLesson) {
      const vocab = extractVocabFromMessages(messages);
      saveConversationLesson({
        id: sessionId,
        sessionId,
        title,
        createdAt: new Date().toISOString(),
        vocabulary: vocab,
        examCompleted: false,
        examAttempts: 0,
        persona: "personal",
      });
    }
    setIsSaveDialogOpen(false);
    toast.success(convertToLesson ? "Saved & added to Learn!" : "Session saved!");
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
          <p className="text-xs text-zinc-500">Dialect ↔ English</p>
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
            Everyone takes a turn. Tap the button for whoever is speaking, or type your reply.
          </p>

          {/* Direction cards */}
          <div className="w-full max-w-sm space-y-3 mb-8">
            <div className="flex items-center gap-4 bg-purple-50 border border-purple-200 rounded-2xl px-4 py-3 text-left">
              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 text-lg font-bold text-purple-700">
                粵
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-800">Native speaker talks</p>
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
                <p className="text-sm font-semibold text-zinc-800">You speak English</p>
                <p className="text-xs text-zinc-500 mt-0.5">Your speech → translated & spoken in their dialect</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={startListeningCantonese}
                className="flex items-center justify-center w-20 h-20 rounded-full bg-purple-600 text-white shadow-xl shadow-purple-200 transition-transform active:scale-95"
              >
                <Mic size={30} />
              </button>
              <span className="text-xs font-bold text-purple-600">粵 Native</span>
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
                onClick={startListeningEnglish}
                className="flex items-center justify-center w-20 h-20 rounded-full bg-indigo-600 text-white shadow-xl shadow-indigo-200 transition-transform active:scale-95"
              >
                <Mic size={30} />
              </button>
              <span className="text-xs font-bold text-indigo-600">EN English</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 pb-36 space-y-3">
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
                  </div>
                </motion.div>
              );
            }

            if (isSuggestionRow) {
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col gap-2 pl-10"
                >
                  <p className="text-xs text-zinc-400 font-medium">Suggested replies:</p>
                  <div className="flex flex-wrap gap-2">
                    {msg.suggestions!.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleReply(s.original)}
                        disabled={isBusy}
                        className="px-3 py-2 bg-white border border-indigo-200 rounded-xl text-left shadow-sm hover:border-indigo-400 hover:bg-indigo-50 active:scale-95 transition-all disabled:opacity-50"
                      >
                        <p className="text-xs font-medium text-zinc-800">{s.original}</p>
                        <p className="text-xs text-indigo-500 mt-0.5">{s.dialect}</p>
                      </button>
                    ))}
                  </div>
                </motion.div>
              );
            }

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

      {/* Bottom action bar */}
      {!isListening && messages.length > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex gap-3 items-end">
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={startListeningCantonese}
              disabled={isBusy}
              className="flex items-center justify-center w-14 h-14 rounded-full bg-purple-600 text-white shadow-lg shadow-purple-200 transition-transform active:scale-95 disabled:opacity-50"
            >
              <Mic size={22} />
            </button>
            <span className="text-[10px] font-bold text-purple-600">粵</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => setIsTyping(true)}
              disabled={isBusy}
              className="flex items-center justify-center w-14 h-14 rounded-full bg-white border-2 border-zinc-300 text-zinc-500 shadow-lg shadow-zinc-100 transition-transform active:scale-95 disabled:opacity-50"
            >
              <Keyboard size={22} />
            </button>
            <span className="text-[10px] font-bold text-zinc-400">Type</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={startListeningEnglish}
              disabled={isBusy}
              className="flex items-center justify-center w-14 h-14 rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-200 transition-transform active:scale-95 disabled:opacity-50"
            >
              <Mic size={22} />
            </button>
            <span className="text-[10px] font-bold text-indigo-600">EN</span>
          </div>
        </div>
      )}

      {/* Listening overlay */}
      <AnimatePresence>
        {isListening && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border-t border-zinc-100 z-30 pt-8 pb-12 px-6 flex flex-col items-center"
          >
            <div className="text-center mb-8">
              <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold mb-3 ${listeningMode === "english" ? "bg-indigo-100 text-indigo-700" : "bg-purple-100 text-purple-700"}`}>
                {listeningMode === "english" ? "EN English speaker" : "粵 Native speaker"}
              </div>
              <h3 className="text-2xl font-bold text-zinc-800">Recording...</h3>
              <p className="text-sm text-zinc-500 mt-2">
                {listeningMode === "english"
                  ? "Speak in English — will be translated to their dialect"
                  : "Native speaker is talking"}
              </p>
            </div>
            <button
              onClick={stopListening}
              className="relative flex items-center justify-center w-28 h-28 rounded-full bg-red-500 text-white shadow-xl shadow-red-200 transition-transform active:scale-95"
            >
              <span className="absolute w-full h-full rounded-full bg-red-400 animate-ping opacity-75" />
              <MicOff size={40} className="relative z-10" />
            </button>
            <button onClick={cancelListening} className="mt-8 text-zinc-400 font-medium text-sm hover:text-zinc-600">
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>

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

            {activePersona === "personal" && <button
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
            </button>}

            <button
              onClick={confirmSave}
              disabled={!saveTitle.trim()}
              className="w-full py-3.5 bg-indigo-600 text-white rounded-2xl font-semibold text-base hover:bg-indigo-700 transition-colors disabled:opacity-40"
            >
              Save
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
                EN English speaker
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

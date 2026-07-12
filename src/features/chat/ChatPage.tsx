import { useState, useRef, useEffect } from "react";
import { useProfile } from "../../app/context/ProfileProvider";
import { useLibrary } from "../../app/context/LibraryProvider";
import { useChat } from "../../app/context/ChatProvider";
import type { Phrase, Message, TranslationVariant } from "../../types";
import { toast } from "sonner";
import { useAudioRecorder, blobToDataUrl, playDataUrl } from "../../hooks/audio";
import { speakText, speakTextAndCapture } from "../../hooks/useGoogleTTS";
import {
  transcribeCantonese,
  transcribeEnglish,
  translateCantoneseToEnglish,
} from "../../services/translationService";
import { prepareTranslation, type PreparedTranslation } from "./utils/prepareTranslation";
import { getSuggestions } from "../../services/suggestionService";
import { newId } from "../../utils/id";
import { recordCorrection, consentFromProfile } from "../../services/speechSampleService";
import { useTour } from "../../app/components/tour/TourProvider";
import { useBubbleLongPress } from "./hooks/useBubbleLongPress";
import { ChatHeader } from "./components/ChatHeader";
import { DemoBubble } from "./components/DemoBubble";
import { MessageList } from "./components/MessageList";
import { ActionBar } from "./components/ActionBar";
import { TypingOverlay } from "./components/TypingOverlay";
import { SaveSessionDialog } from "./components/SaveSessionDialog";
import { PersonaSheet } from "./components/PersonaSheet";
import { DialectSheet } from "./components/DialectSheet";
import { PhraseSaveSheet } from "./components/PhraseSaveSheet";
import { PendingEnglishOverlay } from "./components/PendingEnglishOverlay";

export function ChatPage() {
  const { tone, userProfile, updateUserProfile, activePersona, dialect, setDialect } = useProfile();
  const { phrases, toggleBookmark, addPhrase, updatePhrase, phraseTags, sessionTags, createTag } =
    useLibrary();
  const { messages, addMessage, addBotSuggestions, updateMessage, removeMessage, saveSession, discardChat } =
    useChat();
  const { isActive: isTourActive, activeTour } = useTour();
  const showDemoBubble =
    isTourActive &&
    activeTour === "chat" &&
    !messages.some((m) => m.sender === "bot" && !!m.englishTranslation);

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
    resultPromise: Promise<PreparedTranslation>;
  } | null>(null);

  const { startRecording, stopRecording } = useAudioRecorder();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const prefetchCacheRef = useRef<Map<string, Promise<PreparedTranslation>>>(new Map());

  type RecordRef = {
    msgId: string;
    suggestionMsgId: string | null;
    mode: "cantonese" | "english";
    timestamp: number;
    fullText: string;
    audioDataUrls: string[];
  };
  const lastRecordRef = useRef<RecordRef | null>(null);
  const suggestionGenRef = useRef(0);
  const recordingStartRef = useRef<number | null>(null);
  const recordingTriggerRef = useRef<"tap" | "hold" | null>(null);
  const recordingModeRef = useRef<"cantonese" | "english" | null>(null);

  const { handleBubblePointerDown, cancelBubbleLongPress, handleBubblePointerMove } = useBubbleLongPress(
    (msg, preText) => {
      setPhraseSelectionMsg(msg);
      setPhraseSelectionText(preText);
    }
  );

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
    const suggestionMsgId = `sug-${newId()}`;
    if (prevSuggestionMsgId) removeMessage(prevSuggestionMsgId);
    if (lastRecordRef.current) {
      lastRecordRef.current = { ...lastRecordRef.current, suggestionMsgId };
    }
    // Retrieval-lite personalization from the user's own data: bookmarked
    // vocabulary + replies they rated up in this conversation history.
    const personalization = {
      savedPhrases: phrases
        .filter((p) => p.isBookmarked)
        .slice(-10)
        .map((p) => `${p.original} — ${p.dialect}`),
      likedReplies: messages
        .filter((m) => m.rating === "up" && m.cantoneseText)
        .slice(-5)
        .map((m) => m.cantoneseText as string),
    };
    getSuggestions(englishTranslation, messages, userProfile, personalization)
      .then((chips) => {
        if (suggestionGenRef.current !== gen) return; // superseded by a newer fetch
        if (chips.length === 0) return;
        addBotSuggestions("", chips, suggestionMsgId);
        setLatestSuggestions(chips);
        chips.forEach((chip) => {
          const cacheKey = `${chip.original}:${tone}`;
          if (prefetchCacheRef.current.has(cacheKey)) return;
          prefetchCacheRef.current.set(
            cacheKey,
            prepareTranslation(chip.original, tone, userProfile?.preferredVoiceId, chip.id)
          );
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
  }, [activePersona]);

  const startListeningCantonese = async () => {
    try {
      await startRecording();
      setListeningMode("cantonese");
    } catch {
      recordingStartRef.current = null;
      recordingModeRef.current = null;
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
      recordingModeRef.current = null;
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
          updateMessage(prev.msgId, {
            text: combinedText,
            englishTranslation,
            audioDataUrls: accumulatedUrls,
          });
          const existingPhrase = phrases.find((p) => p.id === prev.msgId);
          updatePhrase({
            id: prev.msgId,
            original: englishTranslation,
            dialect: combinedText,
            pronunciation: "",
            isBookmarked: existingPhrase?.isBookmarked ?? false,
            context: existingPhrase?.context ?? "",
            audioDataUrl: accumulatedUrls[0],
            audioDataUrls: accumulatedUrls,
          });
          const prevSuggestionMsgId = prev.suggestionMsgId;
          lastRecordRef.current = {
            ...prev,
            fullText: combinedText,
            timestamp: Date.now(),
            suggestionMsgId: null,
            audioDataUrls: accumulatedUrls,
          };
          fetchSuggestions(englishTranslation, prevSuggestionMsgId);
          toast.info("Added to previous message");
        } else {
          const englishTranslation = await translateCantoneseToEnglish(cantoneseText);
          // Message id and derived phrase id are deliberately the same value.
          const msgId = newId();
          addPhrase({
            id: msgId,
            original: englishTranslation,
            dialect: cantoneseText,
            pronunciation: "",
            isBookmarked: false,
            context: "",
            audioDataUrl,
            audioDataUrls: [audioDataUrl],
          });
          addMessage({
            id: msgId,
            sender: "bot",
            text: cantoneseText,
            englishTranslation,
            audioDataUrls: [audioDataUrl],
          });
          lastRecordRef.current = {
            msgId,
            suggestionMsgId: null,
            mode: "cantonese",
            timestamp: Date.now(),
            fullText: cantoneseText,
            audioDataUrls: [audioDataUrl],
          };
          fetchSuggestions(englishTranslation, null);
        }
      } else {
        const englishText = await transcribeEnglish(blob);
        if (!englishText) {
          toast.error("No speech detected. Please try again.");
          return;
        }
        // Kick off translation + TTS immediately while user reviews the transcript
        const resultPromise = prepareTranslation(englishText, tone, userProfile?.preferredVoiceId);
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
    if (finalText !== originalText) {
      // ML data capture: human-labeled STT correction (consent-gated, fire-and-forget)
      recordCorrection(
        { kind: "transcript_edit", original: originalText, corrected: finalText },
        consentFromProfile(userProfile)
      );
    }
    setPendingEnglish(null);
    setIsEditingPending(false);
    lastRecordRef.current = null;
    setStageIsUserSide(true);
    setStage("translating");
    try {
      const { phrase, audioDataUrl, play, variants, predictedResponse } =
        finalText !== originalText
          ? await prepareTranslation(finalText, tone, userProfile?.preferredVoiceId)
          : await resultPromise;
      addPhrase(phrase);
      addMessage({
        id: phrase.id,
        sender: "user",
        text: finalText,
        cantoneseText: phrase.dialect,
        pronunciation: phrase.pronunciation,
        audioDataUrl,
        variants,
        ...(predictedResponse ? { predictedResponse } : {}),
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

  const handleSaveSelectedPhrase = async () => {
    if (!phraseSelectionMsg || !phraseSelectionText.trim()) return;
    const msg = phraseSelectionMsg;
    const dialectText = phraseSelectionText.trim();
    const original = msg.sender === "bot" ? (msg.englishTranslation ?? "") : (msg.text ?? "");
    const originalDialect = msg.sender === "bot" ? msg.text : (msg.cantoneseText ?? "");
    const wasEdited = dialectText !== originalDialect.trim();
    const phraseId = newId();

    try {
      if (!wasEdited) {
        const urls = msg.audioDataUrls ?? (msg.audioDataUrl ? [msg.audioDataUrl] : []);
        addPhrase({
          id: phraseId,
          original,
          dialect: dialectText,
          pronunciation: "",
          isBookmarked: true,
          context: "",
          audioDataUrl: urls[0],
          audioDataUrls: urls.length > 1 ? urls : undefined,
          tags: phraseTagSelection,
        });
        for (const url of urls) {
          try {
            await playDataUrl(url);
          } catch {
            /* skip failed clip */
          }
        }
      } else {
        const { audioDataUrl, play } = await speakTextAndCapture(dialectText, userProfile?.preferredVoiceId);
        addPhrase({
          id: phraseId,
          original,
          dialect: dialectText,
          pronunciation: "",
          isBookmarked: true,
          context: "",
          audioDataUrl,
          tags: phraseTagSelection,
        });
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
      const { phrase, audioDataUrl, play, variants, predictedResponse } = cached
        ? await cached
        : await prepareTranslation(englishText, tone, userProfile?.preferredVoiceId);
      addPhrase(phrase);
      addMessage({
        id: phrase.id,
        sender: "user",
        text: englishText,
        cantoneseText: phrase.dialect,
        pronunciation: phrase.pronunciation,
        audioDataUrl,
        variants,
        ...(predictedResponse ? { predictedResponse } : {}),
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
      // Cached audio was captured for the original text; a switched register
      // variant (different text) must fall through to fresh TTS instead.
      const hasAudioForText = !!msg && text === (msg.cantoneseText ?? msg.text);
      const urls = hasAudioForText ? (msg.audioDataUrls ?? (msg.audioDataUrl ? [msg.audioDataUrl] : [])) : [];
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
    let finalTags = saveSessionTags;
    if (isCreatingSessionTag && newSessionTagInput.trim()) {
      const tag = createTag(newSessionTagInput.trim(), "session");
      finalTags = [...saveSessionTags, tag.id];
      setIsCreatingSessionTag(false);
      setNewSessionTagInput("");
    }
    try {
      saveSession(messages, title, finalTags.length > 0 ? finalTags : undefined);
      setIsSaveDialogOpen(false);
      toast.success("Session saved!");
    } catch {
      toast.error("Failed to save session.");
      setIsSaveDialogOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Intercept suggestion ratings for ML data capture before delegating to the
  // normal message update (consent-gated, fire-and-forget).
  const handleUpdateMessage = (id: string, updates: Partial<Message>) => {
    if (updates.rating === "up" || updates.rating === "down") {
      const rated = messages.find((m) => m.id === id);
      if (rated) {
        recordCorrection(
          { kind: "suggestion_rating", original: rated.text, rating: updates.rating },
          consentFromProfile(userProfile)
        );
      }
    }
    updateMessage(id, updates);
  };

  // Bookmarking on a translated bubble saves whichever register variant is
  // currently displayed; cached audio is dropped when it no longer matches.
  const handleToggleBookmark = (id: string, displayedVariant?: TranslationVariant) => {
    const phrase = phrases.find((p) => p.id === id);
    const isSwitchedVariant = !!phrase && !!displayedVariant && displayedVariant.text !== phrase.dialect;
    if (!phrase || !isSwitchedVariant || phrase.isBookmarked) {
      toggleBookmark(id);
      return;
    }
    updatePhrase({
      ...phrase,
      dialect: displayedVariant.text,
      pronunciation: displayedVariant.pronunciation,
      isBookmarked: true,
      audioDataUrl: undefined,
      audioDataUrls: undefined,
    });
  };

  const handleNewChat = () => {
    if (messages.length === 0) return;
    suggestionGenRef.current++; // invalidate any in-flight suggestion fetches
    prefetchCacheRef.current.clear();
    lastRecordRef.current = null;
    setPendingEnglish(null);
    setLatestSuggestions([]);
    discardChat(messages);
  };

  const stageLabel = stage === "transcribing" ? "Listening..." : "Translating...";

  return (
    <div className="flex flex-col h-full bg-zinc-50 relative">
      {/* Header */}
      <ChatHeader
        activePersona={activePersona}
        dialect={dialect}
        hasMessages={messages.length > 0}
        onOpenPersonaSheet={() => setIsPersonaSheetOpen(true)}
        onOpenDialectSheet={() => setIsDialectSheetOpen(true)}
        onNewChat={handleNewChat}
        onOpenSaveDialog={openSaveDialog}
      />

      {/* Empty state */}
      {messages.length === 0 && !stage && !showDemoBubble ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-zinc-400 text-sm text-center">
            Tap the mic button or type your message for translation
          </p>
        </div>
      ) : showDemoBubble ? (
        <DemoBubble />
      ) : (
        <MessageList
          messages={messages}
          phrases={phrases}
          defaultTone={tone}
          playingId={playingId}
          stage={stage}
          stageIsUserSide={stageIsUserSide}
          stageLabel={stageLabel}
          suggestions={latestSuggestions}
          showSuggestions={
            userProfile?.suggestedRepliesEnabled !== false &&
            latestSuggestions.length > 0 &&
            !isBusy &&
            !isListening
          }
          isBusy={isBusy}
          onReply={handleReply}
          onToggleBookmark={handleToggleBookmark}
          onReplay={replayPhrase}
          onUpdateMessage={handleUpdateMessage}
          onBubblePointerDown={handleBubblePointerDown}
          onBubblePointerMove={handleBubblePointerMove}
          onBubblePointerCancel={cancelBubbleLongPress}
          messagesEndRef={messagesEndRef}
        />
      )}

      {/* Button area background mask — covers scroll content behind buttons */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-zinc-50 z-20 pointer-events-none" />

      {/* Bottom action bar */}
      {!isBusy && (
        <ActionBar
          listeningMode={listeningMode}
          isTapMode={isTapMode}
          isListening={isListening}
          onDialectPointerDown={() => handleMicPointerDown(startListeningCantonese, "cantonese")}
          onEnglishPointerDown={() => handleMicPointerDown(startListeningEnglish, "english")}
          onMicPointerUp={handleMicPointerUp}
          onMicPointerLeave={handleMicPointerLeave}
          onOpenTyping={() => setIsTyping(true)}
        />
      )}

      {/* Typing overlay */}
      <TypingOverlay
        isOpen={isTyping}
        typedReply={typedReply}
        onTypedReplyChange={setTypedReply}
        onSubmit={handleSubmitTyped}
        onClose={() => setIsTyping(false)}
      />

      {/* Save dialog overlay */}
      <SaveSessionDialog
        isOpen={isSaveDialogOpen}
        saveTitle={saveTitle}
        setSaveTitle={setSaveTitle}
        isSaving={isSaving}
        sessionTags={sessionTags}
        saveSessionTags={saveSessionTags}
        setSaveSessionTags={setSaveSessionTags}
        isCreatingSessionTag={isCreatingSessionTag}
        setIsCreatingSessionTag={setIsCreatingSessionTag}
        newSessionTagInput={newSessionTagInput}
        setNewSessionTagInput={setNewSessionTagInput}
        createTag={createTag}
        onConfirm={confirmSave}
        onClose={() => setIsSaveDialogOpen(false)}
      />

      {/* Persona switcher sheet */}
      <PersonaSheet
        isOpen={isPersonaSheetOpen}
        activePersona={activePersona}
        onSelectPersona={(p) => updateUserProfile({ activePersona: p })}
        onClose={() => setIsPersonaSheetOpen(false)}
      />

      {/* Dialect switcher sheet */}
      <DialectSheet
        isOpen={isDialectSheetOpen}
        dialect={dialect}
        onSelectDialect={setDialect}
        onClose={() => setIsDialectSheetOpen(false)}
      />

      {/* Save partial phrase sheet */}
      <PhraseSaveSheet
        isOpen={!!phraseSelectionMsg}
        phraseSelectionText={phraseSelectionText}
        setPhraseSelectionText={setPhraseSelectionText}
        phraseTags={phraseTags}
        phraseTagSelection={phraseTagSelection}
        setPhraseTagSelection={setPhraseTagSelection}
        newTagInput={newTagInput}
        setNewTagInput={setNewTagInput}
        isCreatingPhraseTag={isCreatingPhraseTag}
        setIsCreatingPhraseTag={setIsCreatingPhraseTag}
        createTag={createTag}
        onSave={handleSaveSelectedPhrase}
        onCancel={() => {
          setPhraseSelectionMsg(null);
          setPhraseSelectionText("");
          setPhraseTagSelection([]);
          setNewTagInput("");
          setIsCreatingPhraseTag(false);
        }}
      />

      {/* English transcript review overlay */}
      <PendingEnglishOverlay
        isOpen={!!pendingEnglish}
        pendingEditText={pendingEditText}
        setPendingEditText={setPendingEditText}
        isEditingPending={isEditingPending}
        setIsEditingPending={setIsEditingPending}
        onConfirm={confirmEnglishReply}
        onCancel={cancelEnglishReply}
      />
    </div>
  );
}

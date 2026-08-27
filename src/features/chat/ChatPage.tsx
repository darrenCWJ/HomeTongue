import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useProfile } from "../../app/context/ProfileProvider";
import { useLibrary } from "../../app/context/LibraryProvider";
import { useChat } from "../../app/context/ChatProvider";
import type { Message, TranslationVariant } from "../../types";
import { useActiveCapabilities, useActiveLanguageCode } from "../../hooks/useActiveLanguageCode";
import { recordCorrection, consentFromProfile } from "../../services/speechSampleService";
import { useTour } from "../../app/components/tour/TourProvider";
import { usePhraseReplay } from "./hooks/usePhraseReplay";
import { useSuggestionFlow } from "./hooks/useSuggestionFlow";
import { useReplyFlow } from "./hooks/useReplyFlow";
import { useMicRecording, type RecordRef } from "./hooks/useMicRecording";
import { usePhraseSelection } from "./hooks/usePhraseSelection";
import { useSessionSave } from "./hooks/useSessionSave";
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
  const activeLanguageCode = useActiveLanguageCode();
  // Reactive capability gating (never the module-level accessor in render —
  // that lags one render behind a dialect switch): voice-less packs hide the
  // dialect mic (stt) and every TTS play/replay control (tts). The underlying
  // plumbing already no-ops, but the controls should not render at all.
  const { tts: ttsEnabled, stt: sttEnabled } = useActiveCapabilities();
  const { isActive: isTourActive, activeTour } = useTour();
  const showDemoBubble =
    isTourActive &&
    activeTour === "chat" &&
    !messages.some((m) => m.sender === "bot" && !!m.englishTranslation);

  const [isPersonaSheetOpen, setIsPersonaSheetOpen] = useState(false);
  const [isDialectSheetOpen, setIsDialectSheetOpen] = useState(false);
  const [stage, setStage] = useState<"transcribing" | "translating" | null>(null);
  const [stageIsUserSide, setStageIsUserSide] = useState(false);
  const { playingId, setPlayingId, replayPhrase, replayPhraseSlow } = usePhraseReplay(
    messages,
    userProfile?.preferredVoiceId
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Shared across the suggestion/reply/recording flows (single owner here,
  // passed by parameter — see the hooks' doc comments for who reads/writes).
  const lastRecordRef = useRef<RecordRef | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  // Same latest-ref pattern: flows that await for seconds must read the phrase
  // library as it is when they write, not as it was when they started.
  const phrasesRef = useRef(phrases);
  phrasesRef.current = phrases;

  // Every conversation reset bumps this. Flows that await for seconds capture
  // it before the await and discard their result if it changed, so nothing
  // from a finished conversation can land in the next one.
  const chatEpochRef = useRef(0);
  // resetConversationState is defined below (it needs setters from the hooks
  // that follow), so it reaches useSessionSave and the effect through a ref.
  const resetConversationRef = useRef<() => void>(() => {});
  const prevLanguageCodeRef = useRef(activeLanguageCode);

  const {
    latestSuggestions,
    setLatestSuggestions,
    fetchSuggestions,
    prefetchCacheRef,
    invalidateSuggestions,
  } = useSuggestionFlow({
    messages,
    phrases,
    activeLanguageCode,
    tone,
    userProfile,
    activePersona,
    removeMessage,
    addBotSuggestions,
    lastRecordRef,
    messagesRef,
  });

  const {
    pendingEnglish,
    setPendingEnglish,
    pendingEditText,
    setPendingEditText,
    isEditingPending,
    setIsEditingPending,
    isTyping,
    setIsTyping,
    typedReply,
    setTypedReply,
    confirmEnglishReply,
    cancelEnglishReply,
    handleReply,
    handleSubmitTyped,
  } = useReplyFlow({
    tone,
    userProfile,
    phrasesRef,
    addPhrase,
    updatePhrase,
    addMessage,
    setStage,
    setStageIsUserSide,
    setPlayingId,
    setLatestSuggestions,
    lastRecordRef,
    prefetchCacheRef,
    chatEpochRef,
  });

  // usePhraseSelection's long-press callback can fire up to 500ms after
  // pointer-down (see useBubbleLongPress), so it reads this live rather than
  // a pendingEnglish value snapshotted at pointer-down time — otherwise a
  // transcript review that opens mid-press would go unnoticed.
  const isTranscriptReviewOpenRef = useRef(pendingEnglish !== null);
  isTranscriptReviewOpenRef.current = pendingEnglish !== null;

  const {
    listeningMode,
    isListening,
    isTapMode,
    handleMicPointerDown,
    handleMicPointerUp,
    handleMicPointerLeave,
    startListeningCantonese,
    startListeningEnglish,
  } = useMicRecording({
    phrasesRef,
    addPhrase,
    updatePhrase,
    addMessage,
    updateMessage,
    activeLanguageCode,
    tone,
    userProfile,
    lastRecordRef,
    messagesRef,
    fetchSuggestions,
    setLatestSuggestions,
    setStage,
    setStageIsUserSide,
    setPendingEnglish,
    setPendingEditText,
    chatEpochRef,
  });

  const {
    phraseSelectionMsg,
    phraseSelectionText,
    setPhraseSelectionText,
    phraseTagSelection,
    setPhraseTagSelection,
    newTagInput,
    setNewTagInput,
    isCreatingPhraseTag,
    setIsCreatingPhraseTag,
    isSavingPhrase,
    handleBubblePointerDown,
    cancelBubbleLongPress,
    handleBubblePointerMove,
    handleSaveSelectedPhrase,
    cancelPhraseSelection,
  } = usePhraseSelection({
    addPhrase,
    activeLanguageCode,
    userProfile,
    createTag,
    isTranscriptReviewOpenRef,
  });

  const {
    isSaveDialogOpen,
    setIsSaveDialogOpen,
    saveTitle,
    setSaveTitle,
    isSaving,
    isCreatingSessionTag,
    setIsCreatingSessionTag,
    newSessionTagInput,
    setNewSessionTagInput,
    saveSessionTags,
    setSaveSessionTags,
    openSaveDialog,
    confirmSave,
  } = useSessionSave({
    messages,
    saveSession,
    createTag,
    onAfterSave: () => resetConversationRef.current(),
  });

  // Everything a finished conversation must leave behind: in-flight
  // suggestion fetches, the TTS prefetch cache (keyed without a language, so
  // it must not survive a dialect switch), the 60s dialect append window, the
  // visible chips, a pending transcript, and the save dialog itself. The busy
  // stage goes too — its request is discarded, and leaving it set would hide
  // the input behind a spinner the new conversation can never clear.
  const resetConversationState = () => {
    chatEpochRef.current++;
    invalidateSuggestions();
    prefetchCacheRef.current.clear();
    lastRecordRef.current = null;
    setPendingEnglish(null);
    setLatestSuggestions([]);
    setStage(null);
    setIsSaveDialogOpen(false);
  };
  resetConversationRef.current = resetConversationState;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, stage]);

  // A dialect switch invalidates every artifact of the previous language.
  // Change-only: mounting is not a switch, so it must reset nothing.
  // Must stay registered after useMicRecording's own dialect-stop effect —
  // see the comment there for why the hook-call order matters.
  useEffect(() => {
    if (prevLanguageCodeRef.current === activeLanguageCode) return;
    prevLanguageCodeRef.current = activeLanguageCode;
    resetConversationRef.current();
  }, [activeLanguageCode]);

  const isBusy = stage !== null || pendingEnglish !== null;

  // Intercept suggestion ratings for ML data capture before delegating to the
  // normal message update (consent-gated, fire-and-forget). `context` carries
  // the English text the rated reply responded to (the nearest preceding
  // incoming message's translation) so future DPO training can pair
  // prompt→rating; it stays null when no such message exists.
  const handleUpdateMessage = (id: string, updates: Partial<Message>) => {
    if (updates.rating === "up" || updates.rating === "down") {
      const ratedIndex = messages.findIndex((m) => m.id === id);
      const rated = ratedIndex >= 0 ? messages[ratedIndex] : undefined;
      if (rated) {
        const precedingContext = messages
          .slice(0, ratedIndex)
          .reverse()
          .find((m) => m.sender === "bot" && !!m.englishTranslation)?.englishTranslation;
        recordCorrection(
          {
            kind: "suggestion_rating",
            original: rated.text,
            rating: updates.rating,
            ...(precedingContext ? { context: precedingContext } : {}),
          },
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
    resetConversationState();
    discardChat(messages);
  };

  // A new save dialog shares the transcript-review overlay's z-30 and paints
  // underneath it (later JSX siblings win ties) if opened while it's up.
  // openSaveDialog is a single atomic click, so guarding it here at the
  // trigger is sufficient — nothing can go stale between the check and the
  // open the way it can for a long-press (see usePhraseSelection's own
  // check, which the phrase-selection sheet needs instead — it fires up to
  // 500ms later). toast.info, not .error: nothing failed, the action is
  // just deferred until the review is done.
  const blockedByTranscriptReview = () => {
    if (pendingEnglish === null) return false;
    toast.info("Finish reviewing your transcript first.");
    return true;
  };

  const guardedOpenSaveDialog = () => {
    if (blockedByTranscriptReview()) return;
    openSaveDialog();
  };

  const stageLabel = stage === "transcribing" ? "Listening..." : "Translating...";

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Header */}
      <ChatHeader
        activePersona={activePersona}
        dialect={dialect}
        hasMessages={messages.length > 0}
        onOpenPersonaSheet={() => setIsPersonaSheetOpen(true)}
        onOpenDialectSheet={() => setIsDialectSheetOpen(true)}
        onNewChat={handleNewChat}
        onOpenSaveDialog={guardedOpenSaveDialog}
      />

      {/* Empty state */}
      {messages.length === 0 && !stage && !showDemoBubble ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-faint text-sm text-center">
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
          ttsEnabled={ttsEnabled}
          onReply={handleReply}
          onToggleBookmark={handleToggleBookmark}
          onReplay={replayPhrase}
          onReplaySlow={replayPhraseSlow}
          onUpdateMessage={handleUpdateMessage}
          onBubblePointerDown={handleBubblePointerDown}
          onBubblePointerMove={handleBubblePointerMove}
          onBubblePointerCancel={cancelBubbleLongPress}
          messagesEndRef={messagesEndRef}
        />
      )}

      {/* Button area background mask — covers scroll content behind buttons */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-background z-20 pointer-events-none" />

      {/* Bottom action bar */}
      {!isBusy && (
        <ActionBar
          listeningMode={listeningMode}
          isTapMode={isTapMode}
          isListening={isListening}
          dialectMicEnabled={sttEnabled}
          dialectLabel={dialect}
          onDialectPointerDown={(pointerId) => handleMicPointerDown(startListeningCantonese, "cantonese", pointerId)}
          onEnglishPointerDown={(pointerId) => handleMicPointerDown(startListeningEnglish, "english", pointerId)}
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
        // usePhraseSelection's own long-press callback already checks
        // pendingEnglish live (via isTranscriptReviewOpenRef) before opening
        // a NEW selection, so this is defense-in-depth for a sheet that was
        // ALREADY open: if a transcript review appears while the user is
        // mid-edit here, the sheet hides — phraseSelectionMsg/Text and any
        // tag picks are untouched, not cleared — and reappears once the
        // review clears. A brief, accepted pause with no data loss, not a
        // silent drop.
        isOpen={!!phraseSelectionMsg && pendingEnglish === null}
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
        isSavingPhrase={isSavingPhrase}
        onSave={handleSaveSelectedPhrase}
        onCancel={cancelPhraseSelection}
      />

      {/* English transcript review overlay */}
      <PendingEnglishOverlay
        isOpen={!!pendingEnglish}
        pendingEditText={pendingEditText}
        setPendingEditText={setPendingEditText}
        isEditingPending={isEditingPending}
        setIsEditingPending={setIsEditingPending}
        dialectLabel={dialect}
        onConfirm={confirmEnglishReply}
        onCancel={cancelEnglishReply}
      />
    </div>
  );
}

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { toast } from "sonner";
import type { Message, Phrase, Tone, UserProfile } from "../../../types";
import { useAudioRecorder, blobToDataUrl } from "../../../hooks/audio";
import {
  scoreDialectAccuracyDetailed,
  transcribeDialect,
  transcribeEnglish,
  translateDialectToEnglish,
} from "../../../services/translationService";
import { prepareTranslation, type PreparedTranslation } from "../utils/prepareTranslation";
import { newId } from "../../../utils/id";

/**
 * The last dialect recording turn. Shared between the mic flow (which creates
 * and appends to it), the suggestion flow (which stamps suggestionMsgId onto
 * it), and the reply flows (which null it to close the append window).
 */
export type RecordRef = {
  msgId: string;
  suggestionMsgId: string | null;
  mode: "cantonese" | "english";
  timestamp: number;
  fullText: string;
  audioDataUrls: string[];
};

interface MicRecordingParams {
  /**
   * Live phrase library, read at write time. A render-captured array would be
   * seconds stale by the time an append lands, silently reverting a bookmark
   * or tag the user applied while the turn was still transcribing.
   */
  phrasesRef: MutableRefObject<Phrase[]>;
  addPhrase: (phrase: Phrase) => void;
  updatePhrase: (phrase: Phrase) => void;
  addMessage: (msg: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  activeLanguageCode: string;
  tone: Tone;
  userProfile: UserProfile | null;
  lastRecordRef: MutableRefObject<RecordRef | null>;
  messagesRef: MutableRefObject<Message[]>;
  fetchSuggestions: (englishTranslation: string, prevSuggestionMsgId?: string | null) => void;
  setLatestSuggestions: (suggestions: Phrase[]) => void;
  setStage: (stage: "transcribing" | "translating" | null) => void;
  setStageIsUserSide: (isUserSide: boolean) => void;
  setPendingEnglish: (pending: { text: string; resultPromise: Promise<PreparedTranslation> } | null) => void;
  setPendingEditText: (text: string) => void;
  /** Bumped by ChatPage's conversation reset — see the guards in stopListening. */
  chatEpochRef: MutableRefObject<number>;
}

/**
 * The mic/recording flow: tap-vs-hold pointer handling, dialect and English
 * recording, transcription, the 60s append window for dialect turns, and
 * practice-match scoring. Owns the recording refs (start time, trigger,
 * mode); the shared `lastRecordRef` / `messagesRef` / chat epoch come in via
 * params.
 *
 * Transcription and translation take seconds, so stopListening captures the
 * chat epoch and drops its writes when the conversation was reset (New Chat,
 * Save, dialect switch) while the request was in flight.
 */
export function useMicRecording({
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
}: MicRecordingParams) {
  const [listeningMode, setListeningMode] = useState<"english" | "cantonese" | null>(null);
  const [isTapMode, setIsTapMode] = useState(false);
  const isListening = listeningMode !== null;

  const { startRecording, stopRecording } = useAudioRecorder();
  const recordingStartRef = useRef<number | null>(null);
  const recordingTriggerRef = useRef<"tap" | "hold" | null>(null);
  const recordingModeRef = useRef<"cantonese" | "english" | null>(null);
  // Bumped at the start of every startListening call. recordingModeRef alone
  // answers "which mode owns the refs right now" but not "is this the call
  // that set them" — a released arm can be re-armed in the SAME mode, and a
  // stale rejection from the first attempt would then still match on mode.
  // The token identifies the specific call, so a superseded one (denied or
  // granted) discards instead of touching state a newer attempt now owns.
  const startTokenRef = useRef(0);

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

  /**
   * Arm the recorder for one mode. The browser's permission prompt can stay up
   * for as long as the user ignores it, and the recording can be released
   * meanwhile — by a pointer-up, or by the dialect-switch effect below, which
   * clears recordingModeRef, then possibly re-armed by a new call in the same
   * or a different mode. Re-check ownership after the await (mode still
   * matches AND no newer call has superseded this one) and throw the stream
   * away, or skip clearing state a newer attempt now owns, rather than acting
   * on a recording whose stop control has gone or been handed elsewhere.
   */
  const startListening = async (mode: "cantonese" | "english") => {
    const token = ++startTokenRef.current;
    const isCurrentAttempt = () => recordingModeRef.current === mode && startTokenRef.current === token;
    try {
      await startRecording();
      if (!isCurrentAttempt()) {
        stopRecording().catch(() => {});
        return;
      }
      // Only once the mic is actually live: clearing first meant a denied
      // permission ate the chips the user could still have tapped.
      if (mode === "english") setLatestSuggestions([]);
      setListeningMode(mode);
    } catch {
      // Only clear the refs if this call is still the current attempt — a
      // stale rejection must not wipe out a different (or same-mode,
      // released-then-re-armed) attempt that has since taken ownership.
      if (isCurrentAttempt()) {
        recordingStartRef.current = null;
        recordingModeRef.current = null;
      }
      toast.error("Microphone access denied. Please allow microphone permissions.");
    }
  };

  const startListeningCantonese = () => startListening("cantonese");

  const startListeningEnglish = () => startListening("english");

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
    const epoch = chatEpochRef.current;
    const isStale = () => chatEpochRef.current !== epoch;
    try {
      const blob = await stopRecording();
      if (mode === "cantonese") {
        const [dialectText, audioDataUrl] = await Promise.all([transcribeDialect(blob), blobToDataUrl(blob)]);
        if (isStale()) return; // conversation reset mid-transcription
        if (!dialectText) {
          toast.error("No speech detected. Please try again.");
          return;
        }
        setStage("translating");
        const isAppend =
          lastRecordRef.current?.mode === "cantonese" &&
          Date.now() - lastRecordRef.current.timestamp < 60_000;
        if (isAppend) {
          const prev = lastRecordRef.current!;
          const combinedText = `${prev.fullText} ${dialectText}`;
          const accumulatedUrls = [...prev.audioDataUrls, audioDataUrl];
          const englishTranslation = await translateDialectToEnglish(combinedText);
          if (isStale()) return; // conversation reset mid-translation
          updateMessage(prev.msgId, {
            text: combinedText,
            englishTranslation,
            audioDataUrls: accumulatedUrls,
          });
          // Merge over the phrase as it stands right now: everything the user
          // touched while this turn was in flight (bookmark, tags, createdAt)
          // must survive the append. The fallback only keeps the shape the
          // pre-merge code wrote for an id the library does not know —
          // updatePhrase ignores those, here as before.
          const existingPhrase = phrasesRef.current.find((p) => p.id === prev.msgId) ?? {
            id: prev.msgId,
            original: "",
            dialect: "",
            pronunciation: "",
            isBookmarked: false,
            context: "",
            languageCode: activeLanguageCode,
          };
          updatePhrase({
            ...existingPhrase,
            original: englishTranslation,
            dialect: combinedText,
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
          const englishTranslation = await translateDialectToEnglish(dialectText);
          if (isStale()) return; // conversation reset mid-translation
          // Message id and derived phrase id are deliberately the same value.
          const msgId = newId();
          addPhrase({
            id: msgId,
            original: englishTranslation,
            dialect: dialectText,
            pronunciation: "",
            isBookmarked: false,
            context: "",
            audioDataUrl,
            audioDataUrls: [audioDataUrl],
            languageCode: activeLanguageCode,
          });
          addMessage({
            id: msgId,
            sender: "bot",
            text: dialectText,
            englishTranslation,
            audioDataUrls: [audioDataUrl],
          });
          // Honest practice feedback: when the user was just shown a phrase
          // (the most recent outgoing message with dialectText), score the
          // transcript against it and attach a "word match" badge. Best-effort
          // and fire-and-forget — skips silently when there is no target.
          const practiceTarget = [...messagesRef.current]
            .reverse()
            .find((m) => m.sender === "user" && !!m.dialectText);
          if (practiceTarget?.dialectText) {
            scoreDialectAccuracyDetailed(practiceTarget.dialectText, dialectText)
              .then((matchScore) => {
                if (isStale()) return; // conversation reset mid-scoring
                updateMessage(msgId, { matchScore });
              })
              .catch(() => {});
          }
          lastRecordRef.current = {
            msgId,
            suggestionMsgId: null,
            mode: "cantonese",
            timestamp: Date.now(),
            fullText: dialectText,
            audioDataUrls: [audioDataUrl],
          };
          fetchSuggestions(englishTranslation, null);
        }
      } else {
        const englishText = await transcribeEnglish(blob);
        if (isStale()) return; // conversation reset mid-transcription
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
      // Only clear the stage this call set: after a reset it belongs to the
      // new conversation, which may already be busy with its own turn.
      if (!isStale()) setStage(null);
    }
  };

  // A dialect switch removes the only control that can stop a dialect
  // recording: ActionBar renders the Dialect mic solely for packs with an stt
  // model, so switching to a voice-less pack mid-recording used to leave the
  // recorder hot with nothing on screen to release it. Stop it here instead.
  // The captured audio belongs to the pack that is going away, so this is a
  // hard stop; the turn it produces is discarded by the epoch guard above,
  // because ChatPage's dialect-switch reset bumps the epoch in an effect
  // registered after this one.
  const prevLanguageCodeRef = useRef(activeLanguageCode);
  useEffect(() => {
    if (prevLanguageCodeRef.current === activeLanguageCode) return; // mounting is not a switch
    prevLanguageCodeRef.current = activeLanguageCode;
    if (!listeningMode && !recordingModeRef.current) return;
    void stopListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- change-only on the language; stopListening is rebuilt every render
  }, [activeLanguageCode]);

  return {
    listeningMode,
    isListening,
    isTapMode,
    handleMicPointerDown,
    handleMicPointerUp,
    handleMicPointerLeave,
    startListeningCantonese,
    startListeningEnglish,
  };
}

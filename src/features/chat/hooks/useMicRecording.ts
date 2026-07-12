import { useRef, useState, type MutableRefObject } from "react";
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
  phrases: Phrase[];
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
  setPendingEnglish: (
    pending: { text: string; resultPromise: Promise<PreparedTranslation> } | null
  ) => void;
  setPendingEditText: (text: string) => void;
}

/**
 * The mic/recording flow: tap-vs-hold pointer handling, dialect and English
 * recording, transcription, the 60s append window for dialect turns, and
 * practice-match scoring. Owns the recording refs (start time, trigger,
 * mode); the shared `lastRecordRef` / `messagesRef` come in via params.
 */
export function useMicRecording({
  phrases,
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
}: MicRecordingParams) {
  const [listeningMode, setListeningMode] = useState<"english" | "cantonese" | null>(null);
  const [isTapMode, setIsTapMode] = useState(false);
  const isListening = listeningMode !== null;

  const { startRecording, stopRecording } = useAudioRecorder();
  const recordingStartRef = useRef<number | null>(null);
  const recordingTriggerRef = useRef<"tap" | "hold" | null>(null);
  const recordingModeRef = useRef<"cantonese" | "english" | null>(null);

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
        const [dialectText, audioDataUrl] = await Promise.all([transcribeDialect(blob), blobToDataUrl(blob)]);
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
            languageCode: existingPhrase?.languageCode ?? activeLanguageCode,
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
              .then((matchScore) => updateMessage(msgId, { matchScore }))
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

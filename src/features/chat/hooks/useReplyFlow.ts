import { useState, type MutableRefObject } from "react";
import { toast } from "sonner";
import type { Message, Phrase, Tone, UserProfile } from "../../../types";
import { prepareTranslation, type PreparedTranslation } from "../utils/prepareTranslation";
import { recordCorrection, consentFromProfile } from "../../../services/speechSampleService";
import type { RecordRef } from "./useMicRecording";

interface ReplyFlowParams {
  tone: Tone;
  userProfile: UserProfile | null;
  addPhrase: (phrase: Phrase) => void;
  addMessage: (msg: Message) => void;
  setStage: (stage: "transcribing" | "translating" | null) => void;
  setStageIsUserSide: (isUserSide: boolean) => void;
  setPlayingId: (id: string | null) => void;
  setLatestSuggestions: (suggestions: Phrase[]) => void;
  lastRecordRef: MutableRefObject<RecordRef | null>;
  prefetchCacheRef: MutableRefObject<Map<string, Promise<PreparedTranslation>>>;
}

/**
 * The outgoing reply flows: confirming/cancelling the pending English
 * transcript, chip or typed replies (prefetch-cache aware), and the typing
 * overlay state. Owns the pending-English and typing state; the shared
 * `lastRecordRef` and the suggestion prefetch cache come in via params.
 */
export function useReplyFlow({
  tone,
  userProfile,
  addPhrase,
  addMessage,
  setStage,
  setStageIsUserSide,
  setPlayingId,
  setLatestSuggestions,
  lastRecordRef,
  prefetchCacheRef,
}: ReplyFlowParams) {
  const [pendingEnglish, setPendingEnglish] = useState<{
    text: string;
    resultPromise: Promise<PreparedTranslation>;
  } | null>(null);
  const [pendingEditText, setPendingEditText] = useState("");
  const [isEditingPending, setIsEditingPending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [typedReply, setTypedReply] = useState("");

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
        dialectText: phrase.dialect,
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
        dialectText: phrase.dialect,
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

  return {
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
  };
}

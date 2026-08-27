import { useState, type MutableRefObject } from "react";
import { toast } from "sonner";
import type { Message, Phrase, Tone, UserProfile } from "../../../types";
import { prepareTranslation, type PreparedTranslation } from "../utils/prepareTranslation";
import { recordCorrection, consentFromProfile } from "../../../services/speechSampleService";
import type { RecordRef } from "./useMicRecording";

interface ReplyFlowParams {
  tone: Tone;
  userProfile: UserProfile | null;
  /** Live phrase library, read at write time — see savePreparedPhrase. */
  phrasesRef: MutableRefObject<Phrase[]>;
  addPhrase: (phrase: Phrase) => void;
  updatePhrase: (phrase: Phrase) => void;
  addMessage: (msg: Message) => void;
  setStage: (stage: "transcribing" | "translating" | null) => void;
  setStageIsUserSide: (isUserSide: boolean) => void;
  setPlayingId: (id: string | null) => void;
  setLatestSuggestions: (suggestions: Phrase[]) => void;
  lastRecordRef: MutableRefObject<RecordRef | null>;
  prefetchCacheRef: MutableRefObject<Map<string, Promise<PreparedTranslation>>>;
  /** Bumped by ChatPage's conversation reset — see the guards below. */
  chatEpochRef: MutableRefObject<number>;
}

/**
 * The outgoing reply flows: confirming/cancelling the pending English
 * transcript, chip or typed replies (prefetch-cache aware), and the typing
 * overlay state. Owns the pending-English and typing state; the shared
 * `lastRecordRef`, the suggestion prefetch cache and the chat epoch come in
 * via params.
 *
 * Translation takes seconds, so both reply paths capture the chat epoch before
 * awaiting: if the conversation was reset (New Chat, Save, dialect switch)
 * while the request was in flight, the result belongs to a conversation that
 * no longer exists and is dropped instead of appended to the fresh one.
 */
export function useReplyFlow({
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
}: ReplyFlowParams) {
  const [pendingEnglish, setPendingEnglish] = useState<{
    text: string;
    resultPromise: Promise<PreparedTranslation>;
  } | null>(null);
  const [pendingEditText, setPendingEditText] = useState("");
  const [isEditingPending, setIsEditingPending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [typedReply, setTypedReply] = useState("");

  /**
   * Persist a freshly prepared phrase, upserting rather than inserting.
   * A chip's prefetched translation carries the chip's own id, and the chip
   * stub is already in the library under it — addPhrase dedupes by id, so
   * inserting silently dropped the real translation. Existence is read from
   * the live ref because the stub can land while this translation is still in
   * flight. Only the chip path can collide — a transcript reply always
   * translates under a freshly minted id.
   */
  const savePreparedPhrase = (phrase: Phrase) => {
    if (phrasesRef.current.some((p) => p.id === phrase.id)) {
      updatePhrase(phrase);
      return;
    }
    addPhrase(phrase);
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
    const epoch = chatEpochRef.current;
    try {
      const { phrase, audioDataUrl, play, variants, predictedResponse } =
        finalText !== originalText
          ? await prepareTranslation(finalText, tone, userProfile?.preferredVoiceId)
          : await resultPromise;
      if (chatEpochRef.current !== epoch) return; // conversation reset mid-translation
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
        // Only clear the highlight this call set: a clip that outlives the
        // conversation must not unhighlight the fresh one's playing bubble.
        if (chatEpochRef.current === epoch) setPlayingId(null);
      }
    } catch (err) {
      // A rejection that lands after a reset belongs to a conversation the
      // user already left — same as the write above, it must not surface.
      if (chatEpochRef.current === epoch) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Translation failed: ${msg}`);
      }
    } finally {
      // Only clear the stage this call set: after a reset it belongs to the
      // new conversation, which may already be busy with its own turn.
      if (chatEpochRef.current === epoch) setStage(null);
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
    const epoch = chatEpochRef.current;
    try {
      const cacheKey = `${englishText}:${tone}`;
      const cached = prefetchCacheRef.current.get(cacheKey);
      const { phrase, audioDataUrl, play, variants, predictedResponse } = cached
        ? await cached
        : await prepareTranslation(englishText, tone, userProfile?.preferredVoiceId);
      if (chatEpochRef.current !== epoch) return; // conversation reset mid-translation
      savePreparedPhrase(phrase);
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
        // Only clear the highlight this call set: a clip that outlives the
        // conversation must not unhighlight the fresh one's playing bubble.
        if (chatEpochRef.current === epoch) setPlayingId(null);
      }
    } catch (err) {
      // A rejection that lands after a reset belongs to a conversation the
      // user already left — same as the write above, it must not surface.
      if (chatEpochRef.current === epoch) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Reply failed: ${msg}`);
      }
    } finally {
      // Only clear the stage this call set: after a reset it belongs to the
      // new conversation, which may already be busy with its own turn.
      if (chatEpochRef.current === epoch) setStage(null);
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

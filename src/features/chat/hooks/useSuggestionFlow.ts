import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { Message, PersonaType, Phrase, Tone, UserProfile } from "../../../types";
import { getSuggestions } from "../../../services/suggestionService";
import { filterByLanguage } from "../../../languages/scope";
import { prepareTranslation, type PreparedTranslation } from "../utils/prepareTranslation";
import { newId } from "../../../utils/id";
import type { RecordRef } from "./useMicRecording";

interface SuggestionFlowParams {
  messages: Message[];
  phrases: Phrase[];
  activeLanguageCode: string;
  tone: Tone;
  userProfile: UserProfile | null;
  activePersona: PersonaType;
  removeMessage: (id: string) => void;
  addBotSuggestions: (transcript: string, suggestions: Phrase[], messageId?: string) => void;
  lastRecordRef: MutableRefObject<RecordRef | null>;
  messagesRef: MutableRefObject<Message[]>;
}

/**
 * Suggestion fetch/prefetch flow: generation-counted suggestion requests,
 * TTS prefetching keyed by `text:tone`, and persona-change regeneration.
 * Owns the prefetch cache and generation counter; the shared `lastRecordRef`
 * / `messagesRef` come in via params.
 */
export function useSuggestionFlow({
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
}: SuggestionFlowParams) {
  const [latestSuggestions, setLatestSuggestions] = useState<Phrase[]>([]);
  const prefetchCacheRef = useRef<Map<string, Promise<PreparedTranslation>>>(new Map());
  const suggestionGenRef = useRef(0);

  // Ref so the persona-change effect always calls the latest version without stale closures
  const fetchSuggestionsRef = useRef<(e: string, prev: string | null) => void>(() => {});

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
    // Scoped to the active language so suggestions never mix dialects.
    const personalization = {
      savedPhrases: filterByLanguage(phrases, activeLanguageCode)
        .filter((p) => p.isBookmarked)
        .slice(-10)
        .map((p) => `${p.original} — ${p.dialect}`),
      likedReplies: messages
        .filter((m) => m.rating === "up" && m.dialectText)
        .slice(-5)
        .map((m) => m.dialectText as string),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately persona-only; refs carry the rest
  }, [activePersona]);

  // Invalidate any in-flight suggestion fetches (their results are dropped)
  const invalidateSuggestions = () => {
    suggestionGenRef.current++;
  };

  return {
    latestSuggestions,
    setLatestSuggestions,
    fetchSuggestions,
    prefetchCacheRef,
    invalidateSuggestions,
  };
}

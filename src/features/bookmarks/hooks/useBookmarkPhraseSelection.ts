import React, { useState, useRef } from "react";
import { toast } from "sonner";
import type { Phrase } from "../../../types";
import { newId } from "../../../utils/id";

const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_THRESHOLD = 8;

interface BookmarkPhraseSelectionParams {
  phrases: Phrase[];
  addPhrase: (phrase: Phrase) => void;
  toggleBookmark: (id: string) => void;
  updatePhrase: (phrase: Phrase) => void;
  activeLanguageCode: string;
}

/**
 * Phrase saving from session bubbles: long-press opens the selection sheet
 * with the bubble's dialect text (cancelled by movement or release), saving
 * creates a bookmarked phrase, and the bookmark button toggles or creates
 * the message-derived phrase.
 */
export function useBookmarkPhraseSelection({
  phrases,
  addPhrase,
  toggleBookmark,
  updatePhrase,
  activeLanguageCode,
}: BookmarkPhraseSelectionParams) {
  const [phraseSelectionData, setPhraseSelectionData] = useState<{
    dialect: string;
    original: string;
  } | null>(null);
  const [phraseSelectionText, setPhraseSelectionText] = useState("");
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const handleSessionBookmark = (msg: {
    id: string;
    sender: string;
    text?: string;
    dialectText?: string;
    englishTranslation?: string;
    audioDataUrl?: string;
    audioDataUrls?: string[];
  }) => {
    const existing = phrases.find((p) => p.id === msg.id);
    if (existing && existing.isBookmarked) {
      // Mirror PhraseCard's un-bookmark: clear tags too, so the phrase
      // actually leaves the Saved list (membership is isBookmarked ||
      // tags.length > 0) instead of lingering with a filled icon (BM-03).
      updatePhrase({ ...existing, isBookmarked: false, tags: [] });
      return;
    }
    if (existing) {
      toggleBookmark(msg.id);
      return;
    }
    const dialectText = msg.sender === "bot" ? (msg.text ?? "") : (msg.dialectText ?? "");
    const originalText = msg.sender === "bot" ? (msg.englishTranslation ?? "") : (msg.text ?? "");
    if (!dialectText) {
      // The long-press guard (handleBubblePointerDown) stays silent for the
      // same condition — this is the only path a tap can take, so it must
      // speak instead of no-opping invisibly (BM-06).
      toast.error("Nothing to save from this message.");
      return;
    }
    const urls = msg.audioDataUrls ?? (msg.audioDataUrl ? [msg.audioDataUrl] : []);
    addPhrase({
      id: msg.id,
      original: originalText,
      dialect: dialectText,
      pronunciation: "",
      isBookmarked: true,
      context: "",
      audioDataUrl: urls[0],
      audioDataUrls: urls.length > 1 ? urls : undefined,
      languageCode: activeLanguageCode,
    });
  };

  const handleBubblePointerDown = (e: React.PointerEvent, dialectText: string, originalText: string) => {
    if (!dialectText) return;
    longPressStartPosRef.current = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = setTimeout(() => {
      setPhraseSelectionData({ dialect: dialectText, original: originalText });
      setPhraseSelectionText(dialectText);
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

  const handleSaveSelectedPhrase = () => {
    if (!phraseSelectionData || !phraseSelectionText.trim()) return;
    addPhrase({
      id: newId(),
      original: phraseSelectionData.original,
      dialect: phraseSelectionText.trim(),
      pronunciation: "",
      isBookmarked: true,
      context: "",
      languageCode: activeLanguageCode,
    });
    setPhraseSelectionData(null);
    setPhraseSelectionText("");
    toast.success("Phrase saved to bookmarks!");
  };

  const cancelPhraseSelection = () => {
    setPhraseSelectionData(null);
    setPhraseSelectionText("");
  };

  return {
    phraseSelectionData,
    phraseSelectionText,
    setPhraseSelectionText,
    handleSessionBookmark,
    handleBubblePointerDown,
    cancelBubbleLongPress,
    handleBubblePointerMove,
    handleSaveSelectedPhrase,
    cancelPhraseSelection,
  };
}

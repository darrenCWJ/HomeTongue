import { useRef, useState } from "react";
import { toast } from "sonner";
import type { Message, Phrase, Tag, TagType, UserProfile } from "../../../types";
import { playDataUrl } from "../../../hooks/audio";
import { speakTextAndCapture } from "../../../hooks/useGoogleTTS";
import { newId } from "../../../utils/id";
import { useBubbleLongPress } from "./useBubbleLongPress";

interface PhraseSelectionParams {
  addPhrase: (phrase: Phrase) => void;
  activeLanguageCode: string;
  userProfile: UserProfile | null;
  createTag: (name: string, type: TagType) => Tag;
}

/**
 * Long-press phrase selection and save: opens the phrase-save sheet with the
 * pressed bubble's dialect text, tracks the edited selection + tag picks, and
 * saves (replaying original audio for unedited text, fresh TTS for edits).
 */
export function usePhraseSelection({
  addPhrase,
  activeLanguageCode,
  userProfile,
  createTag,
}: PhraseSelectionParams) {
  const [phraseSelectionMsg, setPhraseSelectionMsg] = useState<Message | null>(null);
  const [phraseSelectionText, setPhraseSelectionText] = useState("");
  const [phraseTagSelection, setPhraseTagSelection] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");
  const [isCreatingPhraseTag, setIsCreatingPhraseTag] = useState(false);
  const [isSavingPhrase, setIsSavingPhrase] = useState(false);
  // A ref as well as the state: two taps in the same tick both read the same
  // render's state, so only a ref can actually turn the second one away.
  const isSavingPhraseRef = useRef(false);

  const { handleBubblePointerDown, cancelBubbleLongPress, handleBubblePointerMove } = useBubbleLongPress(
    (msg, preText) => {
      // The save clears the selection when it settles, so letting another
      // bubble take the sheet over mid-save would close it and drop that
      // bubble's edits without the user ever confirming them.
      if (isSavingPhraseRef.current) return;
      setPhraseSelectionMsg(msg);
      setPhraseSelectionText(preText);
    }
  );

  const handleSaveSelectedPhrase = async () => {
    // A save runs for as long as its audio does (clip replay, or a fresh TTS
    // round trip for edited text). Without this the sheet stayed live and a
    // second tap saved the same phrase again under a new id.
    if (isSavingPhraseRef.current) return;
    if (!phraseSelectionMsg || !phraseSelectionText.trim()) return;
    const msg = phraseSelectionMsg;
    const dialectText = phraseSelectionText.trim();
    const original = msg.sender === "bot" ? (msg.englishTranslation ?? "") : (msg.text ?? "");
    const originalDialect = msg.sender === "bot" ? msg.text : (msg.dialectText ?? "");
    const wasEdited = dialectText !== originalDialect.trim();
    const phraseId = newId();

    isSavingPhraseRef.current = true;
    setIsSavingPhrase(true);
    // Commit a half-typed new tag at save time — exactly like
    // useSessionSave.confirmSave — so tapping Save instead of Enter/the tag's
    // own check button never silently drops it.
    let finalTags = phraseTagSelection;
    if (isCreatingPhraseTag && newTagInput.trim()) {
      const tag = createTag(newTagInput.trim(), "phrase");
      finalTags = [...phraseTagSelection, tag.id];
      setIsCreatingPhraseTag(false);
      setNewTagInput("");
    }
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
          tags: finalTags,
          languageCode: activeLanguageCode,
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
          tags: finalTags,
          languageCode: activeLanguageCode,
        });
        await play();
      }
      toast.success("Phrase saved!");
    } catch {
      toast.error("Failed to save phrase.");
    } finally {
      isSavingPhraseRef.current = false;
      setIsSavingPhrase(false);
    }

    setPhraseSelectionMsg(null);
    setPhraseSelectionText("");
    setPhraseTagSelection([]);
  };

  const cancelPhraseSelection = () => {
    setPhraseSelectionMsg(null);
    setPhraseSelectionText("");
    setPhraseTagSelection([]);
    setNewTagInput("");
    setIsCreatingPhraseTag(false);
  };

  return {
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
  };
}

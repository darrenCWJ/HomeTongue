import { useRef, useState, type MutableRefObject } from "react";
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
  /**
   * True while the transcript-review overlay is open. Read live inside the
   * long-press callback — which can fire up to 500ms after pointer-down —
   * rather than a value captured at pointer-down time, so a pendingEnglish
   * that turns truthy during that window is still caught.
   */
  isTranscriptReviewOpenRef: MutableRefObject<boolean>;
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
  isTranscriptReviewOpenRef,
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
      // Checked here, not at pointer-down: useBubbleLongPress already
      // filtered out taps, scroll drags, and empty preText, so this only
      // fires once a real long-press has actually completed — the one
      // moment a selection would actually open, and the only moment worth
      // telling the user why it didn't.
      if (isTranscriptReviewOpenRef.current) {
        toast.info("Finish reviewing your transcript first.");
        return;
      }
      setPhraseSelectionMsg(msg);
      setPhraseSelectionText(preText);
      // The sheet has no backdrop, so bubbles stay live — a long-press on a
      // different bubble (or a fresh one on the same bubble) must not let a
      // half-typed or already-selected tag from a previous, abandoned
      // selection commit onto or attach to this new one at save time.
      setPhraseTagSelection([]);
      setNewTagInput("");
      setIsCreatingPhraseTag(false);
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
    // own check button never silently drops it. createTag dedupes by
    // name+type and returns the existing tag when the typed name matches one
    // already selected, so the appended id is deduped too.
    let finalTags = phraseTagSelection;
    if (isCreatingPhraseTag && newTagInput.trim()) {
      const tag = createTag(newTagInput.trim(), "phrase");
      finalTags = [...new Set([...phraseTagSelection, tag.id])];
      setIsCreatingPhraseTag(false);
      setNewTagInput("");
    }
    // "The phrase reached the library", not "the save ran to the end": audio
    // is replayed AFTER the phrase is added, so a clip that fails to play must
    // still close the sheet — reopening it would invite a duplicate save.
    let saved = false;
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
        saved = true;
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
        saved = true;
        await play();
      }
      toast.success("Phrase saved!");
    } catch {
      toast.error("Failed to save phrase.");
    } finally {
      isSavingPhraseRef.current = false;
      setIsSavingPhrase(false);
    }

    // A save that never got that far (a TTS rejection on edited text) used to
    // close the sheet anyway, throwing away the edited text the user would
    // have to retype — behind an error toast telling them to try again.
    if (!saved) return;
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

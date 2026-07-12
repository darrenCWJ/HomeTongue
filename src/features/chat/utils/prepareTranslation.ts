import type { MessageVariants, Phrase, Tone } from "../../../types";
import { translate } from "../../../services/translationService";
import { speakTextAndCapture } from "../../../hooks/useGoogleTTS";
import { newId } from "../../../utils/id";

/**
 * Everything the chat surface needs after translating an English phrase:
 * the tone-selected phrase with captured TTS audio, plus the register
 * variants and predicted reply the translation API returns on every call.
 */
export interface PreparedTranslation {
  phrase: Phrase;
  audioDataUrl: string;
  play: () => Promise<void>;
  variants: MessageVariants;
  predictedResponse?: string;
}

/**
 * Translate English text, synthesize TTS for the tone-selected variant, and
 * keep the full set of register variants + predicted response instead of
 * discarding them. Shared by the reply, transcript-confirm, and suggestion
 * prefetch flows in Chat.
 */
export async function prepareTranslation(
  englishText: string,
  tone: Tone,
  voiceId?: string,
  phraseId: string = newId()
): Promise<PreparedTranslation> {
  const result = await translate({ text: englishText, preferredTone: tone });
  const variant = result[tone];
  const { audioDataUrl, play } = await speakTextAndCapture(variant.text, voiceId);
  const phrase: Phrase = {
    id: phraseId,
    original: englishText,
    dialect: variant.text,
    pronunciation: variant.pronunciation,
    isBookmarked: false,
    context: result.context,
  };
  return {
    phrase,
    audioDataUrl,
    play,
    variants: { formal: result.formal, casual: result.casual, slang: result.slang },
    ...(result.predictedResponse ? { predictedResponse: result.predictedResponse } : {}),
  };
}

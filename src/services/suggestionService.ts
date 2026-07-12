import type { Message, UserProfile, Phrase } from "../types";
import { postJson } from "../lib/api";
import { getActiveLanguagePack } from "../languages";
import { newId } from "../utils/id";
import { parseModelJson, truncateForLog } from "../utils/modelJson";

const SYSTEM_PROMPT = `You are a conversation assistant helping someone reply to a native dialect speaker. Based on what the native speaker just said (given as an English translation) and the conversation history, suggest 3 natural English phrases the user might want to say in reply.

Return ONLY a JSON array (no markdown, no explanation):
[
  { "english": "...", "cantonese": "...", "pronunciation": "...", "context": "..." },
  { "english": "...", "cantonese": "...", "pronunciation": "...", "context": "..." },
  { "english": "...", "cantonese": "...", "pronunciation": "...", "context": "..." }
]

Rules:
- "english" is a natural English reply phrase
- "cantonese" is the dialect translation using traditional Chinese characters
- "pronunciation" uses Jyutping romanization (e.g. nei5 hou2)
- "context" is a short usage note (1 sentence)
- Suggestions must directly respond to what the native speaker said
- Match the formality level of the user's profile tone`;

interface SuggestionItem {
  english: string;
  cantonese: string;
  pronunciation: string;
  context: string;
}

/**
 * Retrieval-lite personalization: the user's own saved vocabulary and
 * previously liked replies, injected as few-shot style context so
 * suggestions match how this user actually speaks.
 */
export interface SuggestionPersonalization {
  /** Bookmarked phrases, formatted "english — cantonese" (most recent first) */
  savedPhrases?: string[];
  /** Reply texts the user rated thumbs-up in past conversations */
  likedReplies?: string[];
}

const MAX_SAVED_PHRASES = 10;
const MAX_LIKED_REPLIES = 5;

export async function getSuggestions(
  lastUserMessage: string,
  conversationHistory: Message[],
  userProfile: UserProfile | null,
  personalization?: SuggestionPersonalization
): Promise<Phrase[]> {
  const activePersona = userProfile?.activePersona ?? "personal";
  const activePersonaProfile = userProfile?.personaProfiles?.[activePersona];
  const tone = activePersonaProfile?.tone ?? userProfile?.preferredTone ?? "casual";
  const personaSummary = activePersonaProfile?.personaSummary ?? userProfile?.personaSummary;
  const characteristicPhrases =
    activePersonaProfile?.characteristicPhrases ?? userProfile?.characteristicPhrases;
  const jobTitle = activePersona === "work" ? userProfile?.personaProfiles?.work?.jobTitle : undefined;

  const recentHistory = conversationHistory.slice(-6);

  const historyText = recentHistory
    .map((m) => `${m.sender === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n");

  const userContent = [
    userProfile?.name ? `User name: ${userProfile.name}` : "",
    personaSummary ? `User persona: ${personaSummary}` : "",
    characteristicPhrases?.length ? `Phrases they commonly use: ${characteristicPhrases.join(", ")}` : "",
    jobTitle
      ? `The user is speaking in a work context as a ${jobTitle}. Keep suggestions professional and relevant to their role.`
      : "",
    personalization?.savedPhrases?.length
      ? `Phrases the user has saved (their active vocabulary — prefer wording at this level):\n${personalization.savedPhrases
          .slice(0, MAX_SAVED_PHRASES)
          .map((p) => `- ${p}`)
          .join("\n")}`
      : "",
    personalization?.likedReplies?.length
      ? `Reply styles this user liked before (match this voice):\n${personalization.likedReplies
          .slice(0, MAX_LIKED_REPLIES)
          .map((p) => `- ${p}`)
          .join("\n")}`
      : "",
    `Tone preference: ${tone}`,
    historyText ? `Recent conversation:\n${historyText}` : "",
    `The native speaker just said (English translation): "${lastUserMessage}"`,
    "Suggest 3 English replies the app owner might say in response, matching their personal voice and style.",
  ]
    .filter(Boolean)
    .join("\n\n");

  let content: string;
  try {
    ({ content } = await postJson<{ content: string }>("/api/chat", {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0.7,
      max_tokens: 400,
    }));
  } catch (error) {
    console.error("Suggestion request failed:", error);
    return [];
  }

  let parsed: SuggestionItem[];
  try {
    parsed = parseModelJson<SuggestionItem[]>(content);
  } catch (error) {
    console.error(
      `Failed to parse suggestion response as JSON (content: "${truncateForLog(content)}"):`,
      error
    );
    return [];
  }

  if (!Array.isArray(parsed)) return [];
  return parsed.map((item) => ({
    id: `suggestion-${newId()}`,
    original: item.english,
    dialect: item.cantonese,
    pronunciation: item.pronunciation,
    isBookmarked: false,
    context: item.context,
    // Suggestions are persisted via mergeSuggestedPhrases, so they carry the
    // language they were generated in.
    languageCode: getActiveLanguagePack().code,
  }));
}

import type { Message, UserProfile, Phrase } from "../types";

const OPENAI_BASE = "https://api.openai.com/v1";

const SYSTEM_PROMPT = `You are a conversation assistant helping someone who does not speak Cantonese reply to a Cantonese speaker. Based on what the Cantonese speaker just said (given as an English translation) and the conversation history, suggest 3 natural English phrases the non-Cantonese speaker might want to say in reply.

Return ONLY a JSON array (no markdown, no explanation):
[
  { "english": "...", "cantonese": "...", "pronunciation": "...", "context": "..." },
  { "english": "...", "cantonese": "...", "pronunciation": "...", "context": "..." },
  { "english": "...", "cantonese": "...", "pronunciation": "...", "context": "..." }
]

Rules:
- "english" is a natural English reply phrase
- "cantonese" is the Cantonese translation using traditional Chinese characters
- "pronunciation" uses Jyutping romanization (e.g. nei5 hou2)
- "context" is a short usage note (1 sentence)
- Suggestions must directly respond to what the Cantonese speaker said
- Match the formality level of the user's profile tone`;

interface SuggestionItem {
  english: string;
  cantonese: string;
  pronunciation: string;
  context: string;
}

export async function getSuggestions(
  lastUserMessage: string,
  conversationHistory: Message[],
  userProfile: UserProfile | null
): Promise<Phrase[]> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string;
  if (!apiKey || apiKey === "your-openai-api-key-here") return [];

  const tone = userProfile?.preferredTone ?? "casual";
  const recentHistory = conversationHistory.slice(-6);

  const historyText = recentHistory
    .map((m) => `${m.sender === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n");

  const userContent = [
    userProfile?.name ? `User name: ${userProfile.name}` : "",
    userProfile?.personaSummary ? `User persona: ${userProfile.personaSummary}` : "",
    userProfile?.characteristicPhrases?.length
      ? `Phrases they commonly use: ${userProfile.characteristicPhrases.join(", ")}`
      : "",
    `Tone preference: ${tone}`,
    historyText ? `Recent conversation:\n${historyText}` : "",
    `The Cantonese speaker just said (English translation): "${lastUserMessage}"`,
    "Suggest 3 English replies the app owner might say in response, matching their personal voice and style.",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const model = (import.meta.env.VITE_OPENAI_MODEL as string) || "gpt-4o-mini";
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: 0.7,
        max_tokens: 400,
      }),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const raw: string = data.choices?.[0]?.message?.content ?? "[]";

    const parsed: SuggestionItem[] = JSON.parse(raw);
    return parsed.map((item, i) => ({
      id: `suggestion-${Date.now()}-${i}`,
      original: item.english,
      dialect: item.cantonese,
      pronunciation: item.pronunciation,
      isBookmarked: false,
      context: item.context,
    }));
  } catch {
    return [];
  }
}

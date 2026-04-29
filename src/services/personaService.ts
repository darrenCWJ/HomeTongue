import type { Message, UserProfile } from "../types";

const OPENAI_BASE = "https://api.openai.com/v1";

const BASE_SYSTEM_PROMPT = `You are building a user persona profile for a language learning app. The user does not speak Cantonese — they are learning to communicate with Cantonese speakers through an AI translation assistant.

Analyse the user's replies in the conversation provided and merge your observations into the existing persona. Focus on:
- Communication style (brief/verbose, direct/indirect, question-asker vs statement-maker)
- Personality traits (e.g. warm, humorous, reserved, practical, curious)
- Recurring topics or interests
- Characteristic phrases or words they tend to use
- How they typically open or close an exchange

Return ONLY a JSON object (no markdown, no explanation):
{
  "personaSummary": "<A natural 2-3 sentence paragraph describing this person's communication style and personality>",
  "characteristicPhrases": ["<phrase1>", "<phrase2>", "<phrase3>"]
}`;

interface PersonaResult {
  personaSummary: string;
  characteristicPhrases: string[];
}

export async function updatePersona(
  sessionMessages: Message[],
  currentProfile: UserProfile
): Promise<PersonaResult | null> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (!apiKey || apiKey === "your-openai-api-key-here") return null;

  const userReplies = sessionMessages.filter((m) => m.sender === "user");
  if (userReplies.length < 2) return null;

  const model = (import.meta.env.VITE_OPENAI_MODEL as string | undefined) ?? "gpt-4o-mini";

  const activePersona = currentProfile.activePersona ?? "personal";
  const activePersonaProfile = currentProfile.personaProfiles?.[activePersona];
  const existingSummary = activePersonaProfile?.personaSummary ?? currentProfile.personaSummary;
  const existingPhrases = activePersonaProfile?.characteristicPhrases ?? currentProfile.characteristicPhrases;
  const jobTitle = activePersona === "work" ? currentProfile.personaProfiles?.work?.jobTitle : undefined;

  const workContext = jobTitle
    ? `The user works as a ${jobTitle}. Focus on professional communication style relevant to their role.`
    : "";

  const systemPrompt = workContext
    ? `${BASE_SYSTEM_PROMPT}\n\n${workContext}`
    : BASE_SYSTEM_PROMPT;

  const formattedReplies = userReplies.map((m) => `- "${m.text}"`).join("\n");

  const userContent = [
    currentProfile.name ? `User name: ${currentProfile.name}` : "",
    `Existing persona:\n${existingSummary ?? "No persona established yet"}`,
    `Existing characteristic phrases: ${(existingPhrases ?? []).join(", ") || "none"}`,
    `User's replies in this session:\n${formattedReplies}`,
    "Update the persona based on all observations so far.",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.4,
        max_tokens: 300,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const raw: string = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as PersonaResult;

    if (!parsed.personaSummary) return null;
    return {
      personaSummary: parsed.personaSummary,
      characteristicPhrases: Array.isArray(parsed.characteristicPhrases)
        ? parsed.characteristicPhrases.slice(0, 6)
        : [],
    };
  } catch {
    return null;
  }
}

import type { TourPageId } from "@/types";

export type TourPlacement = "top" | "bottom" | "left" | "right";

export interface TourStep {
  target: string;
  title: string;
  description: string;
  placement: TourPlacement;
}

export const TOUR_STEPS: Record<TourPageId, TourStep[]> = {
  chat: [
    {
      target: "chat-persona-selector",
      title: "Switch Persona",
      description: "Toggle between Personal and Work modes for context-specific translations.",
      placement: "bottom",
    },
    {
      target: "chat-dialect-selector",
      title: "Choose Dialect",
      description: "Select which dialect you want to translate into.",
      placement: "bottom",
    },
    {
      target: "chat-save-conversation",
      title: "Save Conversation",
      description: "Save your chat to review later or convert into a lesson.",
      placement: "bottom",
    },
    {
      target: "chat-message-bubble",
      title: "Press & Hold to Edit",
      description: "Long-press any message bubble to edit the text and save it as a phrase.",
      placement: "bottom",
    },
    {
      target: "chat-replay-button",
      title: "Replay Audio",
      description: "Tap to hear the translation spoken aloud again.",
      placement: "bottom",
    },
    {
      target: "chat-bookmark-button",
      title: "Bookmark Phrase",
      description: "Save this phrase to your bookmarks for quick review later.",
      placement: "left",
    },
    {
      target: "chat-dialect-mic",
      title: "Dialect Mic",
      description: "Hold or tap to record someone speaking in dialect. We'll transcribe and translate it.",
      placement: "top",
    },
    {
      target: "chat-type-button",
      title: "Type Reply",
      description: "Type your reply in English — it gets translated and spoken in dialect.",
      placement: "top",
    },
    {
      target: "chat-english-mic",
      title: "English Mic",
      description: "Record your response in English. It gets translated and spoken in dialect.",
      placement: "top",
    },
  ],
  learn: [
    {
      target: "learn-language-filter",
      title: "Language Filter",
      description: "Filter lessons by the dialect you want to learn.",
      placement: "bottom",
    },
    {
      target: "learn-lessons-done",
      title: "Lessons Done",
      description: "Tracks how many lessons you have completed so far.",
      placement: "bottom",
    },
    {
      target: "learn-dialect-fluency",
      title: "Dialect Fluency",
      description: "Your average score across all lesson exams — measures how well you're learning.",
      placement: "bottom",
    },
    {
      target: "learn-word-of-day",
      title: "Word of the Day",
      description: "A daily vocabulary card to keep you practising. Tap play to hear it spoken.",
      placement: "bottom",
    },
    {
      target: "learn-tab-switcher",
      title: "Lesson Tabs",
      description: "Switch between Standard Lessons (structured courses) and Custom Conversation lessons (generated from your saved chats).",
      placement: "bottom",
    },
    {
      target: "learn-lesson-cards",
      title: "Standard Lessons",
      description: "Structured courses with levels, flashcards, and exams to build your vocabulary.",
      placement: "bottom",
    },
  ],
  bookmarks: [
    {
      target: "bookmarks-language-filter",
      title: "Dialect Filter",
      description: "Filter your saved content by dialect.",
      placement: "bottom",
    },
    {
      target: "bookmarks-tabs",
      title: "Phrases & Conversations",
      description: "Switch between your saved phrases and full conversation transcripts.",
      placement: "bottom",
    },
    {
      target: "bookmarks-tag-filter",
      title: "Filter by Tag",
      description: "Organize and filter your saved content by custom tags.",
      placement: "bottom",
    },
    {
      target: "bookmarks-phrase-card",
      title: "Manage Phrase",
      description: "Tap the tag icon to add or edit tags for this phrase. Tap the bookmark icon to unsave, or the speaker to replay audio.",
      placement: "bottom",
    },
    {
      target: "bookmarks-session-card",
      title: "Conversation Actions",
      description: "Tap the card to expand a preview. Tap \"More\" to edit the title, manage tags, or delete. Tap \"View\" to see the full transcript.",
      placement: "top",
    },
  ],
  profile: [
    {
      target: "profile-persona-switcher",
      title: "Active Persona",
      description: "Switch between Personal and Work to change how translations are styled.",
      placement: "bottom",
    },
    {
      target: "profile-voice-selection",
      title: "Voice Selection",
      description: "Pick the voice used for text-to-speech playback.",
      placement: "top",
    },
    {
      target: "profile-tour-replay",
      title: "Replay Tour",
      description: "Tap here anytime to see this guided tour again.",
      placement: "top",
    },
  ],
};

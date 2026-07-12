import type { Lesson, LessonCategory, LessonLevel } from "../types";
import { FOOD_LESSONS } from "./lessons/food";
import { GREETINGS_LESSONS } from "./lessons/greetings";
import { SLANG_LESSONS } from "./lessons/slang";
import { TRANSPORT_LESSONS } from "./lessons/transport";

/**
 * Returns the playable levels for a lesson.
 *
 * Defensive fallback: a lesson authored without a `levels` array still renders
 * as a single flashcard level built from its vocabulary, so no lesson content
 * ever disappears from the Learn UI.
 */
export function getLessonLevels(lesson: Lesson): LessonLevel[] {
  const levels = lesson.content.levels;
  if (levels && levels.length > 0) return levels;
  if (lesson.content.vocabulary.length === 0) return [];
  return [
    {
      level: 1,
      title: lesson.title,
      description: lesson.description,
      exerciseType: "flashcard",
      vocabulary: lesson.content.vocabulary,
    },
  ];
}

export const LESSON_CATEGORIES: LessonCategory[] = [
  {
    id: "greetings",
    title: "Greetings & Basics",
    description: "Essential phrases for everyday use",
    icon: "👋",
  },
  {
    id: "food",
    title: "Ordering Food",
    description: "Navigate restaurants with ease",
    icon: "🍜",
  },
  {
    id: "transport",
    title: "Getting Around",
    description: "Navigate the city like a local",
    icon: "🚇",
  },
  {
    id: "slang",
    title: "Street Slang",
    description: "Sound like a true local",
    icon: "🤙",
  },
];

// Lesson content lives in per-topic modules under src/data/lessons/ so each
// file stays under the 800-line cap enforced by scripts/check-file-sizes.mjs.
export const LESSONS: Lesson[] = [
  ...GREETINGS_LESSONS,
  ...FOOD_LESSONS,
  ...TRANSPORT_LESSONS,
  ...SLANG_LESSONS,
];

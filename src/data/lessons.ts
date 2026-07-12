import type { Lesson, LessonCategory, LessonLevel } from "../types";
import { NAN_TW_LESSON_CONTENT } from "./lessons/nan-TW";
import { YUE_HK_LESSON_CONTENT } from "./lessons/yue-HK";

/** Static lesson curriculum for one language pack. */
export interface LessonContent {
  categories: LessonCategory[];
  lessons: Lesson[];
}

/**
 * Per-language static lesson registry.
 *
 * Lesson id convention: yue-HK lesson ids are historical and unprefixed
 * ("greetings", "food-1", …) and MUST stay exactly as-is so existing
 * LessonProgress rows keep matching. Every FUTURE language must prefix its
 * lesson ids with its language code (e.g. "nan-greetings") so ids stay
 * globally unique and LessonProgress never needs a language column.
 */
const LESSON_CONTENT_BY_LANGUAGE: Readonly<Record<string, LessonContent>> = {
  "yue-HK": YUE_HK_LESSON_CONTENT,
  "nan-TW": NAN_TW_LESSON_CONTENT,
};

const EMPTY_LESSON_CONTENT: LessonContent = { categories: [], lessons: [] };

/**
 * Returns the static lesson curriculum for a language, or empty content for
 * languages that have no authored lessons yet (the Learn UI renders no
 * standard-lesson cards in that case rather than falling back to Cantonese).
 */
export function getLessonContent(languageCode: string): LessonContent {
  return LESSON_CONTENT_BY_LANGUAGE[languageCode] ?? EMPTY_LESSON_CONTENT;
}

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

/**
 * @deprecated yue-HK snapshot kept for backward compatibility. Use
 * `getLessonContent(languageCode).categories` with the active language code.
 */
export const LESSON_CATEGORIES: LessonCategory[] = YUE_HK_LESSON_CONTENT.categories;

/**
 * @deprecated yue-HK snapshot kept for backward compatibility. Use
 * `getLessonContent(languageCode).lessons` with the active language code.
 */
export const LESSONS: Lesson[] = YUE_HK_LESSON_CONTENT.lessons;

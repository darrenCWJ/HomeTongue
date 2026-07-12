import type { Lesson, LessonCategory } from "../../../types";
import { NAN_FOOD_LESSONS } from "./food";
import { NAN_GREETINGS_LESSONS } from "./greetings";

// Static lesson curriculum for the EXPERIMENTAL Taiwanese Hokkien (nan-TW)
// language pack. Registered in src/data/lessons.ts (getLessonContent).
//
// ⚠️ Sample starter content pending native-speaker review — see the notes in
// greetings.ts / food.ts.
//
// Lesson id convention (src/data/lessons.ts): every non-yue lesson id MUST be
// prefixed with the language code ("nan-…") so ids stay globally unique and
// LessonProgress never needs a language column.

const NAN_TW_LESSON_CATEGORIES: LessonCategory[] = [
  {
    id: "nan-basics",
    title: "Hokkien Basics",
    description: "Everyday Taiwanese Hokkien, from hello to the bill",
    icon: "🏮",
  },
];

const NAN_TW_LESSONS: Lesson[] = [...NAN_GREETINGS_LESSONS, ...NAN_FOOD_LESSONS];

export const NAN_TW_LESSON_CONTENT: { categories: LessonCategory[]; lessons: Lesson[] } = {
  categories: NAN_TW_LESSON_CATEGORIES,
  lessons: NAN_TW_LESSONS,
};

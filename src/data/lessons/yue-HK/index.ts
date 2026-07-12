import type { Lesson, LessonCategory } from "../../../types";
import { FOOD_LESSONS } from "./food";
import { GREETINGS_LESSONS } from "./greetings";
import { SLANG_LESSONS } from "./slang";
import { TRANSPORT_LESSONS } from "./transport";

// Static lesson curriculum for the Cantonese (yue-HK) language pack.
// Registered in src/data/lessons.ts (getLessonContent). Lesson ids here are
// historical and unprefixed ("greetings", "food-1", …) — they MUST stay
// exactly as-is so existing LessonProgress rows keep matching.

const YUE_HK_LESSON_CATEGORIES: LessonCategory[] = [
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

// Lesson content lives in per-topic modules in this folder so each file stays
// under the 800-line cap enforced by scripts/check-file-sizes.mjs.
const YUE_HK_LESSONS: Lesson[] = [
  ...GREETINGS_LESSONS,
  ...FOOD_LESSONS,
  ...TRANSPORT_LESSONS,
  ...SLANG_LESSONS,
];

export const YUE_HK_LESSON_CONTENT: { categories: LessonCategory[]; lessons: Lesson[] } = {
  categories: YUE_HK_LESSON_CATEGORIES,
  lessons: YUE_HK_LESSONS,
};

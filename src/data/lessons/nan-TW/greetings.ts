import type { Lesson } from "../../../types";

// ⚠️ SAMPLE STARTER CONTENT — Taiwanese Hokkien (nan-TW), pending
// native-speaker review. Han spellings follow Taiwan MOE recommended
// orthography where possible; romanization is Tâi-lô.
//
// TODO(field rename): VocabItem.cantonese / .pronunciation are legacy field
// names — they hold the DIALECT text (Hokkien Han script) and its Tâi-lô
// romanization here. Rename to dialectText/romanization across VocabItem
// consumers in a dedicated migration.
export const NAN_GREETINGS_LESSONS: Lesson[] = [
  {
    id: "nan-greetings",
    categoryId: "nan-basics",
    title: "Greetings & Basics",
    description: "Say hello and introduce yourself in Taiwanese Hokkien",
    difficulty: "beginner",
    tags: ["greeting", "polite", "daily", "introduction"],
    content: {
      vocabulary: [
        {
          english: "Hello",
          cantonese: "你好",
          pronunciation: "lí hó",
          exampleSentence: "你好，我是{{name}}。",
        },
        {
          english: "Have you eaten? (friendly greeting)",
          cantonese: "食飽未？",
          pronunciation: "tsia̍h pá buē?",
          exampleSentence: "阿姨，食飽未？",
        },
        {
          english: "Thank you",
          cantonese: "多謝",
          pronunciation: "to-siā",
          exampleSentence: "多謝你來看我。",
        },
        {
          english: "Sorry / Excuse me",
          cantonese: "歹勢",
          pronunciation: "pháinn-sè",
          exampleSentence: "歹勢，我來晏矣。",
        },
        {
          english: "Goodbye",
          cantonese: "再會",
          pronunciation: "tsài-huē",
          exampleSentence: "我先走矣，再會！",
        },
        {
          english: "What's your name?",
          cantonese: "你叫啥物名？",
          pronunciation: "lí kiò siánn-mih miâ?",
        },
        {
          english: "My name is...",
          cantonese: "我叫…",
          pronunciation: "guá kiò...",
          exampleSentence: "我叫{{name}}，請多指教。",
        },
        {
          english: "Nice to meet you",
          cantonese: "真歡喜熟似你",
          pronunciation: "tsin huann-hí si̍k-sāi lí",
        },
      ],
      levels: [
        {
          level: 1,
          title: "First Hellos",
          description: "The four phrases every visit starts with",
          exerciseType: "flashcard",
          vocabulary: [
            {
              english: "Hello",
              cantonese: "你好",
              pronunciation: "lí hó",
              exampleSentence: "你好，我是{{name}}。",
            },
            {
              english: "Have you eaten? (friendly greeting)",
              cantonese: "食飽未？",
              pronunciation: "tsia̍h pá buē?",
              exampleSentence: "阿姨，食飽未？",
            },
            {
              english: "Thank you",
              cantonese: "多謝",
              pronunciation: "to-siā",
              exampleSentence: "多謝你來看我。",
            },
            {
              english: "Goodbye",
              cantonese: "再會",
              pronunciation: "tsài-huē",
              exampleSentence: "我先走矣，再會！",
            },
          ],
        },
        {
          level: 2,
          title: "Greet It Right",
          description: "Quiz yourself on all eight greeting phrases",
          exerciseType: "multiple-choice",
          vocabulary: [
            { english: "Hello", cantonese: "你好", pronunciation: "lí hó" },
            {
              english: "Have you eaten? (friendly greeting)",
              cantonese: "食飽未？",
              pronunciation: "tsia̍h pá buē?",
            },
            { english: "Thank you", cantonese: "多謝", pronunciation: "to-siā" },
            { english: "Sorry / Excuse me", cantonese: "歹勢", pronunciation: "pháinn-sè" },
            { english: "Goodbye", cantonese: "再會", pronunciation: "tsài-huē" },
            {
              english: "What's your name?",
              cantonese: "你叫啥物名？",
              pronunciation: "lí kiò siánn-mih miâ?",
            },
            { english: "My name is...", cantonese: "我叫…", pronunciation: "guá kiò..." },
            {
              english: "Nice to meet you",
              cantonese: "真歡喜熟似你",
              pronunciation: "tsin huann-hí si̍k-sāi lí",
            },
          ],
        },
      ],
    },
  },
];

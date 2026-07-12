import type { Lesson } from "../../types";

// Getting Around lessons — extracted from lessons.ts to stay under the 800-line file cap
// (scripts/check-file-sizes.mjs). Aggregated in src/data/lessons.ts.
export const TRANSPORT_LESSONS: Lesson[] = [
  {
    id: "transport-1",
    categoryId: "transport",
    title: "Getting Directions",
    description: "Ask for and understand directions",
    difficulty: "beginner",
    tags: ["navigation", "MTR", "taxi"],
    content: {
      vocabulary: [
        {
          english: "Where is...?",
          cantonese: "...喺邊度？",
          pronunciation: "...hai2 bin1 dou6?",
          exampleSentence: "廁所喺邊度？",
        },
        {
          english: "How do I get to...?",
          cantonese: "點去...？",
          pronunciation: "dim2 heoi3...?",
          exampleSentence: "點去中環地鐵站？",
        },
        { english: "MTR / Subway", cantonese: "地鐵", pronunciation: "dei6 tit3" },
        { english: "Bus", cantonese: "巴士", pronunciation: "baa1 si2" },
        { english: "Taxi", cantonese: "的士", pronunciation: "dik1 si2", exampleSentence: "唔該去尖沙咀。" },
        { english: "Here", cantonese: "呢度", pronunciation: "ni1 dou6" },
        { english: "Turn left", cantonese: "向左轉", pronunciation: "hoeng3 zo2 zyun3" },
        { english: "Turn right", cantonese: "向右轉", pronunciation: "hoeng3 jau6 zyun3" },
        { english: "Go straight", cantonese: "直行", pronunciation: "zik6 haang4" },
      ],
      levels: [
        {
          level: 1,
          title: "Asking the Way",
          description: "Ask where things are and how to get there",
          exerciseType: "flashcard",
          vocabulary: [
            {
              english: "Where is...?",
              cantonese: "...喺邊度？",
              pronunciation: "...hai2 bin1 dou6?",
              exampleSentence: "廁所喺邊度？",
            },
            {
              english: "How do I get to...?",
              cantonese: "點去...？",
              pronunciation: "dim2 heoi3...?",
              exampleSentence: "點去中環地鐵站？",
            },
            { english: "MTR / Subway", cantonese: "地鐵", pronunciation: "dei6 tit3" },
            { english: "Bus", cantonese: "巴士", pronunciation: "baa1 si2" },
            {
              english: "Taxi",
              cantonese: "的士",
              pronunciation: "dik1 si2",
              exampleSentence: "唔該去尖沙咀。",
            },
          ],
        },
        {
          level: 2,
          title: "Following Directions",
          description: "Understand the answer when someone points the way",
          exerciseType: "matching",
          vocabulary: [
            { english: "Here", cantonese: "呢度", pronunciation: "ni1 dou6" },
            { english: "Turn left", cantonese: "向左轉", pronunciation: "hoeng3 zo2 zyun3" },
            { english: "Turn right", cantonese: "向右轉", pronunciation: "hoeng3 jau6 zyun3" },
            { english: "Go straight", cantonese: "直行", pronunciation: "zik6 haang4" },
          ],
        },
        {
          level: 3,
          title: "Find Your Way",
          description: "Quiz yourself on every direction phrase",
          exerciseType: "multiple-choice",
          vocabulary: [
            {
              english: "Where is...?",
              cantonese: "...喺邊度？",
              pronunciation: "...hai2 bin1 dou6?",
              exampleSentence: "廁所喺邊度？",
            },
            {
              english: "How do I get to...?",
              cantonese: "點去...？",
              pronunciation: "dim2 heoi3...?",
              exampleSentence: "點去中環地鐵站？",
            },
            { english: "MTR / Subway", cantonese: "地鐵", pronunciation: "dei6 tit3" },
            { english: "Bus", cantonese: "巴士", pronunciation: "baa1 si2" },
            {
              english: "Taxi",
              cantonese: "的士",
              pronunciation: "dik1 si2",
              exampleSentence: "唔該去尖沙咀。",
            },
            { english: "Here", cantonese: "呢度", pronunciation: "ni1 dou6" },
            { english: "Turn left", cantonese: "向左轉", pronunciation: "hoeng3 zo2 zyun3" },
            { english: "Turn right", cantonese: "向右轉", pronunciation: "hoeng3 jau6 zyun3" },
            { english: "Go straight", cantonese: "直行", pronunciation: "zik6 haang4" },
          ],
        },
      ],
    },
  },
  {
    id: "transport-2",
    categoryId: "transport",
    title: "Octopus & Tickets",
    description: "Navigate fares and payment",
    difficulty: "beginner",
    tags: ["payment", "transport card"],
    content: {
      vocabulary: [
        { english: "Octopus card", cantonese: "八達通", pronunciation: "baat3 daat6 tung1" },
        { english: "Add value", cantonese: "增值", pronunciation: "zang1 zik6" },
        { english: "Exit", cantonese: "出口", pronunciation: "ceot1 hau2" },
        { english: "Entrance", cantonese: "入口", pronunciation: "jap6 hau2" },
        { english: "Platform", cantonese: "月台", pronunciation: "jyut6 toi4" },
        { english: "Last train", cantonese: "尾班車", pronunciation: "mei5 baan1 ce1" },
      ],
      levels: [
        {
          level: 1,
          title: "Around the Station",
          description: "Learn the words you see and use at every MTR station",
          exerciseType: "flashcard",
          vocabulary: [
            { english: "Octopus card", cantonese: "八達通", pronunciation: "baat3 daat6 tung1" },
            { english: "Add value", cantonese: "增值", pronunciation: "zang1 zik6" },
            { english: "Exit", cantonese: "出口", pronunciation: "ceot1 hau2" },
            { english: "Entrance", cantonese: "入口", pronunciation: "jap6 hau2" },
            { english: "Platform", cantonese: "月台", pronunciation: "jyut6 toi4" },
            { english: "Last train", cantonese: "尾班車", pronunciation: "mei5 baan1 ce1" },
          ],
        },
        {
          level: 2,
          title: "Match the Signs",
          description: "Match each station sign to its meaning",
          exerciseType: "matching",
          vocabulary: [
            { english: "Octopus card", cantonese: "八達通", pronunciation: "baat3 daat6 tung1" },
            { english: "Add value", cantonese: "增值", pronunciation: "zang1 zik6" },
            { english: "Exit", cantonese: "出口", pronunciation: "ceot1 hau2" },
            { english: "Entrance", cantonese: "入口", pronunciation: "jap6 hau2" },
            { english: "Platform", cantonese: "月台", pronunciation: "jyut6 toi4" },
            { english: "Last train", cantonese: "尾班車", pronunciation: "mei5 baan1 ce1" },
          ],
        },
        {
          level: 3,
          title: "Tap & Go",
          description: "Quiz yourself before you ride",
          exerciseType: "multiple-choice",
          vocabulary: [
            { english: "Octopus card", cantonese: "八達通", pronunciation: "baat3 daat6 tung1" },
            { english: "Add value", cantonese: "增值", pronunciation: "zang1 zik6" },
            { english: "Exit", cantonese: "出口", pronunciation: "ceot1 hau2" },
            { english: "Entrance", cantonese: "入口", pronunciation: "jap6 hau2" },
            { english: "Platform", cantonese: "月台", pronunciation: "jyut6 toi4" },
            { english: "Last train", cantonese: "尾班車", pronunciation: "mei5 baan1 ce1" },
          ],
        },
      ],
    },
  },
];

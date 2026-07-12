import type { Lesson } from "../../../types";

// ⚠️ SAMPLE STARTER CONTENT — Taiwanese Hokkien (nan-TW), pending
// native-speaker review. Han spellings follow Taiwan MOE recommended
// orthography where possible; romanization is Tâi-lô.
//
// TODO(field rename): VocabItem.cantonese / .pronunciation are legacy field
// names — they hold the DIALECT text (Hokkien Han script) and its Tâi-lô
// romanization here. Rename to dialectText/romanization across VocabItem
// consumers in a dedicated migration.
export const NAN_FOOD_LESSONS: Lesson[] = [
  {
    id: "nan-food",
    categoryId: "nan-basics",
    title: "Eating Out",
    description: "Order food and settle the bill at a Taiwanese eatery",
    difficulty: "beginner",
    tags: ["food", "restaurant", "money"],
    content: {
      vocabulary: [
        {
          english: "I want this",
          cantonese: "我欲這个",
          pronunciation: "guá beh tsit-ê",
          exampleSentence: "頭家，我欲這个。",
        },
        {
          english: "How much?",
          cantonese: "偌濟錢？",
          pronunciation: "guā-tsē tsînn?",
          exampleSentence: "這个偌濟錢？",
        },
        {
          english: "Delicious",
          cantonese: "好食",
          pronunciation: "hó-tsia̍h",
          exampleSentence: "這碗麵真好食！",
        },
        {
          english: "Boss / shopkeeper",
          cantonese: "頭家",
          pronunciation: "thâu-ke",
          exampleSentence: "頭家，借問一下。",
        },
        {
          english: "Bill, please",
          cantonese: "算數",
          pronunciation: "sǹg-siàu",
          exampleSentence: "頭家，算數！",
        },
        { english: "Water", cantonese: "水", pronunciation: "tsuí" },
        { english: "Tea", cantonese: "茶", pronunciation: "tê" },
        {
          english: "I'm hungry",
          cantonese: "我腹肚枵",
          pronunciation: "guá pak-tóo iau",
          exampleSentence: "我腹肚枵矣，來去食飯。",
        },
      ],
      levels: [
        {
          level: 1,
          title: "Order Essentials",
          description: "The core phrases for ordering and paying",
          exerciseType: "flashcard",
          vocabulary: [
            {
              english: "I want this",
              cantonese: "我欲這个",
              pronunciation: "guá beh tsit-ê",
              exampleSentence: "頭家，我欲這个。",
            },
            {
              english: "How much?",
              cantonese: "偌濟錢？",
              pronunciation: "guā-tsē tsînn?",
              exampleSentence: "這个偌濟錢？",
            },
            {
              english: "Bill, please",
              cantonese: "算數",
              pronunciation: "sǹg-siàu",
              exampleSentence: "頭家，算數！",
            },
            {
              english: "Delicious",
              cantonese: "好食",
              pronunciation: "hó-tsia̍h",
              exampleSentence: "這碗麵真好食！",
            },
          ],
        },
        {
          level: 2,
          title: "Order It Right",
          description: "Quiz yourself on all eight eating-out phrases",
          exerciseType: "multiple-choice",
          vocabulary: [
            { english: "I want this", cantonese: "我欲這个", pronunciation: "guá beh tsit-ê" },
            { english: "How much?", cantonese: "偌濟錢？", pronunciation: "guā-tsē tsînn?" },
            { english: "Delicious", cantonese: "好食", pronunciation: "hó-tsia̍h" },
            { english: "Boss / shopkeeper", cantonese: "頭家", pronunciation: "thâu-ke" },
            { english: "Bill, please", cantonese: "算數", pronunciation: "sǹg-siàu" },
            { english: "Water", cantonese: "水", pronunciation: "tsuí" },
            { english: "Tea", cantonese: "茶", pronunciation: "tê" },
            { english: "I'm hungry", cantonese: "我腹肚枵", pronunciation: "guá pak-tóo iau" },
          ],
        },
      ],
    },
  },
];

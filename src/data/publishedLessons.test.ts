import { describe, test, expect, afterEach } from "vitest";
import {
  getPublishedLessonContent,
  getPublishedLessonsVersion,
  normalizePublishedLessonContent,
  setPublishedLessonContent,
  subscribeToPublishedLessons,
} from "./publishedLessons";
import { getLessonContent, type LessonContent } from "./lessons";

const SAMPLE_CONTENT: LessonContent = {
  categories: [{ id: "pub-cat", title: "Published", description: "From the DB", icon: "📚" }],
  lessons: [
    {
      id: "pub-lesson",
      categoryId: "pub-cat",
      title: "Published Lesson",
      description: "Replaces static content",
      difficulty: "beginner",
      tags: [],
      content: {
        vocabulary: [{ english: "Hello", dialect: "你好", romanization: "nei5 hou2" }],
      },
    },
  ],
};

afterEach(() => {
  setPublishedLessonContent({});
});

describe("published lesson store", () => {
  test("returns undefined for languages without a published row", () => {
    expect(getPublishedLessonContent("yue-HK")).toBeUndefined();
  });

  test("a published row replaces that language's static content entirely", () => {
    const staticYue = getLessonContent("yue-HK");
    expect(staticYue.lessons.length).toBeGreaterThan(0);

    setPublishedLessonContent({ "yue-HK": SAMPLE_CONTENT });

    expect(getLessonContent("yue-HK")).toEqual(SAMPLE_CONTENT);
    // Languages WITHOUT a published row keep their static content.
    expect(getLessonContent("nan-TW").lessons.length).toBeGreaterThan(0);
    expect(getLessonContent("nan-TW").lessons[0].id).not.toBe("pub-lesson");

    // Clearing (sign-out) falls back to static.
    setPublishedLessonContent({});
    expect(getLessonContent("yue-HK")).toEqual(staticYue);
  });

  test("notifies subscribers and bumps the version on swap", () => {
    let notifications = 0;
    const unsubscribe = subscribeToPublishedLessons(() => {
      notifications += 1;
    });
    const before = getPublishedLessonsVersion();

    setPublishedLessonContent({ "yue-HK": SAMPLE_CONTENT });
    expect(notifications).toBe(1);
    expect(getPublishedLessonsVersion()).toBe(before + 1);

    unsubscribe();
    setPublishedLessonContent({});
    expect(notifications).toBe(1);
  });

  test("clearing an already-empty store does not notify", () => {
    let notifications = 0;
    const unsubscribe = subscribeToPublishedLessons(() => {
      notifications += 1;
    });
    setPublishedLessonContent({});
    expect(notifications).toBe(0);
    unsubscribe();
  });
});

describe("normalizePublishedLessonContent", () => {
  test("returns null for values without categories/lessons arrays", () => {
    expect(normalizePublishedLessonContent(null)).toBeNull();
    expect(normalizePublishedLessonContent("nope")).toBeNull();
    expect(normalizePublishedLessonContent({})).toBeNull();
    expect(normalizePublishedLessonContent({ categories: [], lessons: "bad" })).toBeNull();
    expect(normalizePublishedLessonContent({ categories: {}, lessons: [] })).toBeNull();
  });

  test("passes through content already in the current shape", () => {
    const normalized = normalizePublishedLessonContent(SAMPLE_CONTENT);
    expect(normalized).toEqual(SAMPLE_CONTENT);
  });

  test("normalizes legacy vocab keys (cantonese/pronunciation/jyutping) on read", () => {
    const legacy = {
      categories: [],
      lessons: [
        {
          id: "l1",
          categoryId: "c1",
          title: "t",
          description: "d",
          difficulty: "beginner",
          tags: [],
          content: {
            vocabulary: [
              { english: "Hello", cantonese: "你好", pronunciation: "nei5 hou2" },
              { english: "Bye", cantonese: "拜拜", jyutping: "baai1 baai3" },
            ],
            levels: [
              {
                level: 1,
                title: "L1",
                description: "d",
                exerciseType: "conversation",
                vocabulary: [{ english: "Hello", cantonese: "你好", pronunciation: "nei5 hou2" }],
                conversation: [
                  { speaker: "them", english: "Hi", cantonese: "哈囉", pronunciation: "haa1 lo3" },
                ],
              },
            ],
          },
        },
      ],
    };

    const normalized = normalizePublishedLessonContent(legacy);
    expect(normalized).not.toBeNull();
    const lesson = normalized!.lessons[0];
    expect(lesson.content.vocabulary[0]).toEqual({
      english: "Hello",
      dialect: "你好",
      romanization: "nei5 hou2",
    });
    expect(lesson.content.vocabulary[1]).toEqual({
      english: "Bye",
      dialect: "拜拜",
      romanization: "baai1 baai3",
    });
    const level = lesson.content.levels![0];
    expect(level.vocabulary[0].dialect).toBe("你好");
    expect(level.conversation![0]).toEqual({
      speaker: "them",
      english: "Hi",
      dialect: "哈囉",
      romanization: "haa1 lo3",
    });
  });

  test("current-name fields win over legacy duplicates", () => {
    const mixed = {
      categories: [],
      lessons: [
        {
          id: "l1",
          categoryId: "c1",
          title: "t",
          description: "d",
          difficulty: "beginner",
          tags: [],
          content: {
            vocabulary: [
              { english: "Hi", dialect: "新", romanization: "san1", cantonese: "舊", pronunciation: "gau6" },
            ],
          },
        },
      ],
    };
    const item = normalizePublishedLessonContent(mixed)!.lessons[0].content.vocabulary[0];
    expect(item.dialect).toBe("新");
    expect(item.romanization).toBe("san1");
  });

  test("skips malformed lessons and vocab entries instead of crashing", () => {
    const messy = {
      categories: ["not-a-record", { id: "c1", title: "ok", description: "", icon: "x" }],
      lessons: [
        null,
        { id: "no-content" },
        {
          id: "ok",
          categoryId: "c1",
          title: "t",
          description: "d",
          difficulty: "beginner",
          tags: [],
          content: { vocabulary: [42, { english: "Hi", dialect: "hi", romanization: "hi" }] },
        },
      ],
    };
    const normalized = normalizePublishedLessonContent(messy);
    expect(normalized).not.toBeNull();
    expect(normalized!.categories).toHaveLength(1);
    expect(normalized!.lessons).toHaveLength(1);
    expect(normalized!.lessons[0].content.vocabulary).toHaveLength(1);
  });
});

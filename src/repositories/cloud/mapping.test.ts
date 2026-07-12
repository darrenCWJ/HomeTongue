import { describe, expect, test } from "vitest";
import type {
  ConversationLesson,
  LessonProgress,
  Phrase,
  PhraseReviewState,
  Session,
  Tag,
  UserProfile,
} from "../../types";
import {
  conversationLessonToRow,
  lessonProgressToRow,
  phraseToRow,
  profileToRow,
  reviewStateToRow,
  rowToConversationLesson,
  rowToLessonProgress,
  rowToPhrase,
  rowToProfile,
  rowToReviewState,
  rowToSession,
  rowToTag,
  sessionToRow,
  tagToRow,
  type SessionRow,
} from "./mapping";

const USER_ID = "11111111-2222-3333-4444-555555555555";

describe("phrase mapping", () => {
  test("round-trips a fully populated phrase", () => {
    // Arrange
    const phrase: Phrase = {
      id: "aaaa1111-0000-0000-0000-000000000001",
      original: "Where is the bathroom?",
      dialect: "廁所喺邊度？",
      pronunciation: "ci3 so2 hai2 bin1 dou6",
      isBookmarked: true,
      context: "Asking for directions",
      audioDataUrl: "data:audio/mp3;base64,AAA=",
      audioDataUrls: ["data:audio/mp3;base64,AAA=", "data:audio/mp3;base64,BBB="],
      tags: ["p-greetings", "p-transport"],
      createdAt: "2026-07-01T10:00:00.000Z",
    };

    // Act
    const row = phraseToRow(phrase, USER_ID);
    const restored = rowToPhrase(row);

    // Assert
    expect(row.user_id).toBe(USER_ID);
    expect(restored).toStrictEqual(phrase);
  });

  test("round-trips a phrase with all optional fields absent", () => {
    // Arrange
    const phrase: Phrase = {
      id: "aaaa1111-0000-0000-0000-000000000002",
      original: "Thank you",
      dialect: "唔該",
      pronunciation: "m4 goi1",
      isBookmarked: false,
      context: "",
    };

    // Act
    const row = phraseToRow(phrase, USER_ID);
    const restored = rowToPhrase(row);

    // Assert
    expect(row.audio_data_url).toBeNull();
    expect(row.audio_data_urls).toBeNull();
    expect(row.tags).toBeNull();
    expect(row.created_at).toBeNull();
    expect(restored).toStrictEqual(phrase);
  });
});

describe("session mapping", () => {
  test("round-trips a fully populated session", () => {
    // Arrange
    const session: Session = {
      id: "bbbb1111-0000-0000-0000-000000000001",
      title: "Dinner with grandma",
      date: "7/1/2026",
      createdAt: "2026-07-01T18:30:00.000Z",
      messages: [
        {
          id: "m1",
          sender: "user",
          text: "How do I say hello?",
          dialectText: "你好呀",
          pronunciation: "nei5 hou2 aa3",
          variants: {
            formal: { text: "您好", pronunciation: "nei5 hou2" },
            casual: { text: "你好呀", pronunciation: "nei5 hou2 aa3" },
            slang: { text: "哈囉", pronunciation: "haa1 lo3" },
          },
          predictedResponse: "你好！你係邊位？",
        },
        {
          id: "m2",
          sender: "bot",
          text: "你好",
          dialectText: "你好",
          pronunciation: "nei5 hou2",
          rating: "up",
        },
      ],
      persona: "personal",
      tags: ["s-daily"],
    };

    // Act
    const restored = rowToSession(sessionToRow(session, USER_ID));

    // Assert
    expect(restored).toStrictEqual(session);
  });

  test("normalizes a legacy row's cantoneseText into dialectText and never writes it back", () => {
    // Arrange — jsonb rows written before the dialect-neutral rename stored
    // the dialect line under `cantoneseText`
    const legacyRow: SessionRow = {
      id: "bbbb1111-0000-0000-0000-000000000003",
      user_id: USER_ID,
      title: "Old cloud session",
      date_display: "6/1/2026",
      messages: [
        {
          id: "m1",
          sender: "user",
          text: "How do I say hello?",
          cantoneseText: "你好呀",
          pronunciation: "nei5 hou2 aa3",
        },
        { id: "m2", sender: "bot", text: "你好", englishTranslation: "Hello" },
      ],
      persona: "personal",
      tags: null,
      created_at: "2026-06-01T10:00:00.000Z",
    };

    // Act
    const restored = rowToSession(legacyRow);
    const rewritten = sessionToRow(restored, USER_ID);

    // Assert — legacy field round-trips into dialectText...
    expect(restored.messages[0].dialectText).toBe("你好呀");
    expect(restored.messages[0]).not.toHaveProperty("cantoneseText");
    // ...untouched messages survive structurally unchanged...
    expect(restored.messages[1]).toStrictEqual({
      id: "m2",
      sender: "bot",
      text: "你好",
      englishTranslation: "Hello",
    });
    // ...and the write path never re-emits the legacy key.
    expect(rewritten.messages[0]).not.toHaveProperty("cantoneseText");
    expect(rewritten.messages[0].dialectText).toBe("你好呀");
  });

  test("round-trips a legacy session without optional fields", () => {
    // Arrange — old records have only a locale display date and messages
    const session: Session = {
      id: "bbbb1111-0000-0000-0000-000000000002",
      date: "12/31/2025",
      messages: [],
    };

    // Act
    const row = sessionToRow(session, USER_ID);
    const restored = rowToSession(row);

    // Assert
    expect(row.title).toBeNull();
    expect(row.created_at).toBeNull();
    expect(row.persona).toBeNull();
    expect(row.tags).toBeNull();
    expect(restored).toStrictEqual(session);
  });
});

describe("profile mapping", () => {
  test("round-trips a fully populated profile (id maps to user_id)", () => {
    // Arrange — in cloud mode the profile id IS the auth user id
    const profile: UserProfile = {
      id: USER_ID,
      name: "Darren",
      preferredDialect: "Cantonese",
      preferredTone: "casual",
      toneOverrideEnabled: true,
      personalityNotes: "Learning for family dinners",
      conversationCount: 12,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      personaSummary: "Friendly and informal",
      characteristicPhrases: ["唔該", "早晨"],
      activePersona: "work",
      personaProfiles: {
        personal: { tone: "casual", personaSummary: "Chatty" },
        work: { tone: "formal", jobTitle: "Nurse", characteristicPhrases: ["請問"] },
      },
      preferredVoiceId: "zephyr",
      customVoiceId: "custom-123",
      suggestedRepliesEnabled: false,
      tourCompleted: { chat: true, learn: false },
    };

    // Act
    const row = profileToRow(profile, USER_ID);
    const restored = rowToProfile(row);

    // Assert
    expect(row.user_id).toBe(USER_ID);
    expect(restored).toStrictEqual(profile);
  });

  test("round-trips a minimal profile with optional fields absent", () => {
    // Arrange
    const profile: UserProfile = {
      id: USER_ID,
      name: "",
      preferredDialect: "Cantonese",
      preferredTone: "formal",
      toneOverrideEnabled: false,
      personalityNotes: "",
      conversationCount: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    // Act
    const row = profileToRow(profile, USER_ID);
    const restored = rowToProfile(row);

    // Assert
    expect(row.persona_summary).toBeNull();
    expect(row.persona_profiles).toBeNull();
    expect(row.tour_completed).toBeNull();
    expect(row.suggested_replies_enabled).toBeNull();
    expect(restored).toStrictEqual(profile);
  });

  test("preserves suggestedRepliesEnabled=false (falsy but present)", () => {
    // Arrange
    const profile: UserProfile = {
      id: USER_ID,
      name: "x",
      preferredDialect: "Cantonese",
      preferredTone: "slang",
      toneOverrideEnabled: false,
      personalityNotes: "",
      conversationCount: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      suggestedRepliesEnabled: false,
    };

    // Act
    const restored = rowToProfile(profileToRow(profile, USER_ID));

    // Assert
    expect(restored.suggestedRepliesEnabled).toBe(false);
    expect(restored).toStrictEqual(profile);
  });

  test("round-trips ML consent fields when granted", () => {
    // Arrange
    const profile: UserProfile = {
      id: USER_ID,
      name: "Darren",
      preferredDialect: "Cantonese",
      preferredTone: "casual",
      toneOverrideEnabled: false,
      personalityNotes: "",
      conversationCount: 3,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      dataCollectionConsent: true,
      audioRetentionConsent: true,
      consentUpdatedAt: "2026-07-01T09:00:00.000Z",
    };

    // Act
    const row = profileToRow(profile, USER_ID);
    const restored = rowToProfile(row);

    // Assert
    expect(row.data_collection_consent).toBe(true);
    expect(row.audio_retention_consent).toBe(true);
    expect(row.consent_updated_at).toBe("2026-07-01T09:00:00.000Z");
    expect(restored).toStrictEqual(profile);
  });

  test("maps absent consent to NOT NULL false columns and omits them on the way back", () => {
    // Arrange — consent columns are NOT NULL DEFAULT false, so undefined must
    // never serialize to null; false and absent are semantically identical.
    const profile: UserProfile = {
      id: USER_ID,
      name: "",
      preferredDialect: "Cantonese",
      preferredTone: "casual",
      toneOverrideEnabled: false,
      personalityNotes: "",
      conversationCount: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    // Act
    const row = profileToRow(profile, USER_ID);
    const restored = rowToProfile(row);

    // Assert
    expect(row.data_collection_consent).toBe(false);
    expect(row.audio_retention_consent).toBe(false);
    expect(row.consent_updated_at).toBeNull();
    expect(restored.dataCollectionConsent).toBeUndefined();
    expect(restored.audioRetentionConsent).toBeUndefined();
    expect(restored).toStrictEqual(profile);
  });

  test("normalizes explicit consent=false to an omitted field after a round-trip", () => {
    // Arrange
    const profile: UserProfile = {
      id: USER_ID,
      name: "",
      preferredDialect: "Cantonese",
      preferredTone: "casual",
      toneOverrideEnabled: false,
      personalityNotes: "",
      conversationCount: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      dataCollectionConsent: false,
      audioRetentionConsent: false,
      consentUpdatedAt: "2026-07-02T00:00:00.000Z",
    };

    // Act
    const row = profileToRow(profile, USER_ID);
    const restored = rowToProfile(row);

    // Assert — false is stored as false; reading back yields "absent", which
    // the app treats identically (consent checks use `=== true` semantics).
    expect(row.data_collection_consent).toBe(false);
    expect(restored.dataCollectionConsent).toBeUndefined();
    expect(restored.audioRetentionConsent).toBeUndefined();
    expect(restored.consentUpdatedAt).toBe("2026-07-02T00:00:00.000Z");
  });
});

describe("tag mapping", () => {
  test("round-trips a tag (including non-uuid seeded ids)", () => {
    // Arrange — default seeded tags use readable ids, not uuids
    const tag: Tag = {
      id: "p-greetings",
      name: "Greetings",
      type: "phrase",
      createdAt: "2024-01-01T00:00:00.000Z",
    };

    // Act
    const row = tagToRow(tag, USER_ID);
    const restored = rowToTag(row);

    // Assert
    expect(row.user_id).toBe(USER_ID);
    expect(restored).toStrictEqual(tag);
  });
});

describe("conversation lesson mapping", () => {
  test("round-trips a fully populated lesson", () => {
    // Arrange
    const lesson: ConversationLesson = {
      id: "cccc1111-0000-0000-0000-000000000001",
      sessionId: "bbbb1111-0000-0000-0000-000000000001",
      title: "Ordering dim sum",
      createdAt: "2026-07-02T09:00:00.000Z",
      vocabulary: [
        {
          english: "shrimp dumpling",
          cantonese: "蝦餃",
          pronunciation: "haa1 gaau2",
          exampleSentence: "我想食蝦餃",
          breakdown: [{ characters: "蝦", pronunciation: "haa1", meaning: "shrimp" }],
        },
      ],
      examBestScore: 87.5,
      examCompleted: true,
      examAttempts: 3,
      persona: "personal",
      currentPhase: "done",
    };

    // Act
    const restored = rowToConversationLesson(conversationLessonToRow(lesson, USER_ID));

    // Assert
    expect(restored).toStrictEqual(lesson);
  });

  test("round-trips a lesson with optional fields absent", () => {
    // Arrange
    const lesson: ConversationLesson = {
      id: "cccc1111-0000-0000-0000-000000000002",
      sessionId: "bbbb1111-0000-0000-0000-000000000002",
      title: "New lesson",
      createdAt: "2026-07-02T09:00:00.000Z",
      vocabulary: [],
      examCompleted: false,
      examAttempts: 0,
    };

    // Act
    const row = conversationLessonToRow(lesson, USER_ID);
    const restored = rowToConversationLesson(row);

    // Assert
    expect(row.exam_best_score).toBeNull();
    expect(row.persona).toBeNull();
    expect(row.current_phase).toBeNull();
    expect(restored).toStrictEqual(lesson);
  });
});

describe("lesson progress mapping", () => {
  test("round-trips lesson progress", () => {
    // Arrange
    const progress: LessonProgress = {
      lessonId: "greetings-basics",
      completedLevels: 2,
      totalLevels: 5,
      lastAccessedAt: "2026-07-03T12:00:00.000Z",
    };

    // Act
    const row = lessonProgressToRow(progress, USER_ID);
    const restored = rowToLessonProgress(row);

    // Assert
    expect(row.user_id).toBe(USER_ID);
    expect(row.lesson_id).toBe("greetings-basics");
    expect(row.last_accuracy).toBeNull();
    expect(restored).toStrictEqual(progress);
  });

  test("round-trips lesson progress with lastAccuracy", () => {
    // Arrange
    const progress: LessonProgress = {
      lessonId: "food-1",
      completedLevels: 3,
      totalLevels: 4,
      lastAccessedAt: "2026-07-12T08:00:00.000Z",
      lastAccuracy: 83,
    };

    // Act
    const row = lessonProgressToRow(progress, USER_ID);
    const restored = rowToLessonProgress(row);

    // Assert
    expect(row.last_accuracy).toBe(83);
    expect(restored).toStrictEqual(progress);
  });
});

describe("review state mapping", () => {
  test("round-trips a review state", () => {
    // Arrange
    const state: PhraseReviewState = {
      phraseId: "aaaa1111-0000-0000-0000-000000000001",
      due: "2026-07-20T00:00:00.000Z",
      intervalDays: 6,
      ease: 2.36,
      reps: 3,
      lapses: 1,
      updatedAt: "2026-07-14T09:30:00.000Z",
    };

    // Act
    const row = reviewStateToRow(state, USER_ID);
    const restored = rowToReviewState(row);

    // Assert
    expect(row.user_id).toBe(USER_ID);
    expect(row.phrase_id).toBe(state.phraseId);
    expect(restored).toStrictEqual(state);
  });
});

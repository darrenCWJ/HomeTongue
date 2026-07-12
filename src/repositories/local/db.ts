import Dexie, { type Table } from "dexie";
import type {
  Phrase,
  Session,
  UserProfile,
  LessonProgress,
  ConversationLesson,
  Message,
  Tag,
} from "../../types";
import type { PhraseReviewState } from "../../types";

interface ProfileRow {
  key: "singleton";
  value: UserProfile;
}

interface DraftRow {
  key: "draft";
  messages: Message[];
}

class HomeTongueDB extends Dexie {
  phrases!: Table<Phrase, string>;
  sessions!: Table<Session, string>;
  profile!: Table<ProfileRow, string>;
  lessonProgress!: Table<LessonProgress, string>;
  conversationLessons!: Table<ConversationLesson, string>;
  draftMessages!: Table<DraftRow, string>;
  tags!: Table<Tag, string>;
  reviewStates!: Table<PhraseReviewState, string>;

  constructor() {
    super("hometongue");
    this.version(1).stores({
      phrases: "id",
      sessions: "id, date",
      profile: "key",
      lessonProgress: "lessonId",
    });
    this.version(2).stores({
      conversationLessons: "id, sessionId",
    });
    this.version(3).stores({
      draftMessages: "key",
    });
    this.version(4).stores({
      tags: "id",
    });
    this.version(5)
      .stores({
        tags: "id, type",
      })
      .upgrade((tx) => {
        return tx
          .table("tags")
          .toCollection()
          .modify((tag) => {
            if (!tag.type) tag.type = "phrase";
          });
      });
    // v6: spaced-repetition review schedules for saved phrases. Brand-new
    // empty table, so no upgrade callback is needed — Dexie creates it as-is.
    this.version(6).stores({
      reviewStates: "phraseId, due",
    });
    // v7: dialect-neutral domain rename — Message.cantoneseText became
    // Message.dialectText. Rewrites the message arrays persisted in `sessions`
    // and `draftMessages`. Idempotent: messages that never had the legacy key
    // (or were already migrated) pass through untouched, and an existing
    // dialectText is never overwritten.
    this.version(7).upgrade((tx) => {
      const migrateMessages = (messages: unknown): void => {
        if (!Array.isArray(messages)) return;
        for (const message of messages) {
          if (!message || typeof message !== "object" || !("cantoneseText" in message)) continue;
          const legacy = message as { cantoneseText?: unknown; dialectText?: unknown };
          if (legacy.dialectText === undefined && typeof legacy.cantoneseText === "string") {
            legacy.dialectText = legacy.cantoneseText;
          }
          delete legacy.cantoneseText;
        }
      };
      return Promise.all([
        tx
          .table("sessions")
          .toCollection()
          .modify((session) => {
            migrateMessages(session.messages);
          }),
        tx
          .table("draftMessages")
          .toCollection()
          .modify((row) => {
            migrateMessages(row.messages);
          }),
      ]).then(() => undefined);
    });
  }
}

export const db = new HomeTongueDB();

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
import type { OutboxEntry } from "../outbox/types";
import { DEFAULT_LANGUAGE_CODE } from "../../languages/scope";

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
  outbox!: Table<OutboxEntry, string>;

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
    // v8: multi-language scoping — Phrase, Session, and ConversationLesson
    // gained an optional languageCode. Backfills existing rows with the
    // default ("yue-HK"): every row written before this version is legacy
    // Cantonese data (see src/languages/scope.ts). Idempotent: rows that
    // already carry a languageCode pass through untouched. No index needed —
    // consumers filter in memory.
    this.version(8).upgrade((tx) => {
      const backfillLanguageCode = (row: { languageCode?: unknown }): void => {
        if (typeof row.languageCode !== "string") row.languageCode = DEFAULT_LANGUAGE_CODE;
      };
      return Promise.all([
        tx.table("phrases").toCollection().modify(backfillLanguageCode),
        tx.table("sessions").toCollection().modify(backfillLanguageCode),
        tx.table("conversationLessons").toCollection().modify(backfillLanguageCode),
      ]).then(() => undefined);
    });
    // v9: dialect-neutral VocabItem rename — `cantonese` became `dialect` and
    // `pronunciation` became `romanization` on the vocabulary items persisted
    // in `conversationLessons` (the only table that stores VocabItems; some
    // old docs called the romanization field "jyutping", handled too).
    // Idempotent and tolerant of odd shapes: items without a legacy key (or
    // already migrated) pass through untouched, and an existing new-name
    // value is never overwritten. WordChunk breakdowns keep their own
    // `pronunciation` field — only the item's top-level keys move.
    this.version(9).upgrade((tx) => {
      const migrateVocabulary = (vocabulary: unknown): void => {
        if (!Array.isArray(vocabulary)) return;
        for (const item of vocabulary) {
          if (!item || typeof item !== "object") continue;
          const legacy = item as {
            cantonese?: unknown;
            pronunciation?: unknown;
            jyutping?: unknown;
            dialect?: unknown;
            romanization?: unknown;
          };
          if ("cantonese" in legacy) {
            if (legacy.dialect === undefined && typeof legacy.cantonese === "string") {
              legacy.dialect = legacy.cantonese;
            }
            delete legacy.cantonese;
          }
          for (const legacyKey of ["pronunciation", "jyutping"] as const) {
            if (!(legacyKey in legacy)) continue;
            if (legacy.romanization === undefined && typeof legacy[legacyKey] === "string") {
              legacy.romanization = legacy[legacyKey];
            }
            delete legacy[legacyKey];
          }
        }
      };
      return tx
        .table("conversationLessons")
        .toCollection()
        .modify((lesson) => {
          migrateVocabulary(lesson.vocabulary);
        })
        .then(() => undefined);
    });
    // v10: cloud-write outbox — durable queue for cloud-mode repository
    // writes that failed (offline, expired session, RLS error), flushed FIFO
    // when connectivity/auth returns (see src/repositories/outbox/). Brand-new
    // empty table, so no upgrade callback is needed — Dexie creates it as-is.
    // `createdAt` is indexed for FIFO replay, `userId` for per-user flushing.
    this.version(10).stores({
      outbox: "id, createdAt, userId",
    });
  }
}

export const db = new HomeTongueDB();

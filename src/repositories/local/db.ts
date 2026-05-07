import Dexie, { type Table } from "dexie";
import type { Phrase, Session, UserProfile, LessonProgress, ConversationLesson, Message, Tag } from "../../types";

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
    this.version(5).stores({
      tags: "id, type",
    }).upgrade((tx) => {
      return tx.table("tags").toCollection().modify((tag) => {
        if (!tag.type) tag.type = "phrase";
      });
    });
  }
}

export const db = new HomeTongueDB();

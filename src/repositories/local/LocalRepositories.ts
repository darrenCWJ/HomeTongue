import type { Phrase, Session, UserProfile, LessonProgress, ConversationLesson, Tag } from "../../types";
import type {
  IPhraseRepository,
  IConversationRepository,
  IUserRepository,
  ILessonRepository,
  IConversationLessonRepository,
  ITagRepository,
} from "../interfaces";
import { db } from "./db";

const DEFAULT_PHRASES: Phrase[] = [
  {
    id: "1",
    original: "Hello, how are you?",
    dialect: "你好嗎？",
    pronunciation: "nei5 hou2 maa1?",
    isBookmarked: true,
    context: "General greeting",
  },
  {
    id: "2",
    original: "I don't understand.",
    dialect: "我唔明。",
    pronunciation: "ngo5 m4 ming4.",
    isBookmarked: false,
    context: "When confused",
  },
];

export class LocalPhraseRepository implements IPhraseRepository {
  async getAll(): Promise<Phrase[]> {
    const phrases = await db.phrases.toArray();
    if (phrases.length === 0) {
      await db.phrases.bulkPut(DEFAULT_PHRASES);
      return DEFAULT_PHRASES;
    }
    return phrases;
  }

  async saveAll(phrases: Phrase[]): Promise<void> {
    await db.transaction("rw", db.phrases, async () => {
      await db.phrases.clear();
      await db.phrases.bulkPut(phrases);
    });
  }

  async toggleBookmark(id: string): Promise<Phrase[]> {
    const phrase = await db.phrases.get(id);
    if (phrase) {
      await db.phrases.put({ ...phrase, isBookmarked: !phrase.isBookmarked });
    }
    return db.phrases.toArray();
  }
}

export class LocalConversationRepository implements IConversationRepository {
  async getAll(): Promise<Session[]> {
    return db.sessions.orderBy("date").reverse().toArray();
  }

  async addSession(session: Session): Promise<void> {
    await db.sessions.put(session);
  }

  async updateSession(session: Session): Promise<void> {
    await db.sessions.put(session);
  }

  async deleteSession(id: string): Promise<void> {
    await db.sessions.delete(id);
  }
}

export class LocalUserRepository implements IUserRepository {
  async getProfile(): Promise<UserProfile | null> {
    const row = await db.profile.get("singleton");
    return row?.value ?? null;
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    await db.profile.put({ key: "singleton", value: profile });
  }
}

export class LocalLessonRepository implements ILessonRepository {
  async getAllProgress(): Promise<Record<string, LessonProgress>> {
    const rows = await db.lessonProgress.toArray();
    return Object.fromEntries(rows.map((r) => [r.lessonId, r]));
  }

  async updateProgress(progress: LessonProgress): Promise<void> {
    await db.lessonProgress.put(progress);
  }
}

export class LocalConversationLessonRepository implements IConversationLessonRepository {
  async getAll(): Promise<ConversationLesson[]> {
    return db.conversationLessons.toArray();
  }

  async save(lesson: ConversationLesson): Promise<void> {
    await db.conversationLessons.put(lesson);
  }

  async update(lesson: ConversationLesson): Promise<void> {
    await db.conversationLessons.put(lesson);
  }

  async delete(id: string): Promise<void> {
    await db.conversationLessons.delete(id);
  }
}

const DEFAULT_TAGS: Tag[] = [
  { id: "p-greetings", name: "Greetings", type: "phrase", createdAt: "2024-01-01T00:00:00.000Z" },
  { id: "p-food", name: "Food & Dining", type: "phrase", createdAt: "2024-01-01T00:00:00.000Z" },
  { id: "p-transport", name: "Transport", type: "phrase", createdAt: "2024-01-01T00:00:00.000Z" },
  { id: "p-shopping", name: "Shopping", type: "phrase", createdAt: "2024-01-01T00:00:00.000Z" },
  { id: "p-weather", name: "Weather", type: "phrase", createdAt: "2024-01-01T00:00:00.000Z" },
  { id: "s-daily", name: "Daily Life", type: "session", createdAt: "2024-01-01T00:00:00.000Z" },
  { id: "s-travel", name: "Travel", type: "session", createdAt: "2024-01-01T00:00:00.000Z" },
  { id: "s-work", name: "Work", type: "session", createdAt: "2024-01-01T00:00:00.000Z" },
  { id: "s-social", name: "Social", type: "session", createdAt: "2024-01-01T00:00:00.000Z" },
];

export class LocalTagRepository implements ITagRepository {
  async getAll(): Promise<Tag[]> {
    const tags = await db.tags.toArray();
    if (tags.length === 0) {
      await db.tags.bulkPut(DEFAULT_TAGS);
      return DEFAULT_TAGS;
    }
    return tags;
  }

  async create(tag: Tag): Promise<void> {
    await db.tags.put(tag);
  }

  async delete(id: string): Promise<void> {
    await db.tags.delete(id);
  }
}

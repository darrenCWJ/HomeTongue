import Dexie, { type Table } from "dexie";
import type { Phrase, Session, UserProfile, LessonProgress } from "../../types";

interface ProfileRow {
  key: "singleton";
  value: UserProfile;
}

class HomeTongueDB extends Dexie {
  phrases!: Table<Phrase, string>;
  sessions!: Table<Session, string>;
  profile!: Table<ProfileRow, string>;
  lessonProgress!: Table<LessonProgress, string>;

  constructor() {
    super("hometongue");
    this.version(1).stores({
      phrases: "id",
      sessions: "id, date",
      profile: "key",
      lessonProgress: "lessonId",
    });
  }
}

export const db = new HomeTongueDB();

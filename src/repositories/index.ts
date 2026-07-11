import type { Repositories } from "./interfaces";
import {
  LocalPhraseRepository,
  LocalConversationRepository,
  LocalUserRepository,
  LocalLessonRepository,
  LocalConversationLessonRepository,
  LocalTagRepository,
} from "./local/LocalRepositories";
import {
  CloudPhraseRepository,
  CloudConversationRepository,
  CloudUserRepository,
  CloudLessonRepository,
  CloudConversationLessonRepository,
  CloudTagRepository,
} from "./cloud/CloudRepositories";
import { isSupabaseConfigured } from "../lib/supabase";

function createRepositories(mode: string): Repositories {
  // Cloud mode requires BOTH the mode flag and a configured Supabase project;
  // otherwise the app silently keeps working on local IndexedDB storage.
  if (mode === "cloud" && isSupabaseConfigured) {
    return {
      phrases: new CloudPhraseRepository(),
      conversations: new CloudConversationRepository(),
      user: new CloudUserRepository(),
      lessons: new CloudLessonRepository(),
      conversationLessons: new CloudConversationLessonRepository(),
      tags: new CloudTagRepository(),
    };
  }
  if (mode === "cloud") {
    console.warn(
      "VITE_STORAGE_MODE=cloud was requested but VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY " +
        "are not set — falling back to local (IndexedDB) storage."
    );
  }
  return {
    phrases: new LocalPhraseRepository(),
    conversations: new LocalConversationRepository(),
    user: new LocalUserRepository(),
    lessons: new LocalLessonRepository(),
    conversationLessons: new LocalConversationLessonRepository(),
    tags: new LocalTagRepository(),
  };
}

export const repositories = createRepositories(
  import.meta.env.VITE_STORAGE_MODE ?? "local"
);

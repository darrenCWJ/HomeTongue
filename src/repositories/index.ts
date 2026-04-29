import type { Repositories } from "./interfaces";
import {
  LocalPhraseRepository,
  LocalConversationRepository,
  LocalUserRepository,
  LocalLessonRepository,
  LocalConversationLessonRepository,
} from "./local/LocalRepositories";
import {
  CloudPhraseRepository,
  CloudConversationRepository,
  CloudUserRepository,
  CloudLessonRepository,
  CloudConversationLessonRepository,
} from "./cloud/CloudRepositories";

function createRepositories(mode: string): Repositories {
  if (mode === "cloud") {
    return {
      phrases: new CloudPhraseRepository(),
      conversations: new CloudConversationRepository(),
      user: new CloudUserRepository(),
      lessons: new CloudLessonRepository(),
      conversationLessons: new CloudConversationLessonRepository(),
    };
  }
  return {
    phrases: new LocalPhraseRepository(),
    conversations: new LocalConversationRepository(),
    user: new LocalUserRepository(),
    lessons: new LocalLessonRepository(),
    conversationLessons: new LocalConversationLessonRepository(),
  };
}

export const repositories = createRepositories(
  import.meta.env.VITE_STORAGE_MODE ?? "local"
);

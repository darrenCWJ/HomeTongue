import type { Repositories } from "./interfaces";
import {
  LocalPhraseRepository,
  LocalConversationRepository,
  LocalUserRepository,
  LocalLessonRepository,
} from "./local/LocalRepositories";
import {
  CloudPhraseRepository,
  CloudConversationRepository,
  CloudUserRepository,
  CloudLessonRepository,
} from "./cloud/CloudRepositories";

function createRepositories(mode: string): Repositories {
  if (mode === "cloud") {
    return {
      phrases: new CloudPhraseRepository(),
      conversations: new CloudConversationRepository(),
      user: new CloudUserRepository(),
      lessons: new CloudLessonRepository(),
    };
  }
  return {
    phrases: new LocalPhraseRepository(),
    conversations: new LocalConversationRepository(),
    user: new LocalUserRepository(),
    lessons: new LocalLessonRepository(),
  };
}

export const repositories = createRepositories(
  import.meta.env.VITE_STORAGE_MODE ?? "local"
);

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
import { LocalReviewStateRepository } from "./local/ReviewStateRepository";
import { CloudReviewStateRepository } from "./cloud/CloudReviewStateRepository";
const STORAGE_MODE: string = import.meta.env.VITE_STORAGE_MODE ?? "local";

// Literal `!!(...)` on the statically-replaced env values (NOT the imported
// Boolean-derived isSupabaseConfigured) so Rollup constant-folds the check and
// drops the entire cloud repository branch — and supabase-js with it — from
// local-mode bundles. Same load-bearing pattern as src/lib/authGateway.ts.
const supabaseConfigured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

// True only when cloud storage is both requested and actually configured.
// Providers use this to decide whether their initial-load effects should
// re-run when the auth session changes; in local mode it is a constant.
export const isCloudStorageMode: boolean = STORAGE_MODE === "cloud" && supabaseConfigured;

function createRepositories(mode: string): Repositories {
  // Cloud mode requires BOTH the mode flag and a configured Supabase project;
  // otherwise the app silently keeps working on local IndexedDB storage.
  if (mode === "cloud" && supabaseConfigured) {
    return {
      phrases: new CloudPhraseRepository(),
      conversations: new CloudConversationRepository(),
      user: new CloudUserRepository(),
      lessons: new CloudLessonRepository(),
      conversationLessons: new CloudConversationLessonRepository(),
      tags: new CloudTagRepository(),
      // Device-local until a review_states migration lands — see the note in
      // cloud/CloudReviewStateRepository.ts.
      reviewStates: new CloudReviewStateRepository(),
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
    reviewStates: new LocalReviewStateRepository(),
  };
}

export const repositories = createRepositories(STORAGE_MODE);

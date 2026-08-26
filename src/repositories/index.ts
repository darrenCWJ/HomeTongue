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
import { createOutboxRepositories } from "./outbox/OutboxRepositories";
import { getOutboxUserId, setOutboxHold } from "./outbox/outboxStore";
import { createSessionRoutedRepositories } from "./routing";
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

function createLocalRepositories(): Repositories {
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

function createRepositories(mode: string): Repositories {
  // Cloud mode requires BOTH the mode flag and a configured Supabase project;
  // otherwise the app silently keeps working on local IndexedDB storage.
  if (mode === "cloud" && supabaseConfigured) {
    // The outbox decorator makes cloud writes durable: a failed write is
    // queued locally and replayed when connectivity/auth returns — see
    // src/repositories/outbox/. Local mode needs no such layer (IndexedDB
    // writes don't fail on connectivity).
    const cloud = createOutboxRepositories({
      phrases: new CloudPhraseRepository(),
      conversations: new CloudConversationRepository(),
      user: new CloudUserRepository(),
      lessons: new CloudLessonRepository(),
      conversationLessons: new CloudConversationLessonRepository(),
      tags: new CloudTagRepository(),
      reviewStates: new CloudReviewStateRepository(),
    });
    // Even in a cloud build a visitor may never sign in, and the cloud repos
    // reject every call without a session. Route those callers to local Dexie
    // instead — see src/repositories/routing.ts for the full rationale.
    //
    // TIMING: at app start the session restore has not landed yet, so the
    // router reads local first. AuthProvider then bumps `authEpoch` when the
    // restored user arrives (null → user counts as a user change) and every
    // provider re-runs its initial load against the cloud. A guest never gets
    // a user and stays on local for the whole visit; sign-out (user → null)
    // bumps the epoch too, so providers re-load from local Dexie rather than
    // leaving the previous account's rows in memory.
    return createSessionRoutedRepositories(
      cloud,
      createLocalRepositories(),
      () => getOutboxUserId() !== null
    );
  }
  if (mode === "cloud") {
    console.warn(
      "VITE_STORAGE_MODE=cloud was requested but VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY " +
        "are not set — falling back to local (IndexedDB) storage."
    );
  }
  return createLocalRepositories();
}

export const repositories = createRepositories(STORAGE_MODE);

// Hold switch for the outbox decorator: while held, cloud writes skip the
// network and queue directly (LibraryProvider holds while its initial load
// has failed; clearing the hold flushes what accumulated). A no-op constant
// in local mode so this export never drags the outbox into local bundles —
// the literal `supabaseConfigured` check keeps the branch statically foldable,
// same pattern as createRepositories above.
export const setCloudWriteHold: (held: boolean) => void =
  STORAGE_MODE === "cloud" && supabaseConfigured ? setOutboxHold : () => {};

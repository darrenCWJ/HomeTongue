import { authGateway } from "../lib/authGateway";
import { getSupabaseClient } from "../lib/supabase";
import { normalizePublishedLessonContent, setPublishedLessonContent } from "../data/publishedLessons";
import type { LessonContent } from "../data/lessons";

// Config-gated published-lesson sync (public.lesson_content, migration 0008).
//
// Mirrors the static-gate pattern in src/lib/authGateway.ts: the literal
// `!!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)`
// check lets Vite's define replacement fold the condition at build time, so a
// local-mode build tree-shakes the entire cloud branch — getSupabaseClient
// and supabase-js with it — out of the bundle (verified by the CI dist grep).
// `!!` (not `Boolean(...)`) is load-bearing: Rollup constant-folds
// logical/unary expressions but treats a `Boolean()` call as opaque.
//
// The extra VITE_STORAGE_MODE conjunct matches the repository factory's
// semantics (src/repositories/index.ts): published lessons are a CLOUD-mode
// feature — a supabase-configured build running local storage keeps the
// built-in static lessons.
const isCloudLessonContentEnabled: boolean =
  !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) &&
  (import.meta.env.VITE_STORAGE_MODE ?? "local") === "cloud";

export interface LessonContentSync {
  /**
   * Begin syncing published lesson content for this app session. Idempotent —
   * every Learn surface calls it on mount and only the first call does work.
   */
  start(): void;
}

function createDisabledLessonContentSync(): LessonContentSync {
  return { start() {} };
}

interface PublishedRow {
  language_code: string;
  content: unknown;
}

function createCloudLessonContentSync(): LessonContentSync {
  let isStarted = false;
  let lastSyncedUserId: string | null = null;

  const fetchPublished = async (): Promise<void> => {
    // RLS: only PUBLISHED rows are readable by regular authenticated users
    // (lesson_content_select_published), so no client-side published filter
    // is load-bearing — it just keeps admin sessions consistent with users.
    const { data, error } = await getSupabaseClient()
      .from("lesson_content")
      .select("language_code, content")
      .eq("published", true);
    if (error) {
      console.warn(`Published lesson fetch failed; keeping built-in lessons: ${error.message}`);
      return;
    }

    const next: Record<string, LessonContent> = {};
    for (const row of (data ?? []) as PublishedRow[]) {
      const content = normalizePublishedLessonContent(row.content);
      if (!content) {
        // Bad published data must never crash the Learn surface — skip the
        // row and let that language fall back to its static lessons.
        console.warn(
          `Ignoring malformed published lesson content for "${row.language_code}" (missing categories/lessons arrays).`
        );
        continue;
      }
      next[row.language_code] = content;
    }
    setPublishedLessonContent(next);
  };

  // The lesson_content SELECT policy requires an authenticated session, so
  // fetch only once a user is present, and re-fetch when the user changes.
  // Signed-out users get the built-in static lessons (store cleared).
  const handleAuthUser = (userId: string | null): void => {
    if (userId === lastSyncedUserId) return;
    lastSyncedUserId = userId;
    if (userId === null) {
      setPublishedLessonContent({});
      return;
    }
    fetchPublished().catch((err) => {
      console.warn("Published lesson fetch failed; keeping built-in lessons.", err);
    });
  };

  return {
    start() {
      if (isStarted) return;
      isStarted = true;
      // App-lifetime subscription (deliberately never unsubscribed): both the
      // change stream and the initial session restore funnel through
      // handleAuthUser, which de-dupes by user id.
      authGateway.onAuthUserChange((user) => handleAuthUser(user?.id ?? null));
      authGateway
        .getSessionUser()
        .then((user) => handleAuthUser(user?.id ?? null))
        .catch(() => {
          // No restorable session — the auth-change subscription picks up a
          // later sign-in, and static lessons cover the meantime.
        });
    },
  };
}

function createLessonContentSync(): LessonContentSync {
  if (isCloudLessonContentEnabled) {
    return createCloudLessonContentSync();
  }
  return createDisabledLessonContentSync();
}

export const lessonContentSync: LessonContentSync = createLessonContentSync();

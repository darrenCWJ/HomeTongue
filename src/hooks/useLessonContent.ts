import { useEffect, useSyncExternalStore } from "react";
import { getLessonContent, type LessonContent } from "../data/lessons";
import { getPublishedLessonsVersion, subscribeToPublishedLessons } from "../data/publishedLessons";
import { lessonContentSync } from "../services/lessonContentService";

/**
 * Reactive lesson curriculum for a language.
 *
 * Same resolution as getLessonContent (published row replaces static content
 * — see src/data/lessons.ts), plus reactivity: the published fetch lands
 * AFTER first render, so this hook subscribes to the published-lesson store
 * via useSyncExternalStore and re-renders the consumer when it swaps. It also
 * lazily starts the per-session sync (idempotent; a no-op outside cloud
 * mode), so the first Learn surface to mount kicks off the fetch.
 *
 * Use this in components instead of calling getLessonContent directly; the
 * sync function stays fine for event handlers and non-React callers.
 */
export function useLessonContent(languageCode: string): LessonContent {
  useEffect(() => {
    lessonContentSync.start();
  }, []);
  // Snapshot value is just a version counter — the returned content objects
  // themselves are stable references from the store/static modules.
  useSyncExternalStore(subscribeToPublishedLessons, getPublishedLessonsVersion);
  return getLessonContent(languageCode);
}

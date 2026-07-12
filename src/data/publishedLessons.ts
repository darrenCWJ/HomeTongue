import type { ConversationTurn, Lesson, LessonCategory, LessonLevel, VocabItem } from "../types";
import type { LessonContent } from "./lessons";

/**
 * In-memory store for DB-published lesson content (public.lesson_content,
 * migration 0008) plus the defensive normalizer for rows read from it.
 *
 * PURE module on purpose: no Supabase import, no import.meta.env — the fetch
 * side lives in src/services/lessonContentService.ts and pushes rows in via
 * setPublishedLessonContent(). That keeps src/data/lessons.ts (which reads
 * this store) safe to bundle into plain-Node contexts (scripts/lib
 * loadLessons.mjs) and keeps the config-gating invariant out of the data
 * layer entirely.
 *
 * Reactivity: a tiny external store (subscribe + version snapshot) consumed
 * by src/hooks/useLessonContent.ts via useSyncExternalStore.
 */

let publishedByLanguage: Readonly<Record<string, LessonContent>> = {};
let version = 0;
const listeners = new Set<() => void>();

/** Published registry for a language, or undefined when none is published. */
export function getPublishedLessonContent(languageCode: string): LessonContent | undefined {
  return publishedByLanguage[languageCode];
}

/** Monotonic snapshot for useSyncExternalStore — bumps on every store swap. */
export function getPublishedLessonsVersion(): number {
  return version;
}

/** Subscribe to store swaps. Returns an unsubscribe function. */
export function subscribeToPublishedLessons(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Replace the whole published map (immutably) and notify subscribers.
 * Clearing an already-empty store is a no-op so auth churn before the first
 * fetch never causes pointless re-renders.
 */
export function setPublishedLessonContent(next: Readonly<Record<string, LessonContent>>): void {
  if (Object.keys(next).length === 0 && Object.keys(publishedByLanguage).length === 0) return;
  publishedByLanguage = { ...next };
  version += 1;
  for (const listener of listeners) listener();
}

// ─── Defensive normalization of published jsonb ─────────────────────────────
// Rows published before the dialect-neutral field rename may carry legacy
// vocab keys (cantonese / pronunciation / jyutping); normalize them to
// dialect / romanization exactly like the cloud repository mappers do (see
// normalizeVocabItem in src/repositories/cloud/mapping.ts — reimplemented
// here because that module does not export it and is not ours to change).

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

type LegacyDialectFields = {
  dialect?: unknown;
  romanization?: unknown;
  cantonese?: unknown;
  pronunciation?: unknown;
  jyutping?: unknown;
};

/** Resolve dialect/romanization, preferring current names over legacy ones. */
function normalizeDialectFields(raw: LegacyDialectFields): { dialect: string; romanization: string } {
  return {
    dialect: asString(raw.dialect) ?? asString(raw.cantonese) ?? "",
    romanization: asString(raw.romanization) ?? asString(raw.pronunciation) ?? asString(raw.jyutping) ?? "",
  };
}

function normalizeVocabItem(raw: unknown): VocabItem | null {
  if (!isRecord(raw)) return null;
  const { cantonese: _c, pronunciation: _p, jyutping: _j, ...rest } = raw;
  return {
    ...rest,
    english: asString(raw.english) ?? "",
    ...normalizeDialectFields(raw),
  } as VocabItem;
}

function normalizeVocabList(raw: unknown): VocabItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeVocabItem).filter((item): item is VocabItem => item !== null);
}

function normalizeConversationTurn(raw: unknown): ConversationTurn | null {
  if (!isRecord(raw)) return null;
  const { cantonese: _c, pronunciation: _p, jyutping: _j, ...rest } = raw;
  return {
    ...rest,
    speaker: raw.speaker === "user" ? "user" : "them",
    english: asString(raw.english) ?? "",
    ...normalizeDialectFields(raw),
  } as ConversationTurn;
}

function normalizeLevel(raw: unknown): LessonLevel | null {
  if (!isRecord(raw)) return null;
  const conversation = Array.isArray(raw.conversation)
    ? raw.conversation
        .map(normalizeConversationTurn)
        .filter((turn): turn is ConversationTurn => turn !== null)
    : undefined;
  return {
    ...raw,
    vocabulary: normalizeVocabList(raw.vocabulary),
    ...(conversation !== undefined ? { conversation } : {}),
  } as unknown as LessonLevel;
}

function normalizeLesson(raw: unknown): Lesson | null {
  if (!isRecord(raw) || !isRecord(raw.content)) return null;
  const levels = Array.isArray(raw.content.levels)
    ? raw.content.levels.map(normalizeLevel).filter((level): level is LessonLevel => level !== null)
    : undefined;
  return {
    ...raw,
    content: {
      vocabulary: normalizeVocabList(raw.content.vocabulary),
      ...(levels !== undefined ? { levels } : {}),
    },
  } as unknown as Lesson;
}

/**
 * Loosely validate + normalize one published `content` jsonb value into the
 * { categories, lessons } registry shape. Returns null when the value does
 * not carry `categories` AND `lessons` arrays — callers ignore such rows
 * (with a console.warn) instead of ever crashing the Learn surface.
 */
export function normalizePublishedLessonContent(raw: unknown): LessonContent | null {
  if (!isRecord(raw) || !Array.isArray(raw.categories) || !Array.isArray(raw.lessons)) return null;
  return {
    categories: raw.categories.filter(isRecord) as unknown as LessonCategory[],
    lessons: raw.lessons.map(normalizeLesson).filter((lesson): lesson is Lesson => lesson !== null),
  };
}

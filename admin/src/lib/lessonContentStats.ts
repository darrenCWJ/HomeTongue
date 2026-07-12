import type { LessonRegistryContent } from "../types";

// Pure counting helpers for lesson registry content. The formulas mirror
// printSummary in scripts/import-lessons.mjs so the Content page shows the
// exact numbers the CLI dry run prints.

export interface ContentCounts {
  categories: number;
  lessons: number;
  levels: number;
  /** Vocabulary rows: the level-0 word list plus every level's word list. */
  words: number;
  /** Conversation-exercise lines across all levels. */
  turns: number;
}

export function countContent(content: LessonRegistryContent): ContentCounts {
  const levels = content.lessons.reduce((sum, lesson) => sum + (lesson.content.levels?.length ?? 0), 0);
  const words = content.lessons.reduce(
    (sum, lesson) =>
      sum +
      lesson.content.vocabulary.length +
      (lesson.content.levels ?? []).reduce((n, level) => n + level.vocabulary.length, 0),
    0
  );
  const turns = content.lessons.reduce(
    (sum, lesson) =>
      sum + (lesson.content.levels ?? []).reduce((n, level) => n + (level.conversation?.length ?? 0), 0),
    0
  );
  return {
    categories: content.categories.length,
    lessons: content.lessons.length,
    levels,
    words,
    turns,
  };
}

/** Same one-line phrasing as the CLI summary. */
export function formatCounts(counts: ContentCounts): string {
  return (
    `${counts.categories} categories, ${counts.lessons} lessons, ${counts.levels} levels, ` +
    `${counts.words} word rows, ${counts.turns} conversation lines`
  );
}

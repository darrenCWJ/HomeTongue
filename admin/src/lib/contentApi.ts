import { getSupabase } from "./supabase";
import type { LessonContentRow, LessonRegistryContent } from "../types";

// Reads/writes public.lesson_content (supabase/migrations/0008). RLS enforces
// the real boundary: only admins can insert/update, and every write must be
// attributed to the acting admin (updated_by = auth.uid()).

const CONTENT_COLUMNS = "language_code, content, published, updated_by, updated_at";

/**
 * Every lesson_content row, published or not, ordered by language code.
 * Admins see unpublished rows too (lesson_content_select_admin policy), so
 * the Unpublish/Republish toggle always has something to act on.
 */
export async function fetchLessonContentRows(): Promise<LessonContentRow[]> {
  const { data, error } = await getSupabase()
    .from("lesson_content")
    .select(CONTENT_COLUMNS)
    .order("language_code");
  if (error) throw new Error(`Failed to load published lesson content: ${error.message}`);
  return (data ?? []) as unknown as LessonContentRow[];
}

/**
 * Publish one language's validated registry content: upsert on language_code
 * with published = true. Returns the stored row (updated_at reflects the
 * publish time via the set_updated_at trigger / insert default).
 */
export async function publishLessonContent(
  languageCode: string,
  content: LessonRegistryContent,
  adminId: string
): Promise<LessonContentRow> {
  const { data, error } = await getSupabase()
    .from("lesson_content")
    .upsert(
      { language_code: languageCode, content, published: true, updated_by: adminId },
      { onConflict: "language_code" }
    )
    .select(CONTENT_COLUMNS)
    .single();
  if (error) throw new Error(`Failed to publish ${languageCode}: ${error.message}`);
  return data as unknown as LessonContentRow;
}

/**
 * Flip a row's published flag (unpublish/republish — there is deliberately no
 * delete). updated_by must be re-attributed to the acting admin or the RLS
 * with-check rejects the update.
 */
export async function setLessonContentPublished(
  languageCode: string,
  published: boolean,
  adminId: string
): Promise<LessonContentRow> {
  const { data, error } = await getSupabase()
    .from("lesson_content")
    .update({ published, updated_by: adminId })
    .eq("language_code", languageCode)
    .select(CONTENT_COLUMNS)
    .single();
  if (error) {
    const action = published ? "republish" : "unpublish";
    throw new Error(`Failed to ${action} ${languageCode}: ${error.message}`);
  }
  return data as unknown as LessonContentRow;
}

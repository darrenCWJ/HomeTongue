-- ============================================================================
-- 0008 — lesson content publishing (instant lesson updates, no deploy)
--
-- Adds public.lesson_content: one row per language pack holding that
-- language's FULL published lesson registry as jsonb. Admins author lessons
-- in Google Sheets (docs/LESSON_AUTHORING.md), upload the CSV in the admin
-- app's Content page (admin/), and publish here — no code change or redeploy.
-- The main app (cloud mode) will prefer a published row over the static
-- modules in src/data/lessons/<code>/ (that read side ships separately);
-- local mode never reaches the database and keeps the built-in static lessons.
--
-- content jsonb shape — the per-language registry shape produced by
-- scripts/lib/lessonCsv.mjs rowsToContent (byLanguage[code]), exactly what
-- src/data/lessons/<code>/index.ts exports for static content:
--   {
--     "categories": [{ "id", "title", "description", "icon" }],
--     "lessons": [{
--       "id", "categoryId", "title", "description", "difficulty",
--       "tags": [text],
--       "content": {
--         "vocabulary": [{ "english", "dialect", "romanization",
--                          "exampleSentence"? }],
--         "levels"?: [{
--           "level", "title", "description", "exerciseType",
--           "vocabulary": [ ...as above... ],
--           "conversation"?: [{ "speaker", "english", "dialect",
--                               "romanization", "hint"? }]
--         }]
--       }
--     }]
--   }
--   ("dialect" is the text in the language's own script, "romanization" its
--    reading — see VocabItem in src/types.ts; legacy rows may still carry the
--    pre-rename keys cantonese/pronunciation, normalized on read.)
--
-- Access model:
--   * SELECT — authenticated users read PUBLISHED rows (cloud-mode app users
--     fetch their lessons); admins additionally read unpublished rows so the
--     admin app can list them and offer the Republish toggle. anon gets
--     nothing (local mode never reaches the DB).
--   * INSERT/UPDATE — admins only (public.is_admin(), 0005), and every write
--     must be attributed to the acting admin (updated_by = auth.uid()).
--   * No DELETE policy — unpublish by setting published = false, so a click
--     can never destroy content and republishing is always possible.
-- ============================================================================

create table if not exists public.lesson_content (
  language_code text primary key,
  content       jsonb not null,
  published     boolean not null default true,
  -- Deliberately NOT "on delete cascade": published lessons must outlive the
  -- admin account that uploaded them. Deleting that auth user requires
  -- re-attributing the row first (any admin re-publishing takes it over).
  updated_by    uuid not null references auth.users (id),
  updated_at    timestamptz not null default now()
);

comment on table public.lesson_content is
  'Published lesson registry per language pack (written by the admin app''s '
  'Content page). content holds the { categories, lessons } registry shape '
  'produced by scripts/lib/lessonCsv.mjs rowsToContent; cloud-mode app users '
  'read published rows in preference to the static src/data/lessons modules.';

comment on column public.lesson_content.published is
  'Unpublish/republish switch. false hides the row from app users (they fall '
  'back to the built-in static lessons) while admins can still see and '
  'republish it. There is intentionally no DELETE policy.';

alter table public.lesson_content enable row level security;

-- App users (cloud mode) read published content only. Scoped "to
-- authenticated" — unlike the own-rows tables from 0001 there is no
-- auth.uid() predicate here to exclude anon implicitly.
create policy "lesson_content_select_published" on public.lesson_content
  for select to authenticated using (published);

-- Admins also see unpublished rows (additive, ORs with the policy above) so
-- the Content page can list them and flip published back on.
create policy "lesson_content_select_admin" on public.lesson_content
  for select to authenticated using (public.is_admin());

create policy "lesson_content_insert_admin" on public.lesson_content
  for insert to authenticated
  with check (public.is_admin() and updated_by = auth.uid());

create policy "lesson_content_update_admin" on public.lesson_content
  for update to authenticated using (public.is_admin())
  with check (public.is_admin() and updated_by = auth.uid());

-- House convention (0001, search_path pinned in 0006).
create trigger lesson_content_set_updated_at
  before update on public.lesson_content
  for each row execute function public.set_updated_at();

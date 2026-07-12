-- ============================================================================
-- 0003 — SRS review schedules + per-lesson accuracy
--
-- Adds cloud persistence for the two fields introduced by the July 2026
-- learning-loop overhaul that were device-local until now:
--   1. lesson_progress.last_accuracy — accuracy (0–100) of the most recent
--      graded level attempt (feeds the "Dialect Fluency" stat).
--   2. review_states — SM-2-lite spaced-repetition schedules for bookmarked
--      phrases ("Practice my phrases" mode).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- lesson_progress.last_accuracy — nullable; absent means the lesson has only
-- been practised through ungraded exercises (flashcards, matching,
-- conversation). Mirrors LessonProgress.lastAccuracy in src/types.ts.
-- ---------------------------------------------------------------------------
alter table public.lesson_progress
  add column if not exists last_accuracy integer
    check (last_accuracy between 0 and 100);

-- ---------------------------------------------------------------------------
-- review_states — one row per (user, phrase) spaced-repetition schedule.
-- phrase_id is TEXT (client-generated ids, same id-space as phrases.id) and
-- deliberately has NO foreign key to public.phrases: schedules may sync
-- out of order with the phrase rows they reference, and a dangling schedule
-- is harmless (the client joins against its phrase list and ignores orphans).
--
-- updated_at is CLIENT-SET (the ISO timestamp of the last grading — it is
-- domain data, not row metadata), so unlike the other tables there is
-- intentionally no set_updated_at trigger here.
-- ---------------------------------------------------------------------------
create table if not exists public.review_states (
  user_id       uuid not null references auth.users (id) on delete cascade,
  phrase_id     text not null,
  due           timestamptz not null,
  interval_days integer not null default 0,
  ease          double precision not null default 2.5,
  reps          integer not null default 0,
  lapses        integer not null default 0,
  updated_at    timestamptz not null,
  primary key (user_id, phrase_id)
);

-- The practice queue is always "this user's schedules ordered/filtered by due".
create index if not exists review_states_user_due_idx
  on public.review_states (user_id, due);

alter table public.review_states enable row level security;

create policy "review_states_select_own" on public.review_states
  for select using (auth.uid() = user_id);
create policy "review_states_insert_own" on public.review_states
  for insert with check (auth.uid() = user_id);
create policy "review_states_update_own" on public.review_states
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "review_states_delete_own" on public.review_states
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- HomeTongue — initial Supabase schema (Phase 3a)
--
-- How to apply (once a Supabase project exists):
--   Option A (CLI):  supabase link --project-ref <ref>
--                    supabase db push
--   Option B (UI):   paste this whole file into the Supabase SQL editor
--                    (Dashboard -> SQL Editor -> New query) and run it.
--
-- Design notes:
--   * Every table is scoped to an authenticated user via
--     `user_id uuid references auth.users(id) on delete cascade` and RLS
--     policies of the form `auth.uid() = user_id`. The anon key is safe to
--     ship in the client bundle because RLS is the security boundary.
--   * `messages` stay EMBEDDED as jsonb inside `sessions` so the cloud
--     repositories can mirror the local (Dexie) repository interfaces 1:1.
--     Normalizing messages into their own table is deliberately deferred to
--     a later phase (see docs/IMPROVEMENT_PLAN.md Phase 3, item 1).
--   * Row PKs reuse the domain ids generated client-side by newId()
--     (crypto.randomUUID), so local -> cloud imports keep stable ids.
--   * Tag ids are TEXT, not uuid: the app seeds default tags with
--     human-readable ids ("p-greetings", "s-work", ...) that existing
--     phrases/sessions already reference. `phrases.tags` / `sessions.tags`
--     are therefore text[] as well.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user (user_id is the PK; the domain
-- UserProfile.id maps to user_id in cloud mode)
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id                  uuid primary key references auth.users (id) on delete cascade,
  name                     text not null default '',
  preferred_dialect        text not null default 'Cantonese',
  preferred_tone           text not null default 'casual',
  tone_override_enabled    boolean not null default false,
  personality_notes        text not null default '',
  conversation_count       integer not null default 0,
  persona_summary          text,
  characteristic_phrases   jsonb,
  active_persona           text,
  persona_profiles         jsonb,
  preferred_voice_id       text,
  custom_voice_id          text,
  suggested_replies_enabled boolean,
  tour_completed           jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = user_id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = user_id);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- phrases — saved/bookmarkable translations
-- (audio stays as base64 data-URLs for interface parity; moving audio to a
--  Storage bucket is a later Phase 3 step)
-- ---------------------------------------------------------------------------
create table public.phrases (
  -- text id (not uuid): legacy local records use Date.now()/prefixed ids.
  -- Composite PK scopes ids per user so identical ids never collide across tenants.
  id              text not null,
  user_id         uuid not null references auth.users (id) on delete cascade,
  original        text not null,
  dialect         text not null,
  pronunciation   text not null,
  is_bookmarked   boolean not null default false,
  context         text not null default '',
  audio_data_url  text,
  audio_data_urls jsonb,
  tags            text[],
  created_at      timestamptz,
  updated_at      timestamptz not null default now(),
  primary key (user_id, id)
);

create index phrases_user_id_idx on public.phrases (user_id);

alter table public.phrases enable row level security;

create policy "phrases_select_own" on public.phrases
  for select using (auth.uid() = user_id);
create policy "phrases_insert_own" on public.phrases
  for insert with check (auth.uid() = user_id);
create policy "phrases_update_own" on public.phrases
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "phrases_delete_own" on public.phrases
  for delete using (auth.uid() = user_id);

create trigger phrases_set_updated_at
  before update on public.phrases
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- sessions — saved chat conversations
-- NOTE: `messages` is embedded jsonb (Message[]) to match the local Dexie
-- shape and the IConversationRepository interface. A normalized `messages`
-- table (FK -> sessions) is planned for a later phase.
-- `date_display` is the legacy locale-formatted string (domain `date`);
-- `created_at` is the authoritative ISO sort key (nullable: older records
-- imported from IndexedDB may lack it).
-- ---------------------------------------------------------------------------
create table public.sessions (
  id           text not null,
  user_id      uuid not null references auth.users (id) on delete cascade,
  title        text,
  date_display text not null default '',
  messages     jsonb not null default '[]'::jsonb,
  persona      text,
  tags         text[],
  created_at   timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (user_id, id)
);

create index sessions_user_id_idx on public.sessions (user_id);
create index sessions_created_at_idx on public.sessions (created_at desc);

alter table public.sessions enable row level security;

create policy "sessions_select_own" on public.sessions
  for select using (auth.uid() = user_id);
create policy "sessions_insert_own" on public.sessions
  for insert with check (auth.uid() = user_id);
create policy "sessions_update_own" on public.sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sessions_delete_own" on public.sessions
  for delete using (auth.uid() = user_id);

create trigger sessions_set_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tags — user-defined + seeded phrase/session tags
-- id is TEXT because default seeded tags use readable ids ("p-greetings").
-- ---------------------------------------------------------------------------
create table public.tags (
  -- Composite PK: seeded default tags use the same literal ids ("p-greetings")
  -- for every user — a bare id PK would collide across tenants.
  id         text not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  type       text not null check (type in ('phrase', 'session')),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index tags_user_id_idx on public.tags (user_id);
create index tags_type_idx on public.tags (type);

alter table public.tags enable row level security;

create policy "tags_select_own" on public.tags
  for select using (auth.uid() = user_id);
create policy "tags_insert_own" on public.tags
  for insert with check (auth.uid() = user_id);
create policy "tags_update_own" on public.tags
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tags_delete_own" on public.tags
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- conversation_lessons — lessons generated from saved sessions
-- `session_id` is intentionally NOT a foreign key: locally, deleting a
-- session does not delete its generated lesson, and cloud mode mirrors that.
-- ---------------------------------------------------------------------------
create table public.conversation_lessons (
  id              text not null,
  user_id         uuid not null references auth.users (id) on delete cascade,
  session_id      text not null,
  title           text not null,
  vocabulary      jsonb not null default '[]'::jsonb,
  exam_best_score double precision,
  exam_completed  boolean not null default false,
  exam_attempts   integer not null default 0,
  persona         text,
  current_phase   text check (current_phase in ('listen', 'flashcard', 'done')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, id)
);

create index conversation_lessons_user_id_idx on public.conversation_lessons (user_id);
create index conversation_lessons_session_id_idx on public.conversation_lessons (session_id);

alter table public.conversation_lessons enable row level security;

create policy "conversation_lessons_select_own" on public.conversation_lessons
  for select using (auth.uid() = user_id);
create policy "conversation_lessons_insert_own" on public.conversation_lessons
  for insert with check (auth.uid() = user_id);
create policy "conversation_lessons_update_own" on public.conversation_lessons
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "conversation_lessons_delete_own" on public.conversation_lessons
  for delete using (auth.uid() = user_id);

create trigger conversation_lessons_set_updated_at
  before update on public.conversation_lessons
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- lesson_progress — completed levels per static lesson
-- lesson_id is TEXT (static lesson ids like "greetings-basics" live in
-- src/data/lessons.ts, not uuids). One row per (user, lesson).
-- ---------------------------------------------------------------------------
create table public.lesson_progress (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  lesson_id        text not null,
  completed_levels integer not null default 0,
  total_levels     integer not null default 0,
  last_accessed_at timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, lesson_id)
);

create index lesson_progress_user_id_idx on public.lesson_progress (user_id);

alter table public.lesson_progress enable row level security;

create policy "lesson_progress_select_own" on public.lesson_progress
  for select using (auth.uid() = user_id);
create policy "lesson_progress_insert_own" on public.lesson_progress
  for insert with check (auth.uid() = user_id);
create policy "lesson_progress_update_own" on public.lesson_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "lesson_progress_delete_own" on public.lesson_progress
  for delete using (auth.uid() = user_id);

create trigger lesson_progress_set_updated_at
  before update on public.lesson_progress
  for each row execute function public.set_updated_at();

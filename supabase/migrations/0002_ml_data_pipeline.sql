-- HomeTongue ML data pipeline (Phase 6, docs/IMPROVEMENT_PLAN.md)
--
-- Consented, labeled speech data for future dialect model training
-- (Whisper LoRA fine-tune / SLM adaptation). Apply after 0001 via
-- `supabase db push` or by pasting into the Supabase SQL editor.
--
-- Privacy design:
--   * Nothing is written to these tables unless the profile has the
--     matching consent flag set (enforced in the app AND by the
--     insert policies below).
--   * Rows cascade-delete with the user; consent withdrawal deletes
--     rows via the app (see speechSampleService).

-- Consent flags on profiles (default OFF)
alter table public.profiles
  add column if not exists data_collection_consent boolean not null default false,
  add column if not exists audio_retention_consent boolean not null default false,
  add column if not exists consent_updated_at timestamptz;

-- Labeled speech samples: expected text vs. what STT heard, with score.
-- Ideal supervised pairs come from exam attempts; chat transcriptions
-- contribute transcript + user-corrected text.
create table if not exists public.speech_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  language text not null default 'yue-HK',
  source text not null check (source in ('exam', 'chat')),
  expected_text text,          -- exam: the phrase the learner was asked to say
  transcript text not null,    -- what the STT model returned
  corrected_text text,         -- user's manual correction, when they edited
  score integer check (score between 0 and 100),
  stt_model text,              -- e.g. gpt-4o-transcribe
  audio_url text,              -- storage path; null unless audio_retention_consent
  device text,                 -- coarse platform tag (web / android / ios)
  created_at timestamptz not null default now()
);

-- Preference/correction events not tied to audio (e.g. suggestion ratings)
create table if not exists public.corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  language text not null default 'yue-HK',
  kind text not null check (kind in ('transcript_edit', 'suggestion_rating')),
  original text not null,
  corrected text,              -- transcript_edit: the fixed text
  rating text check (rating in ('up', 'down')),
  context text,
  created_at timestamptz not null default now()
);

create index if not exists speech_samples_user_id_idx on public.speech_samples (user_id);
create index if not exists speech_samples_language_idx on public.speech_samples (language);
create index if not exists speech_samples_created_at_idx on public.speech_samples (created_at desc);
create index if not exists corrections_user_id_idx on public.corrections (user_id);

alter table public.speech_samples enable row level security;
alter table public.corrections enable row level security;

-- Users see and manage only their own samples; inserts additionally
-- require the consent flag on their profile.
create policy "speech_samples_select_own" on public.speech_samples
  for select using (auth.uid() = user_id);
create policy "speech_samples_insert_consented" on public.speech_samples
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.data_collection_consent
    )
  );
create policy "speech_samples_delete_own" on public.speech_samples
  for delete using (auth.uid() = user_id);

create policy "corrections_select_own" on public.corrections
  for select using (auth.uid() = user_id);
create policy "corrections_insert_consented" on public.corrections
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.data_collection_consent
    )
  );
create policy "corrections_delete_own" on public.corrections
  for delete using (auth.uid() = user_id);

-- Private bucket for retained exam/chat recordings (audio_retention_consent).
-- Bucket creation is idempotent; policies scope objects to the owner's folder.
insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;

create policy "recordings_read_own" on storage.objects
  for select using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "recordings_insert_own" on storage.objects
  for insert with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "recordings_delete_own" on storage.objects
  for delete using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- 0005 — admin review (server-side foundation for the standalone admin app)
--
-- Adds:
--   1. profiles.is_admin — reviewer flag, NEVER settable by clients. It is
--      set manually via SQL / the Supabase dashboard only, e.g.:
--        update public.profiles set is_admin = true where user_id = '<uuid>';
--      The client profile mapper (src/repositories/cloud/mapping.ts,
--      profileToRow) deliberately does not include is_admin, and the trigger
--      below rejects any attempt to set or change it through the API roles.
--   2. public.is_admin() — RLS helper: "is the current auth user an admin?".
--   3. public.sample_reviews — one human review verdict per speech sample
--      (PK = sample_id; the latest reviewer wins via upsert).
--   4. Additive admin-read policies on speech_samples, corrections and the
--      recordings storage bucket (signed-URL playback), alongside the
--      existing own-rows policies from 0002. Suggestion ratings live inside
--      public.corrections (kind = 'suggestion_rating'), so there is no
--      separate ratings table to cover.
--
-- Consent note: consented recordings/transcripts may be reviewed by trained
-- human reviewers (docs/ML_PIPELINE.md, "Consent model"). The consent copy in
-- Profile settings states this explicitly.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles.is_admin — manual grant only (SQL / dashboard), default false.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

comment on column public.profiles.is_admin is
  'Reviewer/admin flag. Set manually via SQL or the Supabase dashboard only — '
  'never writable through the client API (see profiles_protect_is_admin trigger).';

-- Guard: the existing "profiles_update_own" policy (0001) lets a user update
-- any column of their own row, and "profiles_delete_own"/"profiles_insert_own"
-- would even allow a delete + re-insert with is_admin = true. A trigger is the
-- simplest robust guard: it covers both INSERT and UPDATE, needs no per-column
-- GRANT bookkeeping as future migrations add columns, and cannot be bypassed
-- by PostgREST upserts. It rejects any is_admin change coming from the API
-- roles (anon/authenticated); privileged roles (postgres via SQL editor or
-- migrations, service_role) pass through.
--
-- NOTE: intentionally NOT security definer — current_user must reflect the
-- caller's role, not the function owner's.
create or replace function public.profiles_protect_is_admin()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.is_admin then
        raise exception 'is_admin cannot be set by clients';
      end if;
    elsif new.is_admin is distinct from old.is_admin then
      raise exception 'is_admin cannot be changed by clients';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_is_admin
  before insert or update on public.profiles
  for each row execute function public.profiles_protect_is_admin();

-- ---------------------------------------------------------------------------
-- is_admin() — RLS helper. security definer so policies on other tables (and
-- storage.objects) can read the caller's profile row without depending on the
-- profiles RLS policies; it only ever reveals the caller's own flag.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.user_id = auth.uid()),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- sample_reviews — one review verdict per speech sample. PK = sample_id, so
-- re-reviewing is an upsert and the latest reviewer wins. corrected_text is
-- the reviewer's fixed transcription (verdict = 'corrected').
-- ---------------------------------------------------------------------------
create table if not exists public.sample_reviews (
  sample_id      uuid primary key references public.speech_samples (id) on delete cascade,
  reviewer_id    uuid not null references auth.users (id) on delete cascade,
  verdict        text not null check (verdict in ('verified', 'corrected', 'rejected')),
  corrected_text text,
  notes          text,
  created_at     timestamptz not null default now()
);

create index if not exists sample_reviews_reviewer_id_idx on public.sample_reviews (reviewer_id);

alter table public.sample_reviews enable row level security;

-- Only admins can see or write reviews; writes must be attributed to the
-- reviewer performing them. No delete policy: verdicts are replaced via
-- upsert, and sample deletion cascades.
create policy "sample_reviews_select_admin" on public.sample_reviews
  for select using (public.is_admin());
create policy "sample_reviews_insert_admin" on public.sample_reviews
  for insert with check (public.is_admin() and reviewer_id = auth.uid());
create policy "sample_reviews_update_admin" on public.sample_reviews
  for update using (public.is_admin())
  with check (public.is_admin() and reviewer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Admin read access to the review queue — additive (permissive policies OR
-- together with the own-rows policies from 0002).
-- ---------------------------------------------------------------------------
create policy "speech_samples_select_admin" on public.speech_samples
  for select using (public.is_admin());
create policy "corrections_select_admin" on public.corrections
  for select using (public.is_admin());

-- Admins can read retained recordings for signed-URL playback.
create policy "recordings_read_admin" on storage.objects
  for select using (bucket_id = 'recordings' and public.is_admin());

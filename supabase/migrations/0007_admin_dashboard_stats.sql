-- ============================================================================
-- 0007 — admin dashboard stats (privacy-preserving analytics aggregate)
--
-- Adds public.admin_dashboard_stats(days_window int default 30) → jsonb, the
-- single data source for the standalone admin app's dashboard.
--
-- Privacy design:
--   * The function returns ONLY aggregates — counts, distinct-user counts and
--     rounded averages. It never selects row-level user content: no message
--     bodies, no phrase text, no transcripts, no emails, no per-user rows.
--     Admins get product health stats without the ability to read anyone's
--     conversations through this surface.
--   * SECURITY DEFINER is required because the aggregates span every user's
--     rows, which per-user RLS (0001/0002/0003) would otherwise hide. The
--     definer privilege is gated: the FIRST statement in the body enforces
--     public.is_admin() (0005) and raises 'admin only' for everyone else, so
--     non-admin authenticated users get an error, never data.
--   * search_path is pinned (0006 hardening convention) and EXECUTE is
--     revoked from PUBLIC/anon; only authenticated (gated by is_admin())
--     and service_role may call it.
--
-- Shape (stable contract consumed by the admin app):
--   {
--     "generated_at": iso-utc,
--     "overview":    { total_users, new_users_7d, new_users_30d,
--                      active_users_7d, active_users_30d,
--                      data_consent_users, audio_consent_users,
--                      users_by_dialect: [{ dialect, users }] },
--     "languages":   [{ language_code, phrases, sessions,
--                       conversation_lessons, speech_samples }],
--     "engagement":  { phrases_total, phrases_bookmarked, sessions_total,
--                      lessons_started, lessons_completed, srs_active_users,
--                      review_states_total, exam_attempts, avg_exam_score },
--     "improvement": { hardest_lessons: [{ lesson_id, users, avg_accuracy }],
--                      stt_by_language: [{ language, samples, avg_score }],
--                      transcript_edits, suggestion_ratings_up,
--                      suggestion_ratings_down },
--     "daily":       [{ day, new_users, sessions, speech_samples }]
--   }
--
-- Semantics:
--   * "active user" in a window = distinct user_id with ANY of:
--     sessions.created_at, phrases.created_at, lesson_progress.last_accessed_at,
--     review_states.updated_at or speech_samples.created_at inside the window.
--   * languages[] groups content tables by coalesce(language_code, 'yue-HK')
--     (0004: NULL means legacy Cantonese data) and speech_samples by its
--     NOT NULL `language` column (0002).
--   * days_window is clamped to [7, 90] and only affects "daily"; the 7d/30d
--     overview figures are fixed windows.
--   * All date bucketing is done in UTC for determinism.
--   * An empty database returns the full shape with zeros / empty arrays /
--     null averages — never a null section (jsonb_agg is coalesced to '[]').
-- ============================================================================

create or replace function public.admin_dashboard_stats(days_window int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days        int;
  v_today       date;
  v_active_7d   int;
  v_active_30d  int;
  v_dialects    jsonb;
  v_overview    jsonb;
  v_languages   jsonb;
  v_engagement  jsonb;
  v_hardest     jsonb;
  v_stt         jsonb;
  v_improvement jsonb;
  v_daily       jsonb;
begin
  -- -------------------------------------------------------------------------
  -- Admin gate — MUST run before anything else. security definer bypasses
  -- RLS below, so this check is the entire authorization boundary.
  -- -------------------------------------------------------------------------
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  -- Clamp the daily window to a sane range (7..90 days); null → default 30.
  v_days  := least(90, greatest(7, coalesce(days_window, 30)));
  v_today := (now() at time zone 'utc')::date;

  -- -------------------------------------------------------------------------
  -- Active users — one pass over the union of activity timestamps.
  -- phrases/sessions created_at is nullable (0001: legacy IndexedDB imports);
  -- NULLs simply never match the window predicates.
  -- -------------------------------------------------------------------------
  with activity as (
    select user_id, created_at       as at from public.sessions       where created_at is not null
    union all
    select user_id, created_at       as at from public.phrases        where created_at is not null
    union all
    select user_id, last_accessed_at as at from public.lesson_progress
    union all
    select user_id, updated_at       as at from public.review_states
    union all
    select user_id, created_at       as at from public.speech_samples
  )
  select
    count(distinct user_id) filter (where at >= now() - interval '7 days'),
    count(distinct user_id) filter (where at >= now() - interval '30 days')
  into v_active_7d, v_active_30d
  from activity;

  -- Users per preferred dialect (profile setting — a preference label, not
  -- user content). Sorted by size, then name, for a stable UI order.
  select coalesce(
           jsonb_agg(
             jsonb_build_object('dialect', d.dialect, 'users', d.users)
             order by d.users desc, d.dialect
           ),
           '[]'::jsonb
         )
  into v_dialects
  from (
    select preferred_dialect as dialect, count(*)::int as users
    from public.profiles
    group by preferred_dialect
  ) d;

  select jsonb_build_object(
    'total_users',         (select count(*) from public.profiles),
    'new_users_7d',        (select count(*) from public.profiles
                             where created_at >= now() - interval '7 days'),
    'new_users_30d',       (select count(*) from public.profiles
                             where created_at >= now() - interval '30 days'),
    'active_users_7d',     v_active_7d,
    'active_users_30d',    v_active_30d,
    'data_consent_users',  (select count(*) from public.profiles where data_collection_consent),
    'audio_consent_users', (select count(*) from public.profiles where audio_retention_consent),
    'users_by_dialect',    v_dialects
  )
  into v_overview;

  -- -------------------------------------------------------------------------
  -- Per-language content counts. Content tables (0004) use nullable
  -- language_code where NULL = legacy 'yue-HK'; speech_samples (0002) uses a
  -- NOT NULL `language` column. Each source contributes one measure and the
  -- outer group-by merges them into one row per language code.
  -- -------------------------------------------------------------------------
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'language_code',        l.language_code,
               'phrases',              l.phrases,
               'sessions',             l.sessions,
               'conversation_lessons', l.conversation_lessons,
               'speech_samples',       l.speech_samples
             )
             order by l.language_code
           ),
           '[]'::jsonb
         )
  into v_languages
  from (
    select
      per_table.language_code,
      sum(per_table.phrases)::int              as phrases,
      sum(per_table.sessions)::int             as sessions,
      sum(per_table.conversation_lessons)::int as conversation_lessons,
      sum(per_table.speech_samples)::int       as speech_samples
    from (
      select coalesce(language_code, 'yue-HK') as language_code,
             count(*) as phrases, 0 as sessions, 0 as conversation_lessons, 0 as speech_samples
        from public.phrases group by 1
      union all
      select coalesce(language_code, 'yue-HK'), 0, count(*), 0, 0
        from public.sessions group by 1
      union all
      select coalesce(language_code, 'yue-HK'), 0, 0, count(*), 0
        from public.conversation_lessons group by 1
      union all
      select language, 0, 0, 0, count(*)
        from public.speech_samples group by 1
    ) per_table
    group by per_table.language_code
  ) l;

  -- -------------------------------------------------------------------------
  -- Engagement. lessons_completed requires total_levels > 0 so untouched
  -- placeholder rows never count as complete. avg_exam_score averages
  -- conversation_lessons.exam_best_score where present (null when no lesson
  -- has ever been exam-scored).
  -- -------------------------------------------------------------------------
  select jsonb_build_object(
    'phrases_total',       (select count(*) from public.phrases),
    'phrases_bookmarked',  (select count(*) from public.phrases where is_bookmarked),
    'sessions_total',      (select count(*) from public.sessions),
    'lessons_started',     (select count(*) from public.lesson_progress),
    'lessons_completed',   (select count(*) from public.lesson_progress
                             where total_levels > 0 and completed_levels >= total_levels),
    'srs_active_users',    (select count(distinct user_id) from public.review_states),
    'review_states_total', (select count(*) from public.review_states),
    'exam_attempts',       (select coalesce(sum(exam_attempts), 0) from public.conversation_lessons),
    'avg_exam_score',      (select round(avg(exam_best_score)::numeric, 1)
                              from public.conversation_lessons
                             where exam_best_score is not null)
  )
  into v_engagement;

  -- -------------------------------------------------------------------------
  -- Hardest lessons: lowest average last_accuracy first (graded attempts
  -- only), capped at 8. lesson_id is a static content id ("greetings-basics"
  -- — src/data/lessons.ts), not user content. lesson_progress is unique per
  -- (user_id, lesson_id), so the distinct-user count is the row count, but we
  -- count distinct explicitly to keep the semantics self-evident.
  -- -------------------------------------------------------------------------
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'lesson_id',    h.lesson_id,
               'users',        h.users,
               'avg_accuracy', h.avg_accuracy
             )
             order by h.avg_accuracy asc, h.lesson_id
           ),
           '[]'::jsonb
         )
  into v_hardest
  from (
    select lesson_id,
           count(distinct user_id)::int         as users,
           round(avg(last_accuracy)::numeric, 1) as avg_accuracy
    from public.lesson_progress
    where last_accuracy is not null
    group by lesson_id
    order by avg(last_accuracy) asc, lesson_id
    limit 8
  ) h;

  -- STT quality per language. avg(score) skips NULL scores; a language whose
  -- samples are all unscored yields avg_score = null (per contract).
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'language',  s.language,
               'samples',   s.samples,
               'avg_score', s.avg_score
             )
             order by s.samples desc, s.language
           ),
           '[]'::jsonb
         )
  into v_stt
  from (
    select language,
           count(*)::int                  as samples,
           round(avg(score)::numeric, 1)  as avg_score
    from public.speech_samples
    group by language
  ) s;

  -- Suggestion ratings live in public.corrections (0002) as
  -- kind = 'suggestion_rating' with rating in ('up', 'down'), so up/down are
  -- directly distinguishable. transcript_edits counts kind = 'transcript_edit'.
  select jsonb_build_object(
    'hardest_lessons',          v_hardest,
    'stt_by_language',          v_stt,
    'transcript_edits',         (select count(*) from public.corrections
                                  where kind = 'transcript_edit'),
    'suggestion_ratings_up',    (select count(*) from public.corrections
                                  where kind = 'suggestion_rating' and rating = 'up'),
    'suggestion_ratings_down',  (select count(*) from public.corrections
                                  where kind = 'suggestion_rating' and rating = 'down')
  )
  into v_improvement;

  -- -------------------------------------------------------------------------
  -- Daily series: the last v_days UTC days (today inclusive), zero-filled via
  -- generate_series so sparse or empty tables still yield a complete series.
  -- sessions.created_at is nullable (legacy imports) — undated rows are
  -- excluded from the daily buckets (they still count in sessions_total).
  -- -------------------------------------------------------------------------
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'day',            to_char(d.day, 'YYYY-MM-DD'),
               'new_users',      coalesce(nu.n, 0),
               'sessions',       coalesce(se.n, 0),
               'speech_samples', coalesce(ss.n, 0)
             )
             order by d.day
           ),
           '[]'::jsonb
         )
  into v_daily
  from (
    select gs::date as day
    from generate_series(v_today - (v_days - 1), v_today, interval '1 day') gs
  ) d
  left join (
    select (created_at at time zone 'utc')::date as day, count(*)::int as n
    from public.profiles
    group by 1
  ) nu on nu.day = d.day
  left join (
    select (created_at at time zone 'utc')::date as day, count(*)::int as n
    from public.sessions
    where created_at is not null
    group by 1
  ) se on se.day = d.day
  left join (
    select (created_at at time zone 'utc')::date as day, count(*)::int as n
    from public.speech_samples
    group by 1
  ) ss on ss.day = d.day;

  return jsonb_build_object(
    'generated_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'overview',     v_overview,
    'languages',    v_languages,
    'engagement',   v_engagement,
    'improvement',  v_improvement,
    'daily',        v_daily
  );
end;
$$;

comment on function public.admin_dashboard_stats(int) is
  'Admin-only dashboard aggregates (counts/averages only — never row-level '
  'user content). security definer to span RLS; gated by public.is_admin().';

-- ---------------------------------------------------------------------------
-- Execute grants (0006 hardening convention): strip the default PUBLIC grant,
-- keep authenticated (the in-function is_admin() gate does the real
-- authorization) and service_role.
-- ---------------------------------------------------------------------------
revoke execute on function public.admin_dashboard_stats(int) from public;
revoke execute on function public.admin_dashboard_stats(int) from anon;
grant execute on function public.admin_dashboard_stats(int) to authenticated;
grant execute on function public.admin_dashboard_stats(int) to service_role;

-- ============================================================================
-- 0006 — function hardening (Supabase security advisor findings after 0005)
--
--   1. Pin search_path on functions that lacked it (advisor lint 0011):
--      set_updated_at (0001) and profiles_protect_is_admin (0005).
--   2. Tighten EXECUTE on public.is_admin(): revoke the default PUBLIC/anon
--      grants. `authenticated` KEEPS execute — the RLS policies from 0005
--      evaluate is_admin() as the querying user, so revoking it from
--      authenticated would break every admin policy. The remaining advisor
--      warning for authenticated is intentional: the function only ever
--      reveals the caller's own flag.
-- ============================================================================

alter function public.set_updated_at() set search_path = public;
alter function public.profiles_protect_is_admin() set search_path = public;

revoke execute on function public.is_admin() from public;
revoke execute on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admin() to service_role;

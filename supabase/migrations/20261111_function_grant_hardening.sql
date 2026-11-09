-- ==========================================================
-- FUNCTION GRANT & SEARCH_PATH HARDENING (2026-11-11)
-- Fixes Supabase security advisor findings:
--   * anon_security_definer_function_executable — SECURITY DEFINER functions in
--     `public` callable by anon via /rest/v1/rpc/...
--   * function_search_path_mutable — functions without a fixed search_path.
--
-- Postgres grants EXECUTE to PUBLIC by default, so `revoke ... from anon` alone
-- is not enough: PUBLIC must be revoked too.
--
-- Trigger functions: EXECUTE is only checked at CREATE TRIGGER time, never when
-- the trigger fires, so revoking it from client roles cannot break the triggers.
--
-- Deliberately UNCHANGED (anon keeps EXECUTE):
--   * provision_guest_account — called by signed-out visitors to create a guest.
--   * resolve_space_invite    — invite / space-code lookup before sign-in.
--   * is_member_of_space, is_admin_of_space, is_member_of_group — RLS helpers
--     used by policies scoped to role PUBLIC (spaces, messages, rooms, ...).
--     Policies run as the querying role, so revoking anon would turn anon reads
--     of those tables into "permission denied" errors. They only answer about
--     auth.uid(), which is null for anon, so they leak nothing.
--
-- Idempotent and non-destructive: only grants and function config change.
-- ==========================================================

-- 1. Trigger-only functions: no client role should call them directly.
revoke execute on function public.auto_confirm_new_user()      from public, anon, authenticated;
revoke execute on function public.handle_new_user()            from public, anon, authenticated;
revoke execute on function public.sync_space_member_count()    from public, anon, authenticated;
revoke execute on function public.purge_expired_messages()     from public, anon, authenticated;
revoke execute on function public.guard_profile_system_role()  from public, anon, authenticated;

-- 2. Admin metrics: only the service-role admin API route calls this.
revoke execute on function public.get_admin_overview_metrics() from public, anon, authenticated;
grant  execute on function public.get_admin_overview_metrics() to service_role;

-- 3. Signed-in only (guests are real authenticated users).
--    is_system_admin: used by admin_audit_logs RLS + guard trigger; anon could
--    otherwise probe arbitrary user ids for admin status.
revoke execute on function public.is_system_admin(uuid)                from public, anon;
grant  execute on function public.is_system_admin(uuid)                to authenticated;
--    AI quota: called by companion API routes with the user's JWT.
revoke execute on function public.check_and_increment_ai_usage(integer) from public, anon;
grant  execute on function public.check_and_increment_ai_usage(integer) to authenticated;
revoke execute on function public.get_ai_usage_status(integer)          from public, anon;
grant  execute on function public.get_ai_usage_status(integer)          to authenticated;
--    Joining a space needs a user; for anon it only duplicated resolve_space_invite.
revoke execute on function public.join_space_via_invite(text)           from public, anon;
grant  execute on function public.join_space_via_invite(text)           to authenticated;

-- 4. Pin search_path on every function the advisor flagged as mutable.
alter function public.handle_new_user()             set search_path = public, pg_temp;
alter function public.sync_space_member_count()     set search_path = public, pg_temp;
alter function public.auto_confirm_new_user()       set search_path = public, pg_temp;
alter function public.purge_expired_messages()      set search_path = public, pg_temp;
alter function public.guard_profile_system_role()   set search_path = public, pg_temp;
alter function public.is_system_admin(uuid)         set search_path = public, pg_temp;
alter function public.get_admin_overview_metrics()  set search_path = public, pg_temp;

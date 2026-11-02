-- ==========================================================
-- FRIENDSHIP BACKFILL & TRIGGER FUNCTION GRANTS (2026-11-02)
-- 1. Requests accepted while accept_friend_request was missing never got a
--    friendships row; create the missing ones.
-- 2. Trigger functions are not meant to be called over the API. EXECUTE is only
--    checked when a trigger is created, not when it fires, so revoking it is safe.
-- Idempotent: safe to re-run. Inserts only; nothing is deleted.
-- ==========================================================

-- 1. Backfill friendships for accepted requests.
insert into public.friendships (user_one, user_two)
select distinct least(fr.sender_id, fr.receiver_id), greatest(fr.sender_id, fr.receiver_id)
from public.friend_requests fr
where fr.status = 'accepted'
on conflict (user_one, user_two) do nothing;

-- 2. Trigger / event-trigger functions: no direct API access.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.handle_new_user()',
    'public.sync_profile_paid_status()',
    'public.sync_space_member_count()',
    'public.rls_auto_enable()'
  ] loop
    if to_regprocedure(fn) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', fn);
    end if;
  end loop;
end;
$$;

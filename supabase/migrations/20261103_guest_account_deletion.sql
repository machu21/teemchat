-- ==========================================================
-- GUEST ACCOUNT DELETION (2026-11-03)
-- 1. delete_guest_account() failed for any guest who had sent a chat message:
--    messages.sender_id (and user_reports.reporter_id, call_sessions.started_by)
--    are NOT NULL but ON DELETE SET NULL, so deleting the auth.users row raised
--    23502 and the guest (plus its friendships) stayed behind. purge_guest_user()
--    removes those rows and guest-owned spaces first, then deletes the auth user;
--    profiles, friendships, friend_requests, space_members etc. cascade.
-- 2. delete_guest_account() only deletes the caller, and only when the caller's
--    server-controlled app metadata marks it as a guest.
-- 3. cleanup_stale_guest_accounts() removes guests with no session activity for
--    a day. It is service_role-only and also runs (bounded, best effort) each
--    time a new guest is provisioned, since pg_cron is not installed.
-- Idempotent: safe to re-run. Applying it deletes nothing by itself; the stale
-- cleanup first runs on the next guest provisioning.
-- ==========================================================

-- 1. Internal purge helper: not callable over the API.
create or replace function public.purge_guest_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_is_guest boolean;
begin
  if p_user_id is null then
    return false;
  end if;

  select coalesce((raw_app_meta_data->>'is_guest')::boolean, is_anonymous, false)
  into v_is_guest
  from auth.users
  where id = p_user_id;

  if v_is_guest is not true then
    return false;
  end if;

  -- Rows whose NOT NULL foreign key would otherwise block the delete.
  delete from public.messages where sender_id = p_user_id;
  delete from public.user_reports where reporter_id = p_user_id;
  delete from public.call_sessions where started_by = p_user_id;
  -- Guest spaces are temporary; don't leave them ownerless.
  delete from public.spaces where owner_id = p_user_id;

  delete from auth.users where id = p_user_id;
  return true;
end;
$$;

revoke execute on function public.purge_guest_user(uuid) from public, anon, authenticated;

-- 2. Self-service deletion on guest sign-out.
create or replace function public.delete_guest_account()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  return public.purge_guest_user(auth.uid());
end;
$$;

revoke execute on function public.delete_guest_account() from public, anon;
grant execute on function public.delete_guest_account() to authenticated;

-- 3. Abandoned guests: no session created or refreshed within p_max_idle.
create or replace function public.cleanup_stale_guest_accounts(
  p_max_idle interval default interval '24 hours',
  p_limit int default 50
)
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
  v_count int := 0;
begin
  for v_id in
    select u.id
    from auth.users u
    where coalesce((u.raw_app_meta_data->>'is_guest')::boolean, u.is_anonymous, false)
      and greatest(
            u.created_at,
            coalesce(u.last_sign_in_at, u.created_at),
            coalesce((
              select max(coalesce(s.refreshed_at, s.updated_at, s.created_at))
              from auth.sessions s
              where s.user_id = u.id
            ), u.created_at)
          ) < now() - p_max_idle
    order by u.created_at
    limit greatest(p_limit, 0)
  loop
    if public.purge_guest_user(v_id) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.cleanup_stale_guest_accounts(interval, int) from public, anon, authenticated;
grant execute on function public.cleanup_stale_guest_accounts(interval, int) to service_role;

-- Run a small cleanup batch whenever a guest is provisioned. Failures must
-- never block provisioning.
create or replace function public.cleanup_stale_guests_on_provision()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  begin
    perform public.cleanup_stale_guest_accounts(interval '24 hours', 20);
  exception when others then
    raise warning 'cleanup_stale_guest_accounts failed: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke execute on function public.cleanup_stale_guests_on_provision() from public, anon, authenticated;

drop trigger if exists trg_cleanup_stale_guests on public.guest_provision_log;
create trigger trg_cleanup_stale_guests
  after insert on public.guest_provision_log
  for each statement execute function public.cleanup_stale_guests_on_provision();

-- 4. cleanup_guest_user(uuid) keeps its signature for server code, but now
--    shares the purge path so it no longer fails on chat history.
create or replace function public.cleanup_guest_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return public.purge_guest_user(p_user_id);
end;
$$;

revoke execute on function public.cleanup_guest_user(uuid) from public, anon, authenticated;

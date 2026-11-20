-- ==========================================================
-- Migration: Verify Email Later (2026-11-21)
-- New email/password accounts sign in straight away, then prove they own the
-- address by entering a 6-digit code (Supabase email OTP, sent with
-- signInWithOtp + shouldCreateUser:false) or clicking the magic link.
--
-- 1. Keeps auto-confirm on, so Supabase's own "Confirm email" gate never blocks
--    sign-in (re-created here in case an earlier draft migration dropped it).
-- 2. public.email_verifications records who has proven inbox ownership. Only
--    SECURITY DEFINER functions write it, so users cannot mark themselves.
-- 3. Existing accounts are grandfathered as verified; Google/Apple sign-ups are
--    verified by their provider. Guests are exempt (they expire within a day).
-- 4. public.check_email_verification() returns the caller's status and records
--    verification when the caller's JWT was minted by an email OTP / magic link
--    in the last 15 minutes (the signed `amr` claim, so it cannot be faked).
-- 5. Friend requests and direct messages require a verified email (RLS).
-- 6. cleanup_unverified_accounts() deletes email accounts still unverified 7
--    days after sign-up (never paid or staff accounts). pg_cron is not
--    installed, so it also runs bounded, best effort, from each status check.
-- Idempotent: safe to re-run. Applying it deletes nothing by itself.
-- ==========================================================

-- 1. Auto-confirm (sign-in is never blocked on email confirmation)
create or replace function public.auto_confirm_new_user()
returns trigger as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created_auto_confirm on auth.users;
create trigger on_auth_user_created_auto_confirm
  before insert on auth.users
  for each row execute procedure public.auto_confirm_new_user();

revoke execute on function public.auto_confirm_new_user() from public, anon, authenticated;
alter function public.auto_confirm_new_user() set search_path = public, pg_temp;

-- 2. Verification records
create table if not exists public.email_verifications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  method text not null default 'otp', -- 'otp', 'magiclink', 'google', 'apple', 'grandfathered', 'admin'
  verified_at timestamptz not null default now()
);

alter table public.email_verifications enable row level security;

drop policy if exists "Users can view their own email verification" on public.email_verifications;
create policy "Users can view their own email verification" on public.email_verifications
  for select using ((select auth.uid()) = user_id);
-- No insert/update/delete policies: only the SECURITY DEFINER functions below write it.

-- 3a. Grandfather every existing non-guest account
insert into public.email_verifications (user_id, method, verified_at)
select u.id, 'grandfathered', now()
from auth.users u
where coalesce((u.raw_app_meta_data->>'is_guest')::boolean, u.is_anonymous, false) is not true
on conflict (user_id) do nothing;

-- 3b. OAuth sign-ups arrive with a provider-verified email
create or replace function public.record_provider_email_verification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_provider text := coalesce(new.raw_app_meta_data->>'provider', 'email');
begin
  if v_provider <> 'email'
     and coalesce((new.raw_app_meta_data->>'is_guest')::boolean, new.is_anonymous, false) is not true then
    insert into public.email_verifications (user_id, method)
    values (new.id, v_provider)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_provider_verified on auth.users;
create trigger on_auth_user_created_provider_verified
  after insert on auth.users
  for each row execute procedure public.record_provider_email_verification();

revoke execute on function public.record_provider_email_verification() from public, anon, authenticated;

-- 4a. RLS helper: verified, or a guest (guests have no real inbox and expire in a day)
create or replace function private.is_email_verified(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select p_user is not null and (
    exists (select 1 from public.email_verifications v where v.user_id = p_user)
    or exists (
      select 1 from auth.users u
      where u.id = p_user
        and coalesce((u.raw_app_meta_data->>'is_guest')::boolean, u.is_anonymous, false)
    )
  );
$$;

revoke execute on function private.is_email_verified(uuid) from public, anon;
grant execute on function private.is_email_verified(uuid) to authenticated, service_role;

-- 6. Cleanup (defined before 4b, which calls it)
create or replace function public.cleanup_unverified_accounts(p_limit int default 10, p_days int default 7)
returns int
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user record;
  v_deleted int := 0;
begin
  for v_user in
    select u.id
    from auth.users u
    left join public.profiles p on p.id = u.id
    where u.created_at < now() - make_interval(days => greatest(p_days, 1))
      and coalesce(u.raw_app_meta_data->>'provider', 'email') = 'email'
      and coalesce((u.raw_app_meta_data->>'is_guest')::boolean, u.is_anonymous, false) is not true
      and not exists (select 1 from public.email_verifications v where v.user_id = u.id)
      and coalesce(p.is_paid, false) = false
      and coalesce(p.plan, 'free') = 'free'
      and p.system_role is null
    order by u.created_at
    limit least(greatest(p_limit, 1), 100)
  loop
    begin
      -- Rows whose NOT NULL foreign key would otherwise block the delete (as purge_guest_user).
      delete from public.messages where sender_id = v_user.id;
      delete from public.user_reports where reporter_id = v_user.id;
      delete from public.call_sessions where started_by = v_user.id;
      delete from public.spaces where owner_id = v_user.id;
      delete from auth.users where id = v_user.id;
      v_deleted := v_deleted + 1;
    exception when others then
      raise notice 'cleanup_unverified_accounts: skipped % (%)', v_user.id, sqlerrm;
    end;
  end loop;
  return v_deleted;
end;
$$;

revoke execute on function public.cleanup_unverified_accounts(int, int) from public, anon, authenticated;
grant execute on function public.cleanup_unverified_accounts(int, int) to service_role;

-- 4b. Status check + verification capture for the signed-in user
create or replace function public.check_email_verification()
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_amr jsonb := coalesce(auth.jwt() -> 'amr', '[]'::jsonb);
  v_method text;
begin
  if v_uid is null then
    return false;
  end if;

  -- Best effort, bounded housekeeping (no pg_cron); never blocks the status check.
  begin
    perform public.cleanup_unverified_accounts(5, 7);
  exception when others then
    null;
  end;

  if private.is_email_verified(v_uid) then
    return true;
  end if;

  -- A session minted by an email OTP / magic link proves the caller reads this inbox.
  select elem->>'method' into v_method
  from jsonb_array_elements(case when jsonb_typeof(v_amr) = 'array' then v_amr else '[]'::jsonb end) elem
  -- Never 'password' / 'email/signup': those come from the (unverified) sign-up itself.
  where elem->>'method' in ('otp', 'magiclink', 'recovery')
    and coalesce((elem->>'timestamp')::bigint, 0) >= extract(epoch from now())::bigint - 900
  limit 1;

  if v_method is null then
    return false;
  end if;

  insert into public.email_verifications (user_id, method)
  values (v_uid, case when v_method = 'magiclink' then 'magiclink' else 'otp' end)
  on conflict (user_id) do nothing;
  return true;
end;
$$;

revoke execute on function public.check_email_verification() from public, anon;
grant execute on function public.check_email_verification() to authenticated;

-- 5. Friend requests and DMs need a verified email (existing conditions kept)
drop policy if exists "Users can send friend requests" on public.friend_requests;
create policy "Users can send friend requests" on public.friend_requests
  for insert with check (
    (select auth.uid()) = sender_id
    and status = 'pending'
    and private.can_befriend(sender_id, receiver_id)
    and private.is_email_verified((select auth.uid()))
  );

drop policy if exists "Participants can send direct messages" on public.direct_messages;
create policy "Participants can send direct messages" on public.direct_messages
  for insert with check (
    (select auth.uid()) = sender_id
    and private.is_email_verified((select auth.uid()))
    and exists (
      select 1 from public.buddy_conversations c
      where c.id = conversation_id
        and (select auth.uid()) in (c.user_one, c.user_two)
        and private.can_contact(
          (select auth.uid()),
          case when c.user_one = (select auth.uid()) then c.user_two else c.user_one end
        )
    )
  );

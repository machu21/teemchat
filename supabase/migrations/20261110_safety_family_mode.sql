-- ==========================================================
-- SAFETY & FAMILY MODE (2026-11-10)
-- ----------------------------------------------------------
-- * user_safety: private birthdate + family-mode preferences (owner read only,
--   writes only through RPCs so the birthdate is write-once).
-- * private.* helpers (not exposed through PostgREST) used by RLS:
--   age bands, blocks, friendship and "can these two users contact" checks.
-- * Tightened INSERT policies on friend_requests, buddy_conversations,
--   direct_messages, messages and space_members (blocks, minors, bans, mutes).
-- * Host moderation RPC (kick / ban / mute) with audit log.
-- Idempotent. Guests are real auth.users rows, so everything keys on auth.uid().
-- ==========================================================

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- ----------------------------------------------------------
-- 1. user_safety
-- ----------------------------------------------------------
create table if not exists public.user_safety (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  birth_date date,
  chat_filter boolean not null default true,
  dm_privacy text not null default 'friends' check (dm_privacy in ('everyone', 'friends')),
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);
alter table public.user_safety enable row level security;

drop policy if exists "Users can view their own safety settings" on public.user_safety;
create policy "Users can view their own safety settings" on public.user_safety
  for select using ((select auth.uid()) = user_id);
-- No insert/update/delete policies: writes go through the RPCs below.

-- ----------------------------------------------------------
-- 2. Private helpers (callable from RLS, not from the REST API)
-- ----------------------------------------------------------
create or replace function private.age_band_of(p_user uuid)
returns text
language sql
stable security definer
set search_path = public
as $$
  select case
    when b.birth_date is null then 'unknown'
    when b.birth_date > (current_date - interval '13 years')::date then 'child'
    when b.birth_date > (current_date - interval '18 years')::date then 'teen'
    else 'adult'
  end
  from (select (select s.birth_date from public.user_safety s where s.user_id = p_user) as birth_date) b;
$$;

create or replace function private.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = p_a and blocked_user_id = p_b)
       or (blocker_id = p_b and blocked_user_id = p_a)
  );
$$;

create or replace function private.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships
    where user_one = least(p_a, p_b) and user_two = greatest(p_a, p_b)
  );
$$;

-- Friend requests: not blocked either way, and never adult <-> child.
create or replace function private.can_befriend(p_sender uuid, p_receiver uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select not private.is_blocked_between(p_sender, p_receiver)
    and not (
      (private.age_band_of(p_sender) = 'adult' and private.age_band_of(p_receiver) = 'child')
      or (private.age_band_of(p_sender) = 'child' and private.age_band_of(p_receiver) = 'adult')
    );
$$;

-- Direct messages: can_befriend, plus minors / friends-only users only hear from friends.
create or replace function private.can_contact(p_sender uuid, p_receiver uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select private.can_befriend(p_sender, p_receiver)
    and (
      private.are_friends(p_sender, p_receiver)
      or (
        private.age_band_of(p_receiver) = 'adult'
        and private.age_band_of(p_sender) <> 'child'
        and coalesce(
          (select s.dm_privacy from public.user_safety s where s.user_id = p_receiver),
          'friends'
        ) = 'everyone'
      )
    );
$$;

create or replace function private.has_space_restriction(p_space uuid, p_user uuid, p_kind text)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select case p_kind
    when 'ban' then exists (
      select 1 from public.space_bans b
      where b.space_id = p_space and b.user_id = p_user
        and (b.expires_at is null or b.expires_at > now())
    )
    else exists (
      select 1 from public.space_mutes m
      where m.space_id = p_space and m.user_id = p_user
        and m.mute_type in (p_kind, 'all')
        and (m.expires_at is null or m.expires_at > now())
    )
  end;
$$;

revoke all on all functions in schema private from public, anon;
grant execute on function private.age_band_of(uuid) to authenticated, service_role;
grant execute on function private.is_blocked_between(uuid, uuid) to authenticated, service_role;
grant execute on function private.are_friends(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_befriend(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_contact(uuid, uuid) to authenticated, service_role;
grant execute on function private.has_space_restriction(uuid, uuid, text) to authenticated, service_role;

-- ----------------------------------------------------------
-- 3. Public RPCs
-- ----------------------------------------------------------
create or replace function public.get_my_safety()
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.user_safety%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  select * into v_row from public.user_safety where user_id = v_uid;
  return jsonb_build_object(
    'age_band', private.age_band_of(v_uid),
    'has_birth_date', v_row.birth_date is not null,
    'chat_filter', coalesce(v_row.chat_filter, true),
    'dm_privacy', coalesce(v_row.dm_privacy, 'friends')
  );
end;
$$;

-- Write-once. With p_date null it falls back to the birth_date captured at signup
-- (auth user metadata), so password signups never see the age gate.
create or replace function public.set_my_birth_date(p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_date date := p_date;
  v_existing date;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if v_date is null then
    select nullif(u.raw_user_meta_data->>'birth_date', '')::date into v_date
    from auth.users u where u.id = v_uid;
    if v_date is null then
      return public.get_my_safety();
    end if;
  end if;

  if v_date > current_date or v_date < (current_date - interval '120 years')::date then
    raise exception 'Invalid birth date';
  end if;

  select birth_date into v_existing from public.user_safety where user_id = v_uid;
  if v_existing is not null then
    raise exception 'Birth date already set';
  end if;

  insert into public.user_safety (user_id, birth_date)
  values (v_uid, v_date)
  on conflict (user_id) do update set birth_date = excluded.birth_date, updated_at = now();

  if private.age_band_of(v_uid) = 'child' then
    update public.user_safety set chat_filter = true, dm_privacy = 'friends', updated_at = now()
    where user_id = v_uid;
  end if;

  return public.get_my_safety();
end;
$$;

create or replace function public.update_my_safety(p_chat_filter boolean default null, p_dm_privacy text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_child boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_dm_privacy is not null and p_dm_privacy not in ('everyone', 'friends') then
    raise exception 'Invalid dm_privacy';
  end if;

  v_child := private.age_band_of(v_uid) = 'child';

  insert into public.user_safety (user_id) values (v_uid) on conflict (user_id) do nothing;

  update public.user_safety set
    chat_filter = case when v_child then true else coalesce(p_chat_filter, chat_filter) end,
    dm_privacy = case when v_child then 'friends' else coalesce(p_dm_privacy, dm_privacy) end,
    updated_at = now()
  where user_id = v_uid;

  return public.get_my_safety();
end;
$$;

-- Lets the UI hide "Add Friend" / "Message" before the insert would be rejected.
-- Returns booleans only: never reveals the other user's age band.
create or replace function public.contact_permissions(p_other uuid)
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'can_befriend', private.can_befriend(auth.uid(), p_other),
    'can_message', private.can_contact(auth.uid(), p_other)
  );
$$;

create or replace function public.my_space_restrictions(p_space uuid)
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'banned', private.has_space_restriction(p_space, auth.uid(), 'ban'),
    'voice_muted', private.has_space_restriction(p_space, auth.uid(), 'voice'),
    'chat_muted', private.has_space_restriction(p_space, auth.uid(), 'chat')
  );
$$;

create or replace function public.am_i_space_moderator(p_space uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select public.is_admin_of_space(p_space)
    or exists (select 1 from public.spaces s where s.id = p_space and s.owner_id = auth.uid());
$$;

create or replace function public.moderate_space_member(
  p_space uuid,
  p_user uuid,
  p_action text,
  p_minutes int default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_expires timestamptz;
  v_reason text := left(nullif(trim(coalesce(p_reason, '')), ''), 300);
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if not public.am_i_space_moderator(p_space) then
    raise exception 'Not a moderator of this space';
  end if;
  if p_user is null or p_user = v_uid then
    raise exception 'Invalid target';
  end if;
  select owner_id into v_owner from public.spaces where id = p_space;
  if v_owner = p_user then
    raise exception 'Cannot moderate the space owner';
  end if;
  -- Admins cannot act on other admins; only the owner can.
  if v_owner <> v_uid and exists (
    select 1 from public.space_members
    where space_id = p_space and user_id = p_user and role in ('owner', 'admin')
  ) then
    raise exception 'Only the owner can moderate admins';
  end if;

  if p_action = 'kick' then
    v_expires := now() + interval '10 minutes';
  elsif p_minutes is not null and p_minutes > 0 then
    v_expires := now() + make_interval(mins => least(p_minutes, 525600));
  else
    v_expires := null; -- permanent
  end if;

  if p_action in ('kick', 'ban') then
    insert into public.space_bans (space_id, user_id, banned_by, reason, expires_at)
    values (p_space, p_user, v_uid, v_reason, v_expires)
    on conflict (space_id, user_id) do update
      set banned_by = excluded.banned_by, reason = excluded.reason,
          expires_at = excluded.expires_at, created_at = now();
    delete from public.space_members
    where space_id = p_space and user_id = p_user and role = 'member';
  elsif p_action = 'unban' then
    delete from public.space_bans where space_id = p_space and user_id = p_user;
  elsif p_action in ('mute_voice', 'mute_chat') then
    insert into public.space_mutes (space_id, user_id, muted_by, mute_type, reason, expires_at)
    values (p_space, p_user, v_uid, case p_action when 'mute_voice' then 'voice' else 'chat' end, v_reason, v_expires)
    on conflict (space_id, user_id, mute_type) do update
      set muted_by = excluded.muted_by, reason = excluded.reason,
          expires_at = excluded.expires_at, created_at = now();
  elsif p_action = 'unmute' then
    delete from public.space_mutes where space_id = p_space and user_id = p_user;
  else
    raise exception 'Unknown action';
  end if;

  insert into public.space_audit_logs (space_id, actor_id, action, target_type, target_id, details)
  values (
    p_space, v_uid, 'moderation.' || p_action, 'user', p_user::text,
    jsonb_build_object('reason', v_reason, 'expires_at', v_expires)
  );

  return jsonb_build_object('ok', true, 'action', p_action, 'expires_at', v_expires);
end;
$$;

revoke execute on function public.get_my_safety() from public, anon;
revoke execute on function public.set_my_birth_date(date) from public, anon;
revoke execute on function public.update_my_safety(boolean, text) from public, anon;
revoke execute on function public.contact_permissions(uuid) from public, anon;
revoke execute on function public.my_space_restrictions(uuid) from public, anon;
revoke execute on function public.am_i_space_moderator(uuid) from public, anon;
revoke execute on function public.moderate_space_member(uuid, uuid, text, int, text) from public, anon;
grant execute on function public.get_my_safety() to authenticated;
grant execute on function public.set_my_birth_date(date) to authenticated;
grant execute on function public.update_my_safety(boolean, text) to authenticated;
grant execute on function public.contact_permissions(uuid) to authenticated;
grant execute on function public.my_space_restrictions(uuid) to authenticated;
grant execute on function public.am_i_space_moderator(uuid) to authenticated;
grant execute on function public.moderate_space_member(uuid, uuid, text, int, text) to authenticated;

-- ----------------------------------------------------------
-- 4. Tightened INSERT policies (existing conditions kept, safety added)
-- ----------------------------------------------------------
drop policy if exists "Users can send friend requests" on public.friend_requests;
create policy "Users can send friend requests" on public.friend_requests
  for insert with check (
    (select auth.uid()) = sender_id
    and status = 'pending'
    and private.can_befriend(sender_id, receiver_id)
  );

drop policy if exists "Participants can create buddy conversations" on public.buddy_conversations;
create policy "Participants can create buddy conversations" on public.buddy_conversations
  for insert with check (
    (select auth.uid()) in (user_one, user_two)
    and private.can_contact(
      (select auth.uid()),
      case when user_one = (select auth.uid()) then user_two else user_one end
    )
  );

drop policy if exists "Participants can send direct messages" on public.direct_messages;
create policy "Participants can send direct messages" on public.direct_messages
  for insert with check (
    (select auth.uid()) = sender_id
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

-- Production also had "Anyone can insert room messages into public spaces" (no sender
-- check): it allowed sender spoofing and would bypass chat mutes. This policy replaces it
-- and also covers unlisted spaces, which that one allowed.
drop policy if exists "Anyone can insert room messages into public spaces" on public.messages;
drop policy if exists "Members can insert room messages" on public.messages;
create policy "Members can insert room messages" on public.messages
  for insert with check (
    (select auth.uid()) = sender_id
    and (
      public.is_member_of_space(space_id)
      or exists (
        select 1 from public.spaces s
        where s.id = space_id and s.visibility in ('public', 'unlisted')
      )
    )
    and not private.has_space_restriction(space_id, (select auth.uid()), 'ban')
    and not private.has_space_restriction(space_id, (select auth.uid()), 'chat')
  );

drop policy if exists "Users can join public spaces or with invites" on public.space_members;
create policy "Users can join public spaces or with invites" on public.space_members
  for insert with check (
    (select auth.uid()) = user_id
    and not private.has_space_restriction(space_id, (select auth.uid()), 'ban')
    and exists (
      select 1 from public.spaces s
      where s.id = space_id
        and (
          (s.visibility = 'public' and role = 'member')
          or (s.owner_id = (select auth.uid()) and role in ('member', 'owner'))
        )
    )
  );

-- ----------------------------------------------------------
-- 5. Invite joins respect bans (security definer bypasses the space_members policy)
-- ----------------------------------------------------------
create or replace function public.join_space_via_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space public.spaces;
  v_uid uuid := auth.uid();
begin
  select * into v_space from public.resolve_space_invite(p_code);
  if v_space.id is null then
    return null;
  end if;

  if v_uid is not null and private.has_space_restriction(v_space.id, v_uid, 'ban') then
    return null;
  end if;

  if v_uid is not null and exists (select 1 from public.profiles where id = v_uid) then
    insert into public.space_members(space_id, user_id, role)
    values (v_space.id, v_uid, 'member')
    on conflict (space_id, user_id) do nothing;

    update public.space_invites
    set uses_count = uses_count + 1
    where space_id = v_space.id and lower(code) = lower(btrim(p_code));
  end if;

  return v_space.id;
end;
$$;

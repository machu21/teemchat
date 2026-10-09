-- Migration: 20261006_invite_and_guest_sessions.sql
-- Description: Enable frictionless invite flow and ephemeral guest sessions

-- 1. Ensure join_code column and unique index
alter table public.spaces add column if not exists join_code text;

update public.spaces
set join_code = upper(substr(md5(random()::text || id::text), 1, 8))
where join_code is null or join_code = '';

create unique index if not exists idx_spaces_join_code_lower on public.spaces (lower(join_code)) where join_code is not null;

create or replace function public.set_space_join_code()
returns trigger language plpgsql as $$
begin
  if new.join_code is null or btrim(new.join_code) = '' then
    new.join_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_set_space_join_code') then
    create trigger trg_set_space_join_code
    before insert on public.spaces
    for each row execute function public.set_space_join_code();
  end if;
end $$;

-- 2. Spaces SELECT RLS Policy: public/unlisted viewable by anyone, private viewable by owner or members
alter policy "Public spaces are viewable by everyone" on public.spaces
  using (
    visibility in ('public', 'unlisted')
    or owner_id = auth.uid()
    or public.is_member_of_space(id)
  );

-- 3. Space Invites SELECT and INSERT Policies
alter policy "Space members can create invites" on public.space_invites
  with check (
    public.is_member_of_space(space_id)
    or exists (select 1 from public.spaces s where s.id = space_id and s.owner_id = auth.uid())
  );

-- 4. Safe resolver function that handles slug, join_code, space_invites code, and direct id
create or replace function public.resolve_space_invite(p_code text)
returns setof public.spaces
language sql
stable
security definer
set search_path = public
as $$
  select s.*
  from public.spaces s
  where btrim(p_code) <> ''
    and (
      -- Public / unlisted space matches
      (lower(s.slug) = lower(btrim(p_code)) and s.visibility in ('public', 'unlisted'))
      or (s.id::text = btrim(p_code) and s.visibility in ('public', 'unlisted'))
      -- Join code match (works for any space, including private)
      or (lower(s.join_code) = lower(btrim(p_code)))
      -- Active invite code match (works for any space)
      or exists (
        select 1 from public.space_invites si
        where si.space_id = s.id
          and lower(si.code) = lower(btrim(p_code))
          and (si.expires_at is null or si.expires_at > now())
          and (si.max_uses is null or si.uses_count < si.max_uses)
      )
    )
  limit 1;
$$;

-- 5. RPC: Join space via invite (adds member row for authenticated user, updates invite uses)
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

-- 6. RPC: Provision ephemeral guest account in auth.users and public.profiles
create or replace function public.provision_guest_account(
  p_display_name text,
  p_password text,
  p_avatar_config jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid := gen_random_uuid();
  v_rand int := floor(random() * 9000 + 1000)::int;
  v_username text := 'guest_' || v_rand || '_' || to_char(now(), 'HH24MISS');
  v_email text := v_username || '@guest.teemchat.local';
  v_encrypted_pw text;
begin
  v_encrypted_pw := crypt(p_password, gen_salt('bf'));

  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    phone,
    phone_change,
    phone_change_token,
    email_change_token_current,
    reauthentication_token,
    raw_app_meta_data,
    raw_user_meta_data,
    is_anonymous,
    created_at,
    updated_at
  ) values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email,
    v_encrypted_pw,
    now(),
    '',
    '',
    '',
    '',
    null,
    '',
    '',
    '',
    '',
    jsonb_build_object('provider', 'email', 'providers', array['email'], 'is_guest', true),
    jsonb_build_object('display_name', p_display_name, 'username', v_username, 'is_guest', true),
    false,
    now(),
    now()
  );

  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email',
    v_user_id::text,
    now(),
    now(),
    now()
  );

  insert into public.profiles (
    id,
    username,
    display_name,
    avatar_config,
    is_paid,
    tier,
    has_ai_companion,
    created_at,
    updated_at
  ) values (
    v_user_id,
    v_username,
    p_display_name,
    p_avatar_config,
    false,
    'free',
    false,
    now(),
    now()
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    avatar_config = excluded.avatar_config;

  return jsonb_build_object(
    'user_id', v_user_id,
    'email', v_email,
    'username', v_username,
    'display_name', p_display_name
  );
end;
$$;

-- 7. RPC: Delete guest account when signing out or exiting
create or replace function public.delete_guest_account()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_is_guest boolean;
begin
  if v_uid is null then
    return false;
  end if;

  select coalesce((raw_app_meta_data->>'is_guest')::boolean, is_anonymous, false)
  into v_is_guest
  from auth.users
  where id = v_uid;

  if v_is_guest is true then
    delete from auth.users where id = v_uid;
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.cleanup_guest_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_is_guest boolean;
begin
  select coalesce((raw_app_meta_data->>'is_guest')::boolean, is_anonymous, false)
  into v_is_guest
  from auth.users
  where id = p_user_id;

  if v_is_guest is true then
    delete from auth.users where id = p_user_id;
    return true;
  end if;
  return false;
end;
$$;

-- 8. Grant execute to anon and authenticated
grant execute on function public.resolve_space_invite(text) to anon, authenticated;
grant execute on function public.join_space_via_invite(text) to anon, authenticated;
grant execute on function public.provision_guest_account(text, text, jsonb) to anon, authenticated;
grant execute on function public.delete_guest_account() to authenticated;
grant execute on function public.cleanup_guest_user(uuid) to anon, authenticated;

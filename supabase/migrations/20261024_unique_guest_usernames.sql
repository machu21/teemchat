-- Migration: Support deterministic unique guest usernames
-- Date: 2026-10-24

drop function if exists public.provision_guest_account(text, text, jsonb, text);
drop function if exists public.provision_guest_account(text, text, jsonb, text, text);

create or replace function public.provision_guest_account(
  p_display_name text,
  p_password text,
  p_avatar_config jsonb default '{}'::jsonb,
  p_gender text default 'male',
  p_username text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid := gen_random_uuid();
  v_rand int := floor(random() * 9000 + 1000)::int;
  v_username text;
  v_email text;
  v_encrypted_pw text;
  v_gender text;
begin
  v_gender := lower(coalesce(nullif(p_gender, ''), 'male'));
  if v_gender not in ('male', 'female') then
    v_gender := 'male';
  end if;

  if p_username is not null and length(trim(p_username)) > 0 then
    v_username := lower(regexp_replace(trim(p_username), '[^a-zA-Z0-9_]', '', 'g'));
    -- If this username is already taken, append a random discriminator
    if exists (select 1 from public.profiles where username = v_username) then
      v_username := v_username || '_' || v_rand;
    end if;
  else
    v_username := 'guest_' || v_rand || '_' || to_char(now(), 'HH24MISS');
  end if;

  v_email := v_username || '@guest.teemchat.local';
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
    jsonb_build_object('display_name', p_display_name, 'username', v_username, 'is_guest', true, 'gender', v_gender),
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
    gender,
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
    v_gender,
    p_avatar_config,
    false,
    'free',
    false,
    now(),
    now()
  )
  on conflict (id) do update set
    username = excluded.username,
    display_name = excluded.display_name,
    avatar_config = excluded.avatar_config,
    gender = excluded.gender;

  return jsonb_build_object(
    'user_id', v_user_id,
    'email', v_email,
    'username', v_username,
    'display_name', p_display_name,
    'gender', v_gender
  );
end;
$$;

grant execute on function public.provision_guest_account(text, text, jsonb, text, text) to anon, authenticated;

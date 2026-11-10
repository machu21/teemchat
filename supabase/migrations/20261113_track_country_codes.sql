-- ==========================================================
-- TEEMCHAT COUNTRY TRACKING MIGRATION (2026-11-13)
-- Tracks 2-letter ISO country codes for:
-- 1. Registered users (profiles.country_code)
-- 2. Anonymous guest telemetry (guest_provision_log.country_code, guest_username, session_id)
-- 3. Updates provision_guest_account to resolve & store country
-- ==========================================================

-- 1. Profiles Country Code Column
alter table public.profiles
  add column if not exists country_code text default 'XX';

create index if not exists idx_profiles_country_code on public.profiles(country_code);

-- 2. Guest Provisioning Log Country & Handle Columns
alter table public.guest_provision_log
  add column if not exists country_code text default 'XX';

alter table public.guest_provision_log
  add column if not exists guest_username text;

alter table public.guest_provision_log
  add column if not exists session_id text;

create index if not exists idx_guest_provision_log_country on public.guest_provision_log(country_code);
create index if not exists idx_guest_provision_log_username on public.guest_provision_log(guest_username);

-- 3. Update provision_guest_account with country resolution
create or replace function public.provision_guest_account(
  p_display_name text,
  p_password text,
  p_avatar_config jsonb default '{}'::jsonb,
  p_gender text default 'male',
  p_username text default null,
  p_country_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid := gen_random_uuid();
  v_headers json;
  v_ip text;
  v_country text;
  v_base text;
  v_username text;
  v_display_name text;
  v_email text;
  v_encrypted_pw text;
  v_gender text;
  v_attempt int := 0;
begin
  -- Client IP as seen by the API gateway (Cloudflare sets cf-connecting-ip).
  v_headers := nullif(current_setting('request.headers', true), '')::json;
  v_ip := coalesce(
    nullif(v_headers->>'cf-connecting-ip', ''),
    nullif(v_headers->>'x-real-ip', ''),
    nullif(btrim(split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1)), ''),
    'unknown'
  );

  -- Country code from parameters, Cloudflare header, or Vercel header
  v_country := coalesce(
    nullif(upper(btrim(p_country_code)), ''),
    nullif(upper(btrim(v_headers->>'cf-ipcountry')), ''),
    nullif(upper(btrim(v_headers->>'x-vercel-ip-country')), ''),
    'XX'
  );
  if length(v_country) > 3 or v_country in ('T1', 'A1', 'A2') then
    v_country := 'XX';
  end if;

  -- Serialize throttle checks per IP so concurrent calls cannot overshoot.
  perform pg_advisory_xact_lock(hashtext('guest_provision:' || v_ip));

  if (select count(*) from public.guest_provision_log
      where client_ip = v_ip and created_at > now() - interval '15 minutes') >= 10 then
    raise exception 'Too many guest sessions from this network. Please try again later.'
      using errcode = 'P0429';
  end if;

  if (select count(*) from public.guest_provision_log
      where created_at > now() - interval '1 minute') >= 300 then
    raise exception 'Guest sign-ups are temporarily busy. Please try again shortly.'
      using errcode = 'P0429';
  end if;

  delete from public.guest_provision_log where created_at < now() - interval '1 day';
  insert into public.guest_provision_log (client_ip, country_code, guest_username, session_id)
  values (v_ip, v_country, coalesce(p_username, 'guest'), v_user_id::text);

  if p_password is null or length(p_password) < 12 or length(p_password) > 128 then
    raise exception 'Invalid guest credentials' using errcode = '22023';
  end if;

  v_gender := lower(coalesce(nullif(p_gender, ''), 'male'));
  if v_gender not in ('male', 'female') then
    v_gender := 'male';
  end if;

  v_display_name := left(coalesce(nullif(btrim(p_display_name), ''), 'Explorer'), 32);

  if p_avatar_config is null or jsonb_typeof(p_avatar_config) <> 'object'
     or length(p_avatar_config::text) > 4096 then
    p_avatar_config := '{}'::jsonb;
  end if;

  v_base := left(lower(regexp_replace(coalesce(p_username, ''), '[^a-zA-Z0-9_]', '', 'g')), 24);
  if length(v_base) < 3 then
    v_base := 'guest_' || floor(random() * 9000 + 1000)::int;
  end if;

  -- Pick a free username, retrying with fresh discriminators on collision.
  v_username := v_base;
  while exists (select 1 from public.profiles where username = v_username)
     or exists (select 1 from auth.users where email = v_username || '@guest.teemchat.local') loop
    v_attempt := v_attempt + 1;
    if v_attempt > 8 then
      v_username := 'guest_' || replace(gen_random_uuid()::text, '-', '');
      exit;
    end if;
    v_username := v_base || '_' || floor(random() * 90000 + 10000)::int;
  end loop;

  -- Update log with actual allocated guest username
  update public.guest_provision_log
  set guest_username = v_username
  where session_id = v_user_id::text;

  v_email := v_username || '@guest.teemchat.local';
  v_encrypted_pw := crypt(p_password, gen_salt('bf'));

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    phone, phone_change, phone_change_token, email_change_token_current,
    reauthentication_token, raw_app_meta_data, raw_user_meta_data, is_anonymous,
    created_at, updated_at
  ) values (
    v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email, v_encrypted_pw, now(),
    '', '', '', '',
    null, '', '', '',
    '',
    jsonb_build_object('provider', 'email', 'providers', array['email'], 'is_guest', true),
    jsonb_build_object('display_name', v_display_name, 'username', v_username, 'is_guest', true, 'gender', v_gender, 'country_code', v_country),
    false,
    now(), now()
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email',
    v_user_id::text,
    now(), now(), now()
  );

  insert into public.profiles (
    id, username, display_name, gender, avatar_config, is_paid, tier, has_ai_companion, country_code, created_at, updated_at
  ) values (
    v_user_id, v_username, v_display_name, v_gender, p_avatar_config, false, 'free', false, v_country, now(), now()
  )
  on conflict (id) do update set
    username = excluded.username,
    display_name = excluded.display_name,
    avatar_config = excluded.avatar_config,
    gender = excluded.gender,
    country_code = coalesce(excluded.country_code, public.profiles.country_code);

  return jsonb_build_object(
    'user_id', v_user_id,
    'email', v_email,
    'username', v_username,
    'display_name', v_display_name,
    'gender', v_gender,
    'country_code', v_country
  );
end;
$$;

-- 5-argument backward-compatible wrapper
create or replace function public.provision_guest_account(
  p_display_name text,
  p_password text,
  p_avatar_config jsonb default '{}'::jsonb,
  p_gender text default 'male',
  p_username text default null
)
returns jsonb
language sql
security definer
set search_path = public, auth, extensions
as $$
  select public.provision_guest_account(p_display_name, p_password, p_avatar_config, p_gender, p_username, null);
$$;

grant execute on function public.provision_guest_account(text, text, jsonb, text, text, text) to anon, authenticated;
grant execute on function public.provision_guest_account(text, text, jsonb, text, text) to anon, authenticated;


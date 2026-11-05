-- ==========================================================
-- GOOGLE SIGN-IN: SAFE PROFILE CREATION (2026-11-06)
-- handle_new_user() builds the profile for every new auth user. Google (OAuth)
-- users arrive without a chosen username, so:
--   * username   = chosen username, else the email prefix, cleaned to [a-z0-9_]
--                  and made unique with a short suffix (profiles.username is UNIQUE;
--                  a clash used to abort the whole sign-up).
--   * display_name = chosen display name, else Google's full name, else the prefix.
-- Billing columns keep their safe defaults (free, no AI).
-- Idempotent: safe to re-run.
-- ==========================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_prefix text := split_part(coalesce(new.email, ''), '@', 1);
  v_base text;
  v_username text;
  v_display text;
  v_try int := 0;
begin
  v_base := nullif(trim(v_meta->>'username'), '');
  if v_base is null then
    v_base := lower(regexp_replace(v_prefix, '[^a-zA-Z0-9_]', '', 'g'));
    v_base := left(v_base, 20);
    if length(v_base) < 3 then
      v_base := 'explorer';
    end if;
  end if;

  v_username := v_base;
  while exists (select 1 from public.profiles where username = v_username) and v_try < 8 loop
    v_try := v_try + 1;
    v_username := left(v_base, 20) || '_' || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
  end loop;

  v_display := left(coalesce(
    nullif(trim(v_meta->>'display_name'), ''),
    nullif(trim(v_meta->>'full_name'), ''),
    nullif(trim(v_meta->>'name'), ''),
    nullif(v_prefix, ''),
    'Explorer'
  ), 40);

  insert into public.profiles (id, username, display_name)
  values (new.id, v_username, v_display)
  on conflict (id) do nothing;
  return new;
end;
$$;

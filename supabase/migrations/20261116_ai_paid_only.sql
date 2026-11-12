-- ==========================================================
-- AI IS PAID-ONLY (2026-11-16)
-- AI features (companion chat, screen help, meeting notes) are available only to
-- accounts holding an active AI add-on. The free trial is gone: without the add-on
-- check_and_increment_ai_usage() refuses and counts nothing.
--   * Add-on holders keep the rolling 5-hour window (60 messages).
--   * has_active_ai_addon() stays the single source of truth; only service_role /
--     definer code can write user_subscriptions.has_ai_addon.
-- Self-contained (re-creates the add-on column, window table and helper if they are
-- missing) so that re-running schema.sql can never bring a free tier back.
-- Idempotent: safe to re-run. No data is deleted.
-- ==========================================================

-- 1. Add-on flag on the subscription row.
alter table public.user_subscriptions
  add column if not exists has_ai_addon boolean not null default false;

-- 2. Rolling 5-hour usage window, one row per user.
create table if not exists public.ai_usage_windows (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  message_count int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.ai_usage_windows enable row level security;

drop policy if exists "Users can view their own AI window" on public.ai_usage_windows;
create policy "Users can view their own AI window" on public.ai_usage_windows
  for select using (auth.uid() = user_id);

-- 3. Helper: does this user currently hold an active AI add-on?
create or replace function public.has_active_ai_addon(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_subscriptions
    where user_id = p_user_id
      and has_ai_addon = true
      and status in ('active', 'trialing')
      and (current_period_end is null or current_period_end > now())
  );
$$;

revoke execute on function public.has_active_ai_addon(uuid) from public, anon, authenticated;

-- 4. Quota check + increment. No add-on means no AI at all.
create or replace function public.check_and_increment_ai_usage(
  p_daily_limit int default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_window_hours constant int := 5;
  c_window_limit constant int := 60;
  v_user_id uuid := auth.uid();
  v_count int;
  v_started timestamptz;
begin
  if v_user_id is null then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'error', 'unauthorized');
  end if;

  if not public.has_active_ai_addon(v_user_id) then
    -- is_trial stays true so older clients still show the purchase buttons.
    return jsonb_build_object(
      'allowed', false, 'is_trial', true, 'limit_type', 'addon_required',
      'requires_addon', true, 'current_count', 0, 'remaining', 0, 'resets_at', null
    );
  end if;

  insert into public.ai_usage_windows (user_id, window_started_at, message_count)
  values (v_user_id, now(), 0)
  on conflict (user_id) do nothing;

  select window_started_at, message_count into v_started, v_count
  from public.ai_usage_windows
  where user_id = v_user_id
  for update;

  -- Expired window: the next message opens a new one.
  if v_started + make_interval(hours => c_window_hours) <= now() then
    v_started := now();
    v_count := 0;
    update public.ai_usage_windows
    set window_started_at = v_started, message_count = 0, updated_at = now()
    where user_id = v_user_id;
  end if;

  if v_count >= c_window_limit then
    return jsonb_build_object(
      'allowed', false, 'is_trial', false, 'limit_type', 'window',
      'current_count', v_count, 'window_limit', c_window_limit, 'window_hours', c_window_hours,
      'remaining', 0, 'resets_at', v_started + make_interval(hours => c_window_hours)
    );
  end if;

  update public.ai_usage_windows
  set message_count = message_count + 1, updated_at = now()
  where user_id = v_user_id;

  return jsonb_build_object(
    'allowed', true, 'is_trial', false, 'limit_type', 'window',
    'current_count', v_count + 1, 'window_limit', c_window_limit, 'window_hours', c_window_hours,
    'remaining', c_window_limit - (v_count + 1),
    'resets_at', v_started + make_interval(hours => c_window_hours)
  );
end;
$$;

-- 5. Read-only status for UI meters.
create or replace function public.get_ai_usage_status(
  p_daily_limit int default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_window_hours constant int := 5;
  c_window_limit constant int := 60;
  v_user_id uuid := auth.uid();
  v_count int := 0;
  v_started timestamptz;
begin
  if v_user_id is null then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'error', 'unauthorized');
  end if;

  if not public.has_active_ai_addon(v_user_id) then
    return jsonb_build_object(
      'allowed', false, 'is_trial', true, 'limit_type', 'addon_required',
      'requires_addon', true, 'current_count', 0, 'remaining', 0, 'resets_at', null
    );
  end if;

  select window_started_at, message_count into v_started, v_count
  from public.ai_usage_windows
  where user_id = v_user_id;

  if v_started is null or v_started + make_interval(hours => c_window_hours) <= now() then
    return jsonb_build_object(
      'allowed', true, 'is_trial', false, 'limit_type', 'window',
      'current_count', 0, 'window_limit', c_window_limit, 'window_hours', c_window_hours,
      'remaining', c_window_limit, 'resets_at', null
    );
  end if;

  return jsonb_build_object(
    'allowed', v_count < c_window_limit, 'is_trial', false, 'limit_type', 'window',
    'current_count', v_count, 'window_limit', c_window_limit, 'window_hours', c_window_hours,
    'remaining', greatest(0, c_window_limit - v_count),
    'resets_at', v_started + make_interval(hours => c_window_hours)
  );
end;
$$;

-- 6. Signed-in callers only (guests are refused by the API before reaching these).
revoke execute on function public.check_and_increment_ai_usage(integer) from public, anon;
grant  execute on function public.check_and_increment_ai_usage(integer) to authenticated;
revoke execute on function public.get_ai_usage_status(integer)          from public, anon;
grant  execute on function public.get_ai_usage_status(integer)          to authenticated;

-- ==========================================================
-- AI ADD-ON + 5-HOUR USAGE WINDOW (2026-11-05)
-- AI is sold as a $10/month add-on on top of the base paid subscription.
--   * user_subscriptions.has_ai_addon marks who bought it (set server-side only).
--   * Add-on holders get a rolling 5-hour window: the window opens on the first
--     AI message and allows AI_WINDOW_LIMIT messages until it expires, then a
--     fresh window opens on the next message.
--   * Everyone without the add-on (free or base paid) keeps the 5 messages/day trial.
-- profiles.has_ai_companion mirrors the add-on so the client can show it.
-- Idempotent: safe to re-run.
-- ==========================================================

-- 1. Add-on flag on the subscription row (only service_role / definer code writes it;
--    clients can only SELECT their own row per existing RLS).
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

-- 4. Quota check + increment (signature unchanged so existing callers keep working).
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
  c_trial_limit constant int := 5;
  v_user_id uuid := auth.uid();
  v_today date := (current_timestamp at time zone 'utc')::date;
  v_count int;
  v_started timestamptz;
begin
  if v_user_id is null then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'error', 'unauthorized');
  end if;

  -- AI add-on: rolling 5-hour window.
  if public.has_active_ai_addon(v_user_id) then
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
        'allowed', false,
        'is_trial', false,
        'limit_type', 'window',
        'current_count', v_count,
        'window_limit', c_window_limit,
        'window_hours', c_window_hours,
        'remaining', 0,
        'resets_at', v_started + make_interval(hours => c_window_hours)
      );
    end if;

    update public.ai_usage_windows
    set message_count = message_count + 1, updated_at = now()
    where user_id = v_user_id;

    return jsonb_build_object(
      'allowed', true,
      'is_trial', false,
      'limit_type', 'window',
      'current_count', v_count + 1,
      'window_limit', c_window_limit,
      'window_hours', c_window_hours,
      'remaining', c_window_limit - (v_count + 1),
      'resets_at', v_started + make_interval(hours => c_window_hours)
    );
  end if;

  -- No add-on: daily trial allowance.
  insert into public.ai_usage (user_id, usage_date, message_count, max_daily_messages)
  values (v_user_id, v_today, 0, c_trial_limit)
  on conflict (user_id, usage_date) do nothing;

  select message_count into v_count
  from public.ai_usage
  where user_id = v_user_id and usage_date = v_today
  for update;

  if v_count >= c_trial_limit then
    return jsonb_build_object(
      'allowed', false,
      'is_trial', true,
      'limit_type', 'daily',
      'current_count', v_count,
      'daily_limit', c_trial_limit,
      'remaining', 0,
      'resets_at', (v_today + interval '1 day') at time zone 'utc'
    );
  end if;

  update public.ai_usage
  set message_count = message_count + 1,
      updated_at = timezone('utc'::text, now())
  where user_id = v_user_id and usage_date = v_today;

  return jsonb_build_object(
    'allowed', true,
    'is_trial', true,
    'limit_type', 'daily',
    'current_count', v_count + 1,
    'daily_limit', c_trial_limit,
    'remaining', c_trial_limit - (v_count + 1),
    'resets_at', (v_today + interval '1 day') at time zone 'utc'
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
  c_trial_limit constant int := 5;
  v_user_id uuid := auth.uid();
  v_today date := (current_timestamp at time zone 'utc')::date;
  v_count int := 0;
  v_started timestamptz;
begin
  if v_user_id is null then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'error', 'unauthorized');
  end if;

  if public.has_active_ai_addon(v_user_id) then
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
  end if;

  select coalesce(message_count, 0) into v_count
  from public.ai_usage
  where user_id = v_user_id and usage_date = v_today;
  v_count := coalesce(v_count, 0);

  return jsonb_build_object(
    'allowed', v_count < c_trial_limit, 'is_trial', true, 'limit_type', 'daily',
    'current_count', v_count, 'daily_limit', c_trial_limit,
    'remaining', greatest(0, c_trial_limit - v_count),
    'resets_at', (v_today + interval '1 day') at time zone 'utc'
  );
end;
$$;

-- 6. Keep profiles.is_paid / tier / has_ai_companion in sync with the subscription row.
create or replace function public.sync_profile_paid_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active boolean;
begin
  if tg_op = 'DELETE' then
    update public.profiles
    set is_paid = false, tier = 'free', has_ai_companion = false
    where id = old.user_id;
    return old;
  end if;

  v_active := new.status in ('active', 'trialing');
  update public.profiles
  set is_paid = v_active,
      tier = case when v_active then 'paid' else 'free' end,
      has_ai_companion = v_active and new.has_ai_addon
  where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists sync_profile_paid_status on public.user_subscriptions;
create trigger sync_profile_paid_status
  after insert or update of status, has_ai_addon or delete on public.user_subscriptions
  for each row execute function public.sync_profile_paid_status();

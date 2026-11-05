-- ==========================================================
-- AI TRIAL: 5 MESSAGES TOTAL, NOT PER DAY (2026-11-05)
-- Accounts without the AI add-on get 5 AI messages in total (counted across all
-- days in ai_usage, including messages sent before this change). After that the
-- companion asks them to buy the add-on. Add-on holders keep the rolling 5-hour
-- window (60 messages) from 20261105_ai_addon_5h_window.sql.
-- Idempotent: safe to re-run.
-- ==========================================================

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
  end if;

  -- No add-on: 5 trial messages in total. Lock today's row so two requests at once
  -- can't both slip past the limit.
  insert into public.ai_usage (user_id, usage_date, message_count, max_daily_messages)
  values (v_user_id, v_today, 0, c_trial_limit)
  on conflict (user_id, usage_date) do nothing;

  perform 1 from public.ai_usage
  where user_id = v_user_id and usage_date = v_today
  for update;

  select coalesce(sum(message_count), 0) into v_count
  from public.ai_usage
  where user_id = v_user_id;

  if v_count >= c_trial_limit then
    return jsonb_build_object(
      'allowed', false, 'is_trial', true, 'limit_type', 'trial',
      'current_count', v_count, 'trial_limit', c_trial_limit,
      'remaining', 0, 'resets_at', null
    );
  end if;

  update public.ai_usage
  set message_count = message_count + 1,
      updated_at = timezone('utc'::text, now())
  where user_id = v_user_id and usage_date = v_today;

  return jsonb_build_object(
    'allowed', true, 'is_trial', true, 'limit_type', 'trial',
    'current_count', v_count + 1, 'trial_limit', c_trial_limit,
    'remaining', c_trial_limit - (v_count + 1), 'resets_at', null
  );
end;
$$;

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

  select coalesce(sum(message_count), 0) into v_count
  from public.ai_usage
  where user_id = v_user_id;

  return jsonb_build_object(
    'allowed', v_count < c_trial_limit, 'is_trial', true, 'limit_type', 'trial',
    'current_count', v_count, 'trial_limit', c_trial_limit,
    'remaining', greatest(0, c_trial_limit - v_count), 'resets_at', null
  );
end;
$$;

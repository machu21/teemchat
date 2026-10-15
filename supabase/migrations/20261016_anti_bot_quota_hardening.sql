-- ==========================================================
-- MIGRATION: ANTI-BOT REGISTRATION & AI QUOTA HARDENING
-- Prevents bot account harvesting by defaulting new accounts to 'free'
-- and capping free-tier AI daily companion usage to 5 trial messages.
-- ==========================================================

-- 1. Update profiles column defaults to safe free tier
alter table public.profiles alter column tier set default 'free';
alter table public.profiles alter column is_paid set default false;
alter table public.profiles alter column has_ai_companion set default false;

-- 2. Update check_and_increment_ai_usage RPC to enforce free vs. paid quotas
create or replace function public.check_and_increment_ai_usage(
  p_daily_limit int default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (current_timestamp at time zone 'utc')::date;
  v_current_count int;
  v_resets_at timestamptz := (v_today + interval '1 day') at time zone 'utc';
  v_is_paid boolean := false;
  v_effective_limit int;
begin
  if v_user_id is null then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'error', 'unauthorized');
  end if;

  -- Look up user subscription status
  select coalesce(is_paid, false) into v_is_paid
  from public.profiles
  where id = v_user_id;

  -- Free accounts receive 5 trial AI messages; paid accounts receive p_daily_limit (default 50)
  if v_is_paid then
    v_effective_limit := coalesce(p_daily_limit, 50);
  else
    v_effective_limit := 5;
  end if;

  insert into public.ai_usage (user_id, usage_date, message_count, max_daily_messages)
  values (v_user_id, v_today, 0, v_effective_limit)
  on conflict (user_id, usage_date) do nothing;

  select message_count into v_current_count
  from public.ai_usage
  where user_id = v_user_id and usage_date = v_today
  for update;

  if v_current_count >= v_effective_limit then
    return jsonb_build_object(
      'allowed', false,
      'current_count', v_current_count,
      'daily_limit', v_effective_limit,
      'remaining', 0,
      'is_trial', not v_is_paid,
      'resets_at', v_resets_at
    );
  end if;

  update public.ai_usage
  set message_count = message_count + 1,
      updated_at = timezone('utc'::text, now())
  where user_id = v_user_id and usage_date = v_today;

  return jsonb_build_object(
    'allowed', true,
    'current_count', v_current_count + 1,
    'daily_limit', v_effective_limit,
    'remaining', v_effective_limit - (v_current_count + 1),
    'is_trial', not v_is_paid,
    'resets_at', v_resets_at
  );
end;
$$;

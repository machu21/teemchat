-- Migration: 20261008_stripe_subscriptions.sql
-- Description: Subscriptions table, Stripe customer mapping, Realtime publication, and AI unlimited quota bypass.

-- ==========================================================
-- 1. USER SUBSCRIPTIONS TABLE
-- ==========================================================
create table if not exists public.user_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade unique not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_id text not null default 'ai_unlimited_monthly',
  status text not null default 'active', -- 'active', 'trialing', 'past_due', 'canceled', 'incomplete'
  has_ai_unlimited boolean not null default true,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists idx_user_subscriptions_user_id on public.user_subscriptions(user_id);
create index if not exists idx_user_subscriptions_stripe_cust on public.user_subscriptions(stripe_customer_id);
create index if not exists idx_user_subscriptions_stripe_sub on public.user_subscriptions(stripe_subscription_id);

alter table public.user_subscriptions enable row level security;

-- RLS: Users can read their own subscription status
drop policy if exists "Users can view their own subscription" on public.user_subscriptions;
create policy "Users can view their own subscription" on public.user_subscriptions
  for select using (auth.uid() = user_id);

-- RLS: Only service role can insert or update subscription records (from webhooks)
drop policy if exists "Service role can manage all subscriptions" on public.user_subscriptions;
create policy "Service role can manage all subscriptions" on public.user_subscriptions
  for all using (auth.role() = 'service_role');

-- Add to Realtime publication so clients immediately know when an upgrade occurs
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_subscriptions'
  ) then
    alter publication supabase_realtime add table public.user_subscriptions;
  end if;
end $$;

-- ==========================================================
-- 2. ENHANCE AI QUOTA CHECK FOR UNLIMITED SUBSCRIBERS
-- ==========================================================

create or replace function public.get_ai_usage_status(
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
  v_count int := 0;
  v_resets_at timestamptz := (v_today + interval '1 day') at time zone 'utc';
  v_is_unlimited boolean := false;
  v_plan_id text := 'free';
begin
  if v_user_id is null then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'error', 'unauthorized');
  end if;

  -- Check if user has an active subscription with unlimited AI access
  select exists (
    select 1 from public.user_subscriptions
    where user_id = v_user_id 
      and status in ('active', 'trialing')
      and has_ai_unlimited = true
      and (current_period_end is null or current_period_end > now())
  ), coalesce(
    (select plan_id from public.user_subscriptions where user_id = v_user_id and status in ('active', 'trialing') limit 1),
    'free'
  )
  into v_is_unlimited, v_plan_id;

  -- If user has active Unlimited AI subscription, bypass daily message count
  if v_is_unlimited then
    return jsonb_build_object(
      'allowed', true,
      'is_unlimited', true,
      'plan_id', v_plan_id,
      'current_count', 0,
      'daily_limit', 999999,
      'remaining', 999999,
      'resets_at', v_resets_at
    );
  end if;

  select coalesce(message_count, 0) into v_count
  from public.ai_usage
  where user_id = v_user_id and usage_date = v_today;

  return jsonb_build_object(
    'allowed', (coalesce(v_count, 0) < p_daily_limit),
    'is_unlimited', false,
    'plan_id', 'free',
    'current_count', coalesce(v_count, 0),
    'daily_limit', p_daily_limit,
    'remaining', greatest(0, p_daily_limit - coalesce(v_count, 0)),
    'resets_at', v_resets_at
  );
end;
$$;

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
  v_is_unlimited boolean := false;
  v_plan_id text := 'free';
begin
  if v_user_id is null then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'error', 'unauthorized');
  end if;

  -- Check if user has active unlimited AI subscription
  select exists (
    select 1 from public.user_subscriptions
    where user_id = v_user_id 
      and status in ('active', 'trialing')
      and has_ai_unlimited = true
      and (current_period_end is null or current_period_end > now())
  ), coalesce(
    (select plan_id from public.user_subscriptions where user_id = v_user_id and status in ('active', 'trialing') limit 1),
    'free'
  )
  into v_is_unlimited, v_plan_id;

  -- Unlimited subscribers bypass daily quota tracking
  if v_is_unlimited then
    return jsonb_build_object(
      'allowed', true,
      'is_unlimited', true,
      'plan_id', v_plan_id,
      'current_count', 0,
      'daily_limit', 999999,
      'remaining', 999999,
      'resets_at', v_resets_at
    );
  end if;

  insert into public.ai_usage (user_id, usage_date, message_count, max_daily_messages)
  values (v_user_id, v_today, 0, p_daily_limit)
  on conflict (user_id, usage_date) do nothing;

  select message_count into v_current_count
  from public.ai_usage
  where user_id = v_user_id and usage_date = v_today
  for update;

  if v_current_count >= p_daily_limit then
    return jsonb_build_object(
      'allowed', false,
      'is_unlimited', false,
      'plan_id', 'free',
      'current_count', v_current_count,
      'daily_limit', p_daily_limit,
      'remaining', 0,
      'resets_at', v_resets_at
    );
  end if;

  update public.ai_usage
  set message_count = message_count + 1,
      updated_at = timezone('utc'::text, now())
  where user_id = v_user_id and usage_date = v_today;

  return jsonb_build_object(
    'allowed', true,
    'is_unlimited', false,
    'plan_id', 'free',
    'current_count', v_current_count + 1,
    'daily_limit', p_daily_limit,
    'remaining', p_daily_limit - (v_current_count + 1),
    'resets_at', v_resets_at
  );
end;
$$;

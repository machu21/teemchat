-- Migration: 20261001_ai_daily_usage_limits.sql
-- Description: Table, RLS, and PL/pgSQL RPC functions for AI companion daily message rate limiting (50 messages/day).

create table if not exists public.ai_usage (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  usage_date date not null default (current_timestamp at time zone 'utc')::date,
  message_count int not null default 0,
  max_daily_messages int not null default 50,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null,
  unique (user_id, usage_date)
);

create index if not exists idx_ai_usage_user_date on public.ai_usage(user_id, usage_date);

alter table public.ai_usage enable row level security;

drop policy if exists "Users can view their own ai usage" on public.ai_usage;
create policy "Users can view their own ai usage" on public.ai_usage
  for select using (auth.uid() = user_id);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ai_usage'
  ) then
    alter publication supabase_realtime add table public.ai_usage;
  end if;
end $$;

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
begin
  if v_user_id is null then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'error', 'unauthorized');
  end if;

  select coalesce(message_count, 0) into v_count
  from public.ai_usage
  where user_id = v_user_id and usage_date = v_today;

  return jsonb_build_object(
    'allowed', (coalesce(v_count, 0) < p_daily_limit),
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
begin
  if v_user_id is null then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'error', 'unauthorized');
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
    'current_count', v_current_count + 1,
    'daily_limit', p_daily_limit,
    'remaining', p_daily_limit - (v_current_count + 1),
    'resets_at', v_resets_at
  );
end;
$$;

-- ==========================================================
-- MEMBERSHIP PLANS & PRICING TIERS (2026-11-20)
-- Adds Free / Plus / Host / Team membership plans alongside the
-- existing AI Companion add-on (two independent Stripe subscriptions).
--
-- Beta mode is ON by default:
--   public.billing_settings.beta_free_membership = true
--   While true, every registered non-guest account gets Plus limits
--   (10 maps, 50 room capacity, call video/screen share) for free.
--
-- To launch paid plans and enforce Free limits:
--   update public.billing_settings set beta_free_membership = false, updated_at = now();
--
-- Idempotent: safe to re-run. No data is deleted.
-- ==========================================================

-- 1. Billing settings (single-row table for runtime beta flag)
create table if not exists public.billing_settings (
  id boolean primary key default true check (id),
  beta_free_membership boolean not null default true,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

insert into public.billing_settings (id, beta_free_membership)
values (true, true)
on conflict (id) do nothing;

alter table public.billing_settings enable row level security;

drop policy if exists "Billing settings are readable by everyone" on public.billing_settings;
create policy "Billing settings are readable by everyone" on public.billing_settings
  for select using (true);

drop policy if exists "Service role can manage billing settings" on public.billing_settings;
create policy "Service role can manage billing settings" on public.billing_settings
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 2. Profiles: real membership plan column
alter table public.profiles
  add column if not exists plan text not null default 'free';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_plan_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_plan_check check (plan in ('free', 'plus', 'host', 'team'));
  end if;
end $$;

-- 3. User subscriptions: separate membership fields alongside AI add-on fields
alter table public.user_subscriptions
  add column if not exists membership_plan text not null default 'free',
  add column if not exists membership_status text,
  add column if not exists membership_stripe_subscription_id text,
  add column if not exists membership_interval text,
  add column if not exists membership_period_end timestamptz,
  add column if not exists membership_cancel_at_period_end boolean not null default false,
  add column if not exists is_founding_member boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_subscriptions_membership_plan_check'
      and conrelid = 'public.user_subscriptions'::regclass
  ) then
    alter table public.user_subscriptions
      add constraint user_subscriptions_membership_plan_check
      check (membership_plan in ('free', 'plus', 'host', 'team'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'user_subscriptions_membership_interval_check'
      and conrelid = 'public.user_subscriptions'::regclass
  ) then
    alter table public.user_subscriptions
      add constraint user_subscriptions_membership_interval_check
      check (membership_interval is null or membership_interval in ('month', 'year'));
  end if;
end $$;

create index if not exists idx_user_subscriptions_membership_stripe_sub
  on public.user_subscriptions(membership_stripe_subscription_id);

-- 4. Guard profile billing columns against client writes (including `plan`)
create or replace function public.guard_profile_billing_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_paid := false;
    new.tier := 'free';
    new.plan := 'free';
    new.has_ai_companion := false;
  else
    new.is_paid := old.is_paid;
    new.tier := old.tier;
    new.plan := old.plan;
    new.has_ai_companion := old.has_ai_companion;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_billing_columns on public.profiles;
create trigger guard_profile_billing_columns
  before insert or update on public.profiles
  for each row execute function public.guard_profile_billing_columns();

-- 5. Keep profiles.plan / is_paid / tier / has_ai_companion in sync with user_subscriptions.
--    Note: is_paid now reflects an active membership plan (plan <> 'free');
--    has_ai_companion continues to reflect the independent AI Companion add-on.
create or replace function public.sync_profile_paid_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan text;
  v_is_paid boolean;
  v_ai_active boolean;
begin
  if tg_op = 'DELETE' then
    update public.profiles
    set plan = 'free', is_paid = false, tier = 'free', has_ai_companion = false
    where id = old.user_id;
    return old;
  end if;

  if new.membership_status in ('active', 'trialing')
     and (new.membership_period_end is null or new.membership_period_end > now()) then
    v_plan := coalesce(new.membership_plan, 'free');
  else
    v_plan := 'free';
  end if;

  v_is_paid := (v_plan <> 'free');
  v_ai_active := (new.status in ('active', 'trialing')) and coalesce(new.has_ai_addon, false);

  update public.profiles
  set plan = v_plan,
      is_paid = v_is_paid,
      tier = case when v_is_paid then 'paid' else 'free' end,
      has_ai_companion = v_ai_active
  where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists sync_profile_paid_status on public.user_subscriptions;
create trigger sync_profile_paid_status
  after insert or update of status, has_ai_addon, membership_plan, membership_status, membership_period_end or delete
  on public.user_subscriptions
  for each row execute function public.sync_profile_paid_status();

-- Backfill profiles from existing user_subscriptions rows
update public.profiles p
set plan = coalesce(sub.computed_plan, 'free'),
    is_paid = (coalesce(sub.computed_plan, 'free') <> 'free'),
    tier = case when coalesce(sub.computed_plan, 'free') <> 'free' then 'paid' else 'free' end,
    has_ai_companion = coalesce(sub.computed_ai, false)
from (
  select p2.id as user_id,
    case
      when s.membership_status in ('active', 'trialing')
           and (s.membership_period_end is null or s.membership_period_end > now())
      then coalesce(s.membership_plan, 'free')
      else 'free'
    end as computed_plan,
    (coalesce(s.status in ('active', 'trialing'), false) and coalesce(s.has_ai_addon, false)) as computed_ai
  from public.profiles p2
  left join public.user_subscriptions s on s.user_id = p2.id
) sub
where p.id = sub.user_id
  and (
    p.plan is distinct from sub.computed_plan
    or p.is_paid is distinct from (sub.computed_plan <> 'free')
    or p.has_ai_companion is distinct from sub.computed_ai
  );

-- 6. Plan lookup helpers
create or replace function public.plan_map_limit(p_plan text)
returns int
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_plan
    when 'plus' then 10
    when 'host' then 25
    when 'team' then 100
    else 1
  end;
$$;

create or replace function public.plan_capacity_limit(p_plan text)
returns int
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_plan
    when 'plus' then 50
    when 'host' then 150
    when 'team' then 250
    else 15
  end;
$$;

create or replace function public.effective_plan(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_is_guest boolean := false;
  v_plan text := 'free';
  v_beta boolean := true;
begin
  if p_user_id is null then
    return 'free';
  end if;

  select
    coalesce((raw_app_meta_data->>'is_guest')::boolean, is_anonymous, false)
    or coalesce(email like '%@guest.teemchat.local', false)
  into v_is_guest
  from auth.users
  where id = p_user_id;

  if coalesce(v_is_guest, false) then
    return 'free';
  end if;

  select coalesce(plan, 'free') into v_plan
  from public.profiles
  where id = p_user_id;

  v_plan := coalesce(v_plan, 'free');

  if v_plan = 'free' then
    select beta_free_membership into v_beta
    from public.billing_settings
    where id = true;

    if coalesce(v_beta, true) then
      return 'plus';
    end if;
  end if;

  return v_plan;
end;
$$;

-- 7. Space triggers: capacity limit + map count limit
create or replace function public.guard_space_billing_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cap_limit int;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  v_cap_limit := public.plan_capacity_limit(public.effective_plan(coalesce(auth.uid(), new.owner_id)));

  if tg_op = 'INSERT' then
    new.tier := 'free';
    new.max_capacity := least(greatest(coalesce(new.max_capacity, 15), 1), v_cap_limit);
  else
    new.tier := old.tier;
    if new.max_capacity is distinct from old.max_capacity then
      if new.max_capacity is null then
        new.max_capacity := old.max_capacity;
      else
        new.max_capacity := least(greatest(new.max_capacity, 1), v_cap_limit);
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_space_billing_columns on public.spaces;
create trigger guard_space_billing_columns
  before insert or update on public.spaces
  for each row execute function public.guard_space_billing_columns();

create or replace function public.enforce_space_map_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
  v_plan text;
  v_limit int;
  v_count int;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  v_owner_id := coalesce(new.owner_id, auth.uid());
  if v_owner_id is null then
    return new;
  end if;

  v_plan := public.effective_plan(v_owner_id);
  v_limit := public.plan_map_limit(v_plan);

  select count(*) into v_count
  from public.spaces
  where owner_id = v_owner_id;

  if v_count >= v_limit then
    raise exception 'Map limit reached (% maps on % plan). Upgrade your plan to create more.', v_limit, v_plan
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_space_map_limit on public.spaces;
create trigger enforce_space_map_limit
  before insert on public.spaces
  for each row execute function public.enforce_space_map_limit();

-- 8. Function grant hardening
revoke execute on function public.guard_profile_billing_columns() from public, anon, authenticated;
revoke execute on function public.sync_profile_paid_status() from public, anon, authenticated;
revoke execute on function public.guard_space_billing_columns() from public, anon, authenticated;
revoke execute on function public.enforce_space_map_limit() from public, anon, authenticated;
revoke execute on function public.effective_plan(uuid) from public, anon, authenticated;
grant  execute on function public.effective_plan(uuid) to service_role;
revoke execute on function public.plan_map_limit(text) from public, anon;
grant  execute on function public.plan_map_limit(text) to authenticated, service_role;
revoke execute on function public.plan_capacity_limit(text) from public, anon;
grant  execute on function public.plan_capacity_limit(text) to authenticated, service_role;

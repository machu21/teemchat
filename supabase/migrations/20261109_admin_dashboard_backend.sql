-- ==========================================================
-- TEEMCHAT ADMIN DASHBOARD BACKEND (2026-11-09)
-- 1. System Role on Profiles ('user', 'moderator', 'admin', 'superadmin')
-- 2. Guard trigger against client self-elevation
-- 3. Admin Audit Logs table with strict RLS
-- 4. Helper functions & Overview metrics RPC
-- 5. Seed initial superadmin (matzcabal23@gmail.com)
-- ==========================================================

-- 1. System Role Column
alter table public.profiles
  add column if not exists system_role text not null default 'user'
  check (system_role in ('user', 'moderator', 'admin', 'superadmin'));

create index if not exists idx_profiles_system_role on public.profiles(system_role);

-- 2. Guard trigger: clients (anon/authenticated) cannot alter system_role or self-elevate on insert
create or replace function public.guard_profile_system_role()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if (TG_OP = 'INSERT') then
    if new.system_role is not null and new.system_role <> 'user' then
      if auth.role() is distinct from 'service_role' and not public.is_system_admin(auth.uid()) then
        raise exception 'Unauthorized: Only system administrators can set elevated system_role';
      end if;
    end if;
  elsif (TG_OP = 'UPDATE') then
    if (old.system_role is distinct from new.system_role) then
      if auth.role() is distinct from 'service_role' and not public.is_system_admin(auth.uid()) then
        raise exception 'Unauthorized: Only system administrators can alter system_role';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_system_role_trg on public.profiles;
create trigger guard_profile_system_role_trg
  before insert or update on public.profiles
  for each row execute function public.guard_profile_system_role();

-- 3. System Admin check function
create or replace function public.is_system_admin(p_user_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id and system_role in ('admin', 'superadmin')
  );
$$;

-- 4. Admin Audit Logs
create table if not exists public.admin_audit_logs (
  id uuid default gen_random_uuid() primary key,
  admin_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_table text,
  target_id text,
  changes_before jsonb default null,
  changes_after jsonb default null,
  ip_address text,
  user_agent text,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists idx_admin_audit_logs_created on public.admin_audit_logs(created_at desc);
create index if not exists idx_admin_audit_logs_admin on public.admin_audit_logs(admin_id);
create index if not exists idx_admin_audit_logs_action on public.admin_audit_logs(action);
create index if not exists idx_admin_audit_logs_target on public.admin_audit_logs(target_table, target_id);

alter table public.admin_audit_logs enable row level security;

drop policy if exists "Admins can view admin audit logs" on public.admin_audit_logs;
create policy "Admins can view admin audit logs" on public.admin_audit_logs
  for select using (
    auth.role() = 'service_role' or public.is_system_admin(auth.uid())
  );

drop policy if exists "Admins and service role can insert admin audit logs" on public.admin_audit_logs;
create policy "Admins and service role can insert admin audit logs" on public.admin_audit_logs
  for insert with check (
    auth.role() = 'service_role' or public.is_system_admin(auth.uid())
  );

-- 5. Admin Metrics Aggregation RPC
create or replace function public.get_admin_overview_metrics()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_total_users int;
  v_new_users_24h int;
  v_active_subscriptions int;
  v_total_revenue_cents bigint;
  v_pending_reports int;
  v_active_spaces int;
  v_today_ai_messages int;
begin
  if auth.role() is distinct from 'service_role' and not public.is_system_admin(auth.uid()) then
    raise exception 'Unauthorized: Insufficient administrative privileges';
  end if;

  select count(*) into v_total_users from public.profiles;
  select count(*) into v_new_users_24h from public.profiles where created_at >= (now() - interval '24 hours');
  select count(*) into v_active_subscriptions from public.user_subscriptions where status = 'active';
  select coalesce(sum(amount_cents), 0) into v_total_revenue_cents from public.billing_invoices where status = 'paid';
  select count(*) into v_pending_reports from public.user_reports where status = 'pending';
  select count(*) into v_active_spaces from public.spaces where is_active = true;
  select coalesce(sum(message_count), 0) into v_today_ai_messages from public.ai_usage where usage_date = (timezone('utc', now()))::date;

  return jsonb_build_object(
    'totalUsers', v_total_users,
    'newUsers24h', v_new_users_24h,
    'activeSubscriptions', v_active_subscriptions,
    'totalRevenueCents', v_total_revenue_cents,
    'pendingReports', v_pending_reports,
    'activeSpaces', v_active_spaces,
    'todayAiMessages', v_today_ai_messages
  );
end;
$$;

revoke execute on function public.get_admin_overview_metrics() from public, anon;
grant execute on function public.get_admin_overview_metrics() to authenticated, service_role;

-- 6. Covering Indexes for High-Scale Admin Lookups
create index if not exists idx_profiles_created_at on public.profiles(created_at desc);
create index if not exists idx_user_subscriptions_status on public.user_subscriptions(status);
create index if not exists idx_billing_invoices_status_amount on public.billing_invoices(status, amount_cents);
create index if not exists idx_ai_usage_usage_date on public.ai_usage(usage_date);

-- 7. Promote initial superadmin
update public.profiles
set system_role = 'superadmin'
where id in (select id from auth.users where email = 'matzcabal23@gmail.com');


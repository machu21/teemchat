-- ==========================================================
-- ADS KILL SWITCH (2026-11-22)
-- Ads are shown only to Free and Guest accounts (never to under-13s),
-- and only while public.billing_settings.ads_enabled = true.
--
-- Off by default. To turn ads on once AdSense/AdMob are approved:
--   update public.billing_settings set ads_enabled = true, updated_at = now();
--
-- Self-contained: creates billing_settings with the same definition and RLS
-- as 20261120_membership_plans.sql, so it works whether or not that migration
-- has run. Idempotent: safe to re-run. No data is deleted.
-- ==========================================================

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

alter table public.billing_settings
  add column if not exists ads_enabled boolean not null default false;

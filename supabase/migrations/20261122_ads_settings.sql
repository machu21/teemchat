-- ==========================================================
-- ADS KILL SWITCH (2026-11-22)
-- Ads are shown only to Free and Guest accounts (never to under-13s),
-- and only while public.billing_settings.ads_enabled = true.
--
-- Off by default. To turn ads on once AdSense/AdMob are approved:
--   update public.billing_settings set ads_enabled = true, updated_at = now();
--
-- Idempotent: safe to re-run. No data is deleted. The existing RLS on
-- billing_settings (public read, service-role write) already covers this column.
-- ==========================================================

alter table public.billing_settings
  add column if not exists ads_enabled boolean not null default false;

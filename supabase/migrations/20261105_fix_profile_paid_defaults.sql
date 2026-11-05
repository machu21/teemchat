-- ==========================================================
-- FIX: NEW PROFILES DEFAULTED TO PAID (2026-11-05)
-- The live database still had is_paid = true, tier = 'paid', has_ai_companion = true
-- as column defaults (20261016_anti_bot_quota_hardening never reached it), so
-- handle_new_user() created every new account as a paid member with AI.
-- The billing guard then kept those values when the client tried to reset them.
--
-- 1. Safe defaults.
-- 2. Re-derive the billing flags from user_subscriptions, the only source of truth
--    (same rule as sync_profile_paid_status). Accounts with a real or beta-granted
--    subscription row are unaffected.
-- Idempotent: safe to re-run.
-- ==========================================================

alter table public.profiles alter column is_paid set default false;
alter table public.profiles alter column tier set default 'free';
alter table public.profiles alter column has_ai_companion set default false;

update public.profiles p
set is_paid = coalesce(s.status in ('active', 'trialing'), false),
    tier = case when coalesce(s.status in ('active', 'trialing'), false) then 'paid' else 'free' end,
    has_ai_companion = coalesce(s.status in ('active', 'trialing') and s.has_ai_addon, false)
from public.profiles p2
left join public.user_subscriptions s on s.user_id = p2.id
where p.id = p2.id
  and (
    p.is_paid is distinct from coalesce(s.status in ('active', 'trialing'), false)
    or p.has_ai_companion is distinct from coalesce(s.status in ('active', 'trialing') and s.has_ai_addon, false)
  );

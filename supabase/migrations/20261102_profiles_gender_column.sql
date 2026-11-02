-- ==========================================================
-- TEEMCHAT MIGRATION: 20261102_profiles_gender_column
-- Restores profiles.gender on databases that never ran 20261014_user_gender_and_avatars.
-- provision_guest_account (20261102_critical_access_fixes) inserts this column, so without it
-- every guest sign-up fails with 42703 and the client falls back to a local-only guest.
-- Only the column + constraint are applied here; the 20261014 file also recreates the legacy
-- 4-arg guest provisioner, which 20261102 intentionally dropped.
-- Idempotent and non-destructive: safe to re-run.
-- ==========================================================

alter table public.profiles add column if not exists gender text default 'male';

update public.profiles
set gender = 'male'
where gender is null or gender not in ('male', 'female');

alter table public.profiles drop constraint if exists profiles_gender_check;
alter table public.profiles add constraint profiles_gender_check check (gender in ('male', 'female'));

-- ==========================================================
-- Migration: Auto Confirm Users & Backfill Email Verification
-- Description: Ensures newly registered users can sign in immediately
--              without encountering "Email not confirmed" blocks.
-- ==========================================================

-- 1. Auto-confirm function for auth.users
create or replace function public.auto_confirm_new_user()
returns trigger as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- 2. Trigger on auth.users before insert
drop trigger if exists on_auth_user_created_auto_confirm on auth.users;
create trigger on_auth_user_created_auto_confirm
  before insert on auth.users
  for each row execute procedure public.auto_confirm_new_user();

-- 3. Backfill existing unconfirmed users
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now()),
    raw_user_meta_data = jsonb_set(coalesce(raw_user_meta_data, '{}'::jsonb), '{email_verified}', 'true'::jsonb)
where email_confirmed_at is null;

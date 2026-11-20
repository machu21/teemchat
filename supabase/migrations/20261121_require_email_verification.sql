-- ==========================================================
-- Migration: Require Email Verification on Sign-up
-- Description: Removes the auto-confirm trigger added in
--              20261008_auto_confirm_users.sql so new email/password
--              accounts must enter the 6-digit code Supabase emails
--              them before they can sign in.
--
-- Not affected:
--   * Existing users keep their email_confirmed_at (no data changes).
--   * Guests (guest_*) set email_confirmed_at = now() in their own insert.
--   * Google / Apple sign-ins are confirmed by the provider.
--   * Admin-created users pass email_confirm explicitly.
--
-- Also required in the Supabase dashboard (not SQL):
--   * Authentication > Sign In / Providers > Email: "Confirm email" ON.
--   * Authentication > Emails > "Confirm signup" template contains {{ .Token }}.
--   * A custom SMTP provider (the built-in sender is heavily rate-limited).
-- ==========================================================

drop trigger if exists on_auth_user_created_auto_confirm on auth.users;
drop function if exists public.auto_confirm_new_user();

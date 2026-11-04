-- ==========================================================
-- SPACE MODE (2026-11-04)
-- Spaces get a `mode`: 'social' (the existing hangout spaces) or 'zombie'
-- (Zombie Survival, always on the zombie_city map). Existing rows default to
-- 'social', so current spaces behave exactly as before. The column is covered
-- by the existing spaces RLS policies (owner insert/update, public/member
-- select), so guests (guest_* auth users) keep working unchanged.
-- Idempotent: safe to re-run.
-- ==========================================================

alter table public.spaces add column if not exists mode text not null default 'social';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'spaces_mode_check'
      and conrelid = 'public.spaces'::regclass
  ) then
    alter table public.spaces
      add constraint spaces_mode_check check (mode in ('social', 'zombie'));
  end if;
end $$;

-- Accessibility preferences (Safety & Family Mode milestone)
-- Adds text scale, high contrast and reduced motion to public.user_preferences.
-- Idempotent. Existing owner-only RLS on user_preferences
-- (20261015_production_3nf_schema_normalization.sql) already covers these columns.

alter table public.user_preferences
  add column if not exists text_scale numeric not null default 1.0;

alter table public.user_preferences
  add column if not exists high_contrast boolean not null default false;

alter table public.user_preferences
  add column if not exists reduced_motion boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_preferences_text_scale_check'
      and conrelid = 'public.user_preferences'::regclass
  ) then
    alter table public.user_preferences
      add constraint user_preferences_text_scale_check
      check (text_scale in (1.0, 1.15, 1.3));
  end if;
end $$;

alter table public.user_preferences enable row level security;

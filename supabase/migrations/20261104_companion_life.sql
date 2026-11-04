-- ==========================================================
-- LIVING AI COMPANION (2026-11-04)
-- Personality traits, mood, bond (relationship level), tour progress,
-- rolling session summaries with follow-up threads, and reminders.
-- Idempotent and non-destructive: safe to re-run, drops no data.
-- ==========================================================

-- 1. Companion personality / relationship columns
alter table public.ai_companions
  add column if not exists traits jsonb not null
    default '{"playful": 0.7, "curious": 0.7, "sassy": 0.3, "calm": 0.5}'::jsonb;
alter table public.ai_companions add column if not exists mood text not null default 'happy';
alter table public.ai_companions add column if not exists bond_xp int not null default 0;
alter table public.ai_companions add column if not exists last_bond_at timestamptz;
alter table public.ai_companions add column if not exists nickname_for_owner text;
alter table public.ai_companions add column if not exists last_seen_owner_at timestamptz;
alter table public.ai_companions add column if not exists tour_progress jsonb not null default '{}'::jsonb;

-- Bond XP is earned, not edited: client roles cannot change it directly.
-- award_companion_bond() (SECURITY DEFINER) is the only writer.
create or replace function public.guard_companion_bond_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.bond_xp := 0;
    new.last_bond_at := null;
  else
    new.bond_xp := old.bond_xp;
    new.last_bond_at := old.last_bond_at;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_companion_bond_columns on public.ai_companions;
create trigger guard_companion_bond_columns
  before insert or update on public.ai_companions
  for each row execute function public.guard_companion_bond_columns();

-- Award bond XP to the caller's own companion. Capped per call and
-- throttled to once every 20 seconds so it cannot be farmed.
create or replace function public.award_companion_bond(p_xp int default 1)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_xp int;
begin
  update public.ai_companions
     set bond_xp = bond_xp + least(greatest(coalesce(p_xp, 1), 0), 5),
         last_bond_at = now()
   where user_id = auth.uid()
     and (last_bond_at is null or last_bond_at < now() - interval '20 seconds')
  returning bond_xp into v_xp;

  if v_xp is null then
    select bond_xp into v_xp from public.ai_companions where user_id = auth.uid();
  end if;
  return coalesce(v_xp, 0);
end;
$$;

revoke execute on function public.award_companion_bond(int) from public, anon;
grant execute on function public.award_companion_bond(int) to authenticated;

-- 2. Memory bookkeeping (dedupe by key happens in the API, so existing
--    duplicate rows are left untouched — no unique index, no deletes)
alter table public.companion_memories add column if not exists confidence real not null default 0.7;
alter table public.companion_memories add column if not exists last_referenced_at timestamptz;
create index if not exists idx_companion_memories_companion_key
  on public.companion_memories (companion_id, memory_key);

-- 3. Chat history inserts must target a companion the caller owns
drop policy if exists "Users can insert companion chat history" on public.companion_messages;
create policy "Users can insert companion chat history" on public.companion_messages
  for insert with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.ai_companions c
      where c.id = companion_id and c.user_id = (select auth.uid())
    )
  );

-- 4. Rolling session summaries ("episodic memory") + open follow-up threads
create table if not exists public.companion_summaries (
  id uuid default gen_random_uuid() primary key,
  companion_id uuid references public.ai_companions(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  summary text not null check (char_length(summary) <= 1200),
  open_threads jsonb not null default '[]'::jsonb,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.companion_summaries enable row level security;

drop policy if exists "Owners can view companion summaries" on public.companion_summaries;
create policy "Owners can view companion summaries" on public.companion_summaries
  for select using ((select auth.uid()) = user_id);

drop policy if exists "Owners can insert companion summaries" on public.companion_summaries;
create policy "Owners can insert companion summaries" on public.companion_summaries
  for insert with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.ai_companions c
      where c.id = companion_id and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "Owners can update companion summaries" on public.companion_summaries;
create policy "Owners can update companion summaries" on public.companion_summaries
  for update using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.ai_companions c
      where c.id = companion_id and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "Owners can delete companion summaries" on public.companion_summaries;
create policy "Owners can delete companion summaries" on public.companion_summaries
  for delete using ((select auth.uid()) = user_id);

create index if not exists idx_companion_summaries_comp_created
  on public.companion_summaries (companion_id, created_at desc);
create index if not exists idx_companion_summaries_user
  on public.companion_summaries (user_id);

-- 5. Reminders the companion sets for its owner
create table if not exists public.companion_reminders (
  id uuid default gen_random_uuid() primary key,
  companion_id uuid references public.ai_companions(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  text text not null check (char_length(text) <= 280),
  due_at timestamptz not null,
  done boolean not null default false,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.companion_reminders enable row level security;

drop policy if exists "Owners can view companion reminders" on public.companion_reminders;
create policy "Owners can view companion reminders" on public.companion_reminders
  for select using ((select auth.uid()) = user_id);

drop policy if exists "Owners can insert companion reminders" on public.companion_reminders;
create policy "Owners can insert companion reminders" on public.companion_reminders
  for insert with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.ai_companions c
      where c.id = companion_id and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "Owners can update companion reminders" on public.companion_reminders;
create policy "Owners can update companion reminders" on public.companion_reminders
  for update using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.ai_companions c
      where c.id = companion_id and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "Owners can delete companion reminders" on public.companion_reminders;
create policy "Owners can delete companion reminders" on public.companion_reminders
  for delete using ((select auth.uid()) = user_id);

create index if not exists idx_companion_reminders_user_due
  on public.companion_reminders (user_id, done, due_at);
create index if not exists idx_companion_reminders_companion
  on public.companion_reminders (companion_id);

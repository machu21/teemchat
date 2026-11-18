-- ============================================================
-- Zombie Survival persistence (sandbox Phase 9)
--   survival_world_saves  : the shared world of a survival space, two
--                           alternating slots so a bad or interrupted save
--                           always leaves the previous one to fall back on
--   survival_player_saves : one survivor per user per space (permadeath
--                           deletes it)
--   survival_rules        : the space's difficulty preset / custom rules
-- Idempotent; RLS on every table; nothing here is in supabase_realtime
-- (live play already syncs over broadcast channels).
-- Guests are real auth.users rows, so every policy works for them too.
-- ============================================================

create table if not exists public.survival_world_saves (
  space_id uuid not null references public.spaces(id) on delete cascade,
  slot smallint not null check (slot in (0, 1)),
  version integer not null check (version > 0),
  -- Increases with every save; the newest valid slot wins on load
  seq bigint not null check (seq >= 0),
  state jsonb not null,
  saved_by uuid references public.profiles(id) on delete set null default auth.uid(),
  saved_at timestamptz not null default timezone('utc'::text, now()),
  primary key (space_id, slot),
  -- A world save is a few hundred KB at most; refuse anything absurd
  constraint survival_world_saves_size check (pg_column_size(state) < 4000000)
);

create table if not exists public.survival_player_saves (
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  version integer not null check (version > 0),
  state jsonb not null,
  saved_at timestamptz not null default timezone('utc'::text, now()),
  primary key (space_id, user_id),
  constraint survival_player_saves_size check (pg_column_size(state) < 500000)
);

create table if not exists public.survival_rules (
  space_id uuid primary key references public.spaces(id) on delete cascade,
  rules jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint survival_rules_size check (pg_column_size(rules) < 20000)
);

alter table public.survival_world_saves enable row level security;
alter table public.survival_player_saves enable row level security;
alter table public.survival_rules enable row level security;

-- ------------------------------------------------------------ world saves
-- Whoever can play in the space (members, or anyone in a public / unlisted
-- space) can read and write its world: any of them may be the host. Banned
-- users can't. Only admins can wipe it.
drop policy if exists "Survival world saves are readable by players" on public.survival_world_saves;
create policy "Survival world saves are readable by players" on public.survival_world_saves
  for select using (
    public.is_member_of_space(space_id)
    or exists (select 1 from public.spaces s where s.id = space_id and s.visibility in ('public', 'unlisted'))
  );

drop policy if exists "Survival world saves are written by players" on public.survival_world_saves;
create policy "Survival world saves are written by players" on public.survival_world_saves
  for insert with check (
    auth.uid() is not null
    and (
      public.is_member_of_space(space_id)
      or exists (select 1 from public.spaces s where s.id = space_id and s.visibility in ('public', 'unlisted'))
    )
    and not private.has_space_restriction(space_id, auth.uid(), 'ban')
  );

drop policy if exists "Survival world saves are updated by players" on public.survival_world_saves;
create policy "Survival world saves are updated by players" on public.survival_world_saves
  for update using (
    auth.uid() is not null
    and (
      public.is_member_of_space(space_id)
      or exists (select 1 from public.spaces s where s.id = space_id and s.visibility in ('public', 'unlisted'))
    )
    and not private.has_space_restriction(space_id, auth.uid(), 'ban')
  );

drop policy if exists "Space admins can wipe survival world saves" on public.survival_world_saves;
create policy "Space admins can wipe survival world saves" on public.survival_world_saves
  for delete using (public.is_admin_of_space(space_id));

-- ------------------------------------------------------------ player saves
-- Your survivor is yours alone.
drop policy if exists "Players manage their own survivor save" on public.survival_player_saves;
create policy "Players manage their own survivor save" on public.survival_player_saves
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------ rules
drop policy if exists "Survival rules are readable by players" on public.survival_rules;
create policy "Survival rules are readable by players" on public.survival_rules
  for select using (
    public.is_member_of_space(space_id)
    or exists (select 1 from public.spaces s where s.id = space_id and s.visibility in ('public', 'unlisted'))
  );

drop policy if exists "Space admins set survival rules" on public.survival_rules;
create policy "Space admins set survival rules" on public.survival_rules
  for all using (
    public.is_admin_of_space(space_id)
    or exists (select 1 from public.spaces s where s.id = space_id and s.owner_id = auth.uid())
  )
  with check (
    public.is_admin_of_space(space_id)
    or exists (select 1 from public.spaces s where s.id = space_id and s.owner_id = auth.uid())
  );

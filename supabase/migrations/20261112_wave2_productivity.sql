-- ==========================================================
-- WAVE 2 PRODUCTIVITY (2026-11-12)
-- ----------------------------------------------------------
-- * board_tasks: Kanban cards on placed task boards (hosts edit, viewers read; realtime)
-- * space_meetings: scheduled meetings (hosts create; creator or host edits)
-- * meeting_notes: AI meeting summaries (author inserts; viewers read)
-- Idempotent. RLS on every table. Guests are real auth.users rows.
-- ==========================================================

-- Shared "can see this space" check (member, or public/unlisted space), matching
-- the whiteboard_sessions / world_objects read policies.
create or replace function private.can_view_space(p_space uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select public.is_member_of_space(p_space)
    or exists (select 1 from public.spaces s where s.id = p_space and s.visibility in ('public', 'unlisted'));
$$;
revoke all on function private.can_view_space(uuid) from public, anon;
grant execute on function private.can_view_space(uuid) to authenticated, service_role;

-- ----------------------------------------------------------
-- 1. board_tasks
-- ----------------------------------------------------------
create table if not exists public.board_tasks (
  id uuid default gen_random_uuid() primary key,
  space_id uuid references public.spaces(id) on delete cascade not null,
  world_object_id uuid references public.world_objects(id) on delete cascade not null,
  title text not null check (char_length(title) between 1 and 140),
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  position int not null default 0,
  assignee_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);
alter table public.board_tasks enable row level security;
-- DELETE events must carry world_object_id for the realtime filter.
alter table public.board_tasks replica identity full;
create index if not exists idx_board_tasks_board on public.board_tasks(world_object_id, status, position);
create index if not exists idx_board_tasks_space on public.board_tasks(space_id);
create index if not exists idx_board_tasks_assignee on public.board_tasks(assignee_id);
create index if not exists idx_board_tasks_created_by on public.board_tasks(created_by);

drop policy if exists "Space viewers can read board tasks" on public.board_tasks;
create policy "Space viewers can read board tasks" on public.board_tasks
  for select using (private.can_view_space(space_id));

drop policy if exists "Hosts can manage board tasks" on public.board_tasks;
create policy "Hosts can manage board tasks" on public.board_tasks
  for all
  using (public.am_i_space_moderator(space_id))
  with check (
    public.am_i_space_moderator(space_id)
    and exists (
      select 1 from public.world_objects o
      where o.id = board_tasks.world_object_id
        and o.space_id = board_tasks.space_id
        and o.object_type = 'taskBoard'
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'board_tasks'
  ) then
    alter publication supabase_realtime add table public.board_tasks;
  end if;
end $$;

-- ----------------------------------------------------------
-- 2. space_meetings
-- ----------------------------------------------------------
create table if not exists public.space_meetings (
  id uuid default gen_random_uuid() primary key,
  space_id uuid references public.spaces(id) on delete cascade not null,
  room_id text check (room_id is null or room_id ~ '^[a-z0-9-]{1,48}$'),
  title text not null check (char_length(title) between 1 and 120),
  agenda text check (agenda is null or char_length(agenda) <= 2000),
  starts_at timestamptz not null,
  duration_min int not null default 30 check (duration_min between 5 and 480),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);
alter table public.space_meetings enable row level security;
create index if not exists idx_space_meetings_space_start on public.space_meetings(space_id, starts_at);
create index if not exists idx_space_meetings_created_by on public.space_meetings(created_by);

drop policy if exists "Space viewers can read meetings" on public.space_meetings;
create policy "Space viewers can read meetings" on public.space_meetings
  for select using (private.can_view_space(space_id));

drop policy if exists "Hosts can schedule meetings" on public.space_meetings;
create policy "Hosts can schedule meetings" on public.space_meetings
  for insert with check (
    public.am_i_space_moderator(space_id) and created_by = (select auth.uid())
  );

drop policy if exists "Creator or host can edit meetings" on public.space_meetings;
create policy "Creator or host can edit meetings" on public.space_meetings
  for update using (created_by = (select auth.uid()) or public.am_i_space_moderator(space_id))
  with check (created_by = (select auth.uid()) or public.am_i_space_moderator(space_id));

drop policy if exists "Creator or host can delete meetings" on public.space_meetings;
create policy "Creator or host can delete meetings" on public.space_meetings
  for delete using (created_by = (select auth.uid()) or public.am_i_space_moderator(space_id));

-- ----------------------------------------------------------
-- 3. meeting_notes
-- ----------------------------------------------------------
create table if not exists public.meeting_notes (
  id uuid default gen_random_uuid() primary key,
  space_id uuid references public.spaces(id) on delete cascade not null,
  meeting_id uuid references public.space_meetings(id) on delete set null,
  room_id text check (room_id is null or room_id ~ '^[a-z0-9-]{1,48}$'),
  title text not null check (char_length(title) between 1 and 120),
  summary text not null check (char_length(summary) <= 4000),
  decisions jsonb not null default '[]'::jsonb,
  action_items jsonb not null default '[]'::jsonb,
  attendees jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);
alter table public.meeting_notes enable row level security;
create index if not exists idx_meeting_notes_space_created on public.meeting_notes(space_id, created_at desc);
create index if not exists idx_meeting_notes_meeting on public.meeting_notes(meeting_id);
create index if not exists idx_meeting_notes_created_by on public.meeting_notes(created_by);

drop policy if exists "Space viewers can read meeting notes" on public.meeting_notes;
create policy "Space viewers can read meeting notes" on public.meeting_notes
  for select using (private.can_view_space(space_id));

drop policy if exists "Authors can save meeting notes" on public.meeting_notes;
create policy "Authors can save meeting notes" on public.meeting_notes
  for insert with check (created_by = (select auth.uid()) and private.can_view_space(space_id));

drop policy if exists "Author or host can delete meeting notes" on public.meeting_notes;
create policy "Author or host can delete meeting notes" on public.meeting_notes
  for delete using (created_by = (select auth.uid()) or public.am_i_space_moderator(space_id));

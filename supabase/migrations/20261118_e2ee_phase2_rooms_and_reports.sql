-- Migration: 20261118_e2ee_phase2_rooms_and_reports.sql
-- Description: Multi-party E2EE room key distribution (Squads & Private Spaces) and moderation report evidence snapshots

-- 1. Squad / Group Encryption Keys (Hybrid Room-Key Distribution)
create table if not exists public.group_encryption_keys (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.group_conversations(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete set null,
  encrypted_room_key text not null,
  key_version int not null default 1,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  unique(conversation_id, user_id, key_version)
);

alter table public.group_encryption_keys enable row level security;
create index if not exists idx_group_keys_lookup on public.group_encryption_keys(conversation_id, user_id, key_version desc);

drop policy if exists "Members can read own group encryption keys" on public.group_encryption_keys;
create policy "Members can read own group encryption keys" on public.group_encryption_keys
  for select using ((select auth.uid()) = user_id);

drop policy if exists "Group members can share group encryption keys" on public.group_encryption_keys;
create policy "Group members can share group encryption keys" on public.group_encryption_keys
  for insert with check (
    (select auth.uid()) = sender_id
    and (
      public.is_member_of_group(conversation_id)
      or exists (
        select 1 from public.group_conversations g
        where g.id = conversation_id and g.created_by = (select auth.uid())
      )
    )
  );

drop policy if exists "Members can remove own stale group keys" on public.group_encryption_keys;
create policy "Members can remove own stale group keys" on public.group_encryption_keys
  for delete using ((select auth.uid()) = user_id);

-- 2. Space Room Encryption Keys (Hybrid Room-Key Distribution for Private Spaces)
create table if not exists public.space_encryption_keys (
  id uuid default gen_random_uuid() primary key,
  space_id uuid references public.spaces(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete set null,
  encrypted_room_key text not null,
  key_version int not null default 1,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  unique(space_id, user_id, key_version)
);

alter table public.space_encryption_keys enable row level security;
create index if not exists idx_space_keys_lookup on public.space_encryption_keys(space_id, user_id, key_version desc);

drop policy if exists "Members can read own space encryption keys" on public.space_encryption_keys;
create policy "Members can read own space encryption keys" on public.space_encryption_keys
  for select using ((select auth.uid()) = user_id);

drop policy if exists "Space members can share space encryption keys" on public.space_encryption_keys;
create policy "Space members can share space encryption keys" on public.space_encryption_keys
  for insert with check (
    (select auth.uid()) = sender_id
    and (
      public.is_member_of_space(space_id)
      or exists (
        select 1 from public.spaces s
        where s.id = space_id and s.owner_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Admins or owners can rotate space keys" on public.space_encryption_keys;
create policy "Admins or owners can rotate space keys" on public.space_encryption_keys
  for delete using (
    public.is_admin_of_space(space_id)
    or (select auth.uid()) = user_id
  );

-- 3. Moderation Report Evidence Snapshot (last 5 decrypted messages attached on report)
alter table public.user_reports add column if not exists evidence_snapshot jsonb;

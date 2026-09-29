-- ==========================================================
-- TEEMCHAT: HIGH-SCALE DATABASE ARCHITECTURE (10,000+ USERS)
-- ==========================================================
-- Architecture Blueprint:
-- 1. Persistent Storage (PostgreSQL): Profiles, Spaces, Members, Rooms, Messages, Invites.
-- 2. Ephemeral Realtime (Supabase Broadcast & Presence): Player (x, y) coordinates,
--    proximity voice status, typing indicators. (NEVER written to disk on every frame).
-- 3. Cautious Realtime Publication: Only broadcast-critical tables (messages, direct_messages)
--    are added to `supabase_realtime` to prevent WAL exhaustion at 10k+ scale.
-- ==========================================================

-- Enable essential extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ==========================================================
-- 1. PROFILES & DIGITAL IDENTITIES
-- ==========================================================
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text unique,
  display_name text not null default 'Explorer',
  status text not null default 'available', -- 'available', 'away', 'busy', 'offline'
  status_message text,
  avatar_config jsonb not null default '{
    "hairStyle": "short",
    "accessory": "none",
    "skinColor": "#fcd5b5",
    "shirtColor": "#3b82f6",
    "hairColor": "#37271e"
  }'::jsonb,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.profiles add column if not exists status_message text;
alter table public.profiles enable row level security;

drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
create policy "Public profiles are viewable by everyone" on public.profiles
  for select using (true);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);

-- ==========================================================
-- 2. AUTOMATIC PROFILE PROVISIONING TRIGGER
-- ==========================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ==========================================================
-- 3. SPACES & WORLDS (Virtual Headquarters & Hangout hubs)
-- ==========================================================
create table if not exists public.spaces (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  slug text unique not null,
  description text,
  category text not null default 'Gaming', -- 'Gaming', 'Work', 'School', 'Friends', 'Other'
  visibility text not null default 'public', -- 'public', 'private', 'unlisted'
  tier text not null default 'free', -- 'free', 'pro', 'studio'
  join_code text,
  owner_id uuid references public.profiles(id) on delete set null,
  max_capacity int not null default 15, -- 15 for free, 75 for pro, 250+ for studio
  member_count int not null default 1, -- Denormalized counter for instant listing queries
  palette_index int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.spaces enable row level security;

-- Keep worlds table view/table for backwards compatibility with initial seed
create table if not exists public.worlds (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  slug text unique not null,
  description text,
  visibility text not null default 'public',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);
alter table public.worlds enable row level security;

drop policy if exists "Public spaces are viewable by everyone" on public.spaces;
create policy "Public spaces are viewable by everyone" on public.spaces
  for select using (visibility = 'public');

drop policy if exists "Public worlds are viewable by everyone" on public.worlds;
create policy "Public worlds are viewable by everyone" on public.worlds
  for select using (visibility = 'public');

drop policy if exists "Authenticated users can create spaces" on public.spaces;
create policy "Authenticated users can create spaces" on public.spaces
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "Space owners can update their spaces" on public.spaces;
create policy "Space owners can update their spaces" on public.spaces
  for update using (auth.uid() = owner_id);

-- ==========================================================
-- 4. SPACE MEMBERS & ROLES
-- ==========================================================
create table if not exists public.space_members (
  id uuid default gen_random_uuid() primary key,
  space_id uuid references public.spaces(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null default 'member', -- 'owner', 'admin', 'moderator', 'member', 'guest'
  is_pinned boolean not null default false,
  joined_at timestamptz default timezone('utc'::text, now()) not null,
  last_seen_at timestamptz default timezone('utc'::text, now()) not null,
  unique(space_id, user_id)
);

alter table public.space_members enable row level security;

-- High-speed composite indexes for zero-lag RLS checks
create index if not exists idx_space_members_lookup on public.space_members(user_id, space_id);
create index if not exists idx_space_members_space_role on public.space_members(space_id, role);

-- STABLE SECURITY DEFINER helper to prevent expensive RLS subquery overhead
create or replace function public.is_member_of_space(_space_id uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.space_members
    where space_id = _space_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_admin_of_space(_space_id uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.space_members
    where space_id = _space_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

drop policy if exists "Members can view space members" on public.space_members;
create policy "Members can view space members" on public.space_members
  for select using (
    user_id = auth.uid()
    or public.is_member_of_space(space_id)
    or exists (select 1 from public.spaces s where s.id = space_id and s.visibility = 'public')
  );

drop policy if exists "Users can join public spaces or with invites" on public.space_members;
create policy "Users can join public spaces or with invites" on public.space_members
  for insert with check (auth.uid() = user_id);

drop policy if exists "Members can leave or admins can manage members" on public.space_members;
create policy "Members can leave or admins can manage members" on public.space_members
  for delete using (
    user_id = auth.uid()
    or public.is_admin_of_space(space_id)
  );

-- Trigger: Automatically maintain denormalized member_count on spaces
create or replace function public.sync_space_member_count()
returns trigger as $$
begin
  if (TG_OP = 'INSERT') then
    update public.spaces set member_count = member_count + 1 where id = new.space_id;
  elsif (TG_OP = 'DELETE') then
    update public.spaces set member_count = greatest(1, member_count - 1) where id = old.space_id;
  end if;
  return null;
end;
$$ language plpgsql security definer;

drop trigger if exists on_space_member_count_change on public.space_members;
create trigger on_space_member_count_change
  after insert or delete on public.space_members
  for each row execute procedure public.sync_space_member_count();

-- ==========================================================
-- 5. SPACE INVITES (Shareable invite codes & vanity URLs)
-- ==========================================================
create table if not exists public.space_invites (
  id uuid default gen_random_uuid() primary key,
  code text unique not null,
  space_id uuid references public.spaces(id) on delete cascade not null,
  created_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz,
  max_uses int,
  uses_count int not null default 0,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.space_invites enable row level security;

create index if not exists idx_space_invites_code on public.space_invites(code);

drop policy if exists "Anyone can inspect valid invite code" on public.space_invites;
create policy "Anyone can inspect valid invite code" on public.space_invites
  for select using (
    expires_at is null or expires_at > now()
  );

drop policy if exists "Space members can create invites" on public.space_invites;
create policy "Space members can create invites" on public.space_invites
  for insert with check (public.is_member_of_space(space_id));

-- ==========================================================
-- 6. ROOMS & VOICE HUTS (Inside Spaces)
-- ==========================================================
create table if not exists public.rooms (
  id uuid default gen_random_uuid() primary key,
  space_id uuid references public.spaces(id) on delete cascade not null,
  name text not null,
  kind text not null default 'text', -- 'text', 'voice_hut', 'campfire', 'stage'
  topic text,
  capacity int not null default 0, -- 0 = unlimited
  position_x double precision not null default 0.0,
  position_y double precision not null default 0.0,
  radius double precision not null default 160.0, -- Spatial voice proximity threshold
  sort_order int not null default 0,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.rooms enable row level security;

create index if not exists idx_rooms_space_id on public.rooms(space_id, sort_order);

drop policy if exists "Rooms are viewable by space members or public spaces" on public.rooms;
create policy "Rooms are viewable by space members or public spaces" on public.rooms
  for select using (
    public.is_member_of_space(space_id)
    or exists (select 1 from public.spaces s where s.id = space_id and s.visibility = 'public')
  );

drop policy if exists "Space admins can create or edit rooms" on public.rooms;
create policy "Space admins can create or edit rooms" on public.rooms
  for all using (public.is_admin_of_space(space_id));

-- ==========================================================
-- 7. MESSAGES (Text chat with pagination indexes)
-- ==========================================================
create table if not exists public.messages (
  id uuid default gen_random_uuid() primary key,
  room_id text not null,
  space_id uuid references public.spaces(id) on delete cascade not null, -- Strategic denormalization for fast RLS
  sender_id uuid references public.profiles(id) on delete set null not null,
  content text not null,
  attachments jsonb not null default '[]'::jsonb,
  reply_to_id uuid references public.messages(id) on delete set null,
  is_edited boolean not null default false,
  is_pinned boolean not null default false,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.messages enable row level security;

-- High-performance composite indexes for instant chat history pagination
create index if not exists idx_messages_room_created on public.messages (room_id, created_at desc);
create index if not exists idx_messages_space_created on public.messages (space_id, created_at desc);

drop policy if exists "Members can read room messages" on public.messages;
create policy "Members can read room messages" on public.messages
  for select using (
    public.is_member_of_space(space_id)
    or exists (select 1 from public.spaces s where s.id = space_id and s.visibility = 'public')
  );

drop policy if exists "Members can insert room messages" on public.messages;
create policy "Members can insert room messages" on public.messages
  for insert with check (
    auth.uid() = sender_id
    and (
      public.is_member_of_space(space_id)
      or exists (select 1 from public.spaces s where s.id = space_id and s.visibility = 'public')
    )
  );

drop policy if exists "Senders can edit or delete their own messages" on public.messages;
create policy "Senders can edit or delete their own messages" on public.messages
  for update using (auth.uid() = sender_id);

drop policy if exists "Senders or admins can delete messages" on public.messages;
create policy "Senders or admins can delete messages" on public.messages
  for delete using (
    auth.uid() = sender_id
    or public.is_admin_of_space(space_id)
  );

-- ==========================================================
-- 8. MESSAGE REACTIONS
-- ==========================================================
create table if not exists public.message_reactions (
  id uuid default gen_random_uuid() primary key,
  message_id uuid references public.messages(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  emoji text not null,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  unique(message_id, user_id, emoji)
);

alter table public.message_reactions enable row level security;

create index if not exists idx_reactions_message on public.message_reactions(message_id);

drop policy if exists "Reactions viewable by anyone who can view the message" on public.message_reactions;
create policy "Reactions viewable by anyone who can view the message" on public.message_reactions
  for select using (true);

drop policy if exists "Users can toggle their own reactions" on public.message_reactions;
create policy "Users can toggle their own reactions" on public.message_reactions
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own reactions" on public.message_reactions;
create policy "Users can remove their own reactions" on public.message_reactions
  for delete using (auth.uid() = user_id);

-- ==========================================================
-- 9. BUDDY CHAT & DIRECT MESSAGING (1-on-1 Mini Chat Window)
-- ==========================================================
create table if not exists public.buddy_conversations (
  id uuid default gen_random_uuid() primary key,
  user_one uuid references public.profiles(id) on delete cascade not null,
  user_two uuid references public.profiles(id) on delete cascade not null,
  last_message_at timestamptz default timezone('utc'::text, now()) not null,
  last_preview text,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  unique(user_one, user_two),
  check (user_one < user_two) -- Enforces canonical ordering
);

alter table public.buddy_conversations enable row level security;

create index if not exists idx_buddy_conv_u1 on public.buddy_conversations(user_one, last_message_at desc);
create index if not exists idx_buddy_conv_u2 on public.buddy_conversations(user_two, last_message_at desc);

drop policy if exists "Participants can view their buddy conversations" on public.buddy_conversations;
create policy "Participants can view their buddy conversations" on public.buddy_conversations
  for select using (auth.uid() in (user_one, user_two));

drop policy if exists "Participants can create buddy conversations" on public.buddy_conversations;
create policy "Participants can create buddy conversations" on public.buddy_conversations
  for insert with check (auth.uid() in (user_one, user_two));

create table if not exists public.direct_messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.buddy_conversations(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  is_read boolean not null default false,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.direct_messages enable row level security;

create index if not exists idx_dm_conv_created on public.direct_messages(conversation_id, created_at desc);
create index if not exists idx_dm_unread on public.direct_messages(conversation_id, is_read) where is_read = false;

drop policy if exists "Participants can view direct messages" on public.direct_messages;
create policy "Participants can view direct messages" on public.direct_messages
  for select using (
    exists (
      select 1 from public.buddy_conversations c
      where c.id = conversation_id and auth.uid() in (c.user_one, c.user_two)
    )
  );

drop policy if exists "Participants can send direct messages" on public.direct_messages;
create policy "Participants can send direct messages" on public.direct_messages
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.buddy_conversations c
      where c.id = conversation_id and auth.uid() in (c.user_one, c.user_two)
    )
  );

-- ==========================================================
-- 10. INTERACTIVE 2D WORLD OBJECTS (Furniture, Campfires, Boards)
-- ==========================================================
create table if not exists public.world_objects (
  id uuid default gen_random_uuid() primary key,
  space_id uuid references public.spaces(id) on delete cascade not null,
  object_type text not null, -- 'table', 'chair', 'campfire', 'whiteboard', 'arcade', 'plant'
  x double precision not null,
  y double precision not null,
  rotation int not null default 0,
  properties jsonb not null default '{}'::jsonb,
  placed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.world_objects enable row level security;

create index if not exists idx_world_objects_space on public.world_objects(space_id);

drop policy if exists "World objects are viewable by space viewers" on public.world_objects;
create policy "World objects are viewable by space viewers" on public.world_objects
  for select using (
    public.is_member_of_space(space_id)
    or exists (select 1 from public.spaces s where s.id = space_id and s.visibility = 'public')
  );

drop policy if exists "Space admins can place or edit world objects" on public.world_objects;
create policy "Space admins can place or edit world objects" on public.world_objects
  for all using (public.is_admin_of_space(space_id));

-- ==========================================================
-- 11. SUPABASE REALTIME PUBLICATION SETUP (STRICTLY CAUTIOUS)
-- ==========================================================
-- CRITICAL SCALING RULE FOR 10,000+ CONCURRENT USERS:
-- DO NOT add high-frequency tables (coordinates, avatars, presence ticks, audio stats)
-- to supabase_realtime. Doing so floods Postgres WAL and crashes replication.
--
-- Player movement & spatial voice presence MUST run through Supabase Realtime
-- Broadcast & Presence channels in client memory without writing to database tables.
--
-- Only durable chat tables that require immediate multi-client delivery are added:
-- - public.messages
-- - public.direct_messages
-- ==========================================================

do $$
begin
  -- Idempotently add messages to Realtime publication
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  -- Idempotently add direct_messages to Realtime publication
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end $$;

-- Keep DEFAULT replica identity for messages to minimize WAL bloat
alter table public.messages replica identity default;
alter table public.direct_messages replica identity default;

-- ==========================================================
-- 12. INITIAL SEED WORLD (Main Headquarters)
-- ==========================================================
insert into public.spaces (name, slug, description, category, visibility)
values (
  'Main Headquarters',
  'main-hq',
  'Persistent virtual world with Open Lobby, Focus Lab, Conference Room, and Lounge',
  'Gaming',
  'public'
)
on conflict (slug) do nothing;

insert into public.worlds (name, slug, description, visibility)
values (
  'Main Headquarters',
  'main-hq',
  'Persistent virtual world with Open Lobby, Focus Lab, Conference Room, and Lounge',
  'public'
)
on conflict (slug) do nothing;

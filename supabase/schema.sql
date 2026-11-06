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
alter table public.profiles add column if not exists gender text check (gender in ('male', 'female')) default 'male';
alter table public.profiles add column if not exists system_role text not null default 'user' check (system_role in ('user', 'moderator', 'admin', 'superadmin'));
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
-- 2. AUTOMATIC PROFILE PROVISIONING & EMAIL CONFIRMATION TRIGGER
-- ==========================================================
create or replace function public.auto_confirm_new_user()
returns trigger as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created_auto_confirm on auth.users;
create trigger on_auth_user_created_auto_confirm
  before insert on auth.users
  for each row execute procedure public.auto_confirm_new_user();

create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_gender text;
begin
  v_gender := lower(coalesce(nullif(new.raw_user_meta_data->>'gender', ''), 'male'));
  if v_gender not in ('male', 'female') then
    v_gender := 'male';
  end if;

  insert into public.profiles (id, username, display_name, gender)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    v_gender
  )
  on conflict (id) do update set
    gender = excluded.gender,
    display_name = coalesce(excluded.display_name, public.profiles.display_name);
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
  for select using (
    visibility in ('public', 'unlisted')
    or owner_id = auth.uid()
    or public.is_member_of_space(id)
  );

drop policy if exists "Public worlds are viewable by everyone" on public.worlds;
create policy "Public worlds are viewable by everyone" on public.worlds
  for select using (visibility = 'public');

drop policy if exists "Authenticated users can create spaces" on public.spaces;
create policy "Authenticated users can create spaces" on public.spaces
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "Space owners can update their spaces" on public.spaces;
create policy "Space owners can update their spaces" on public.spaces
  for update using (auth.uid() = owner_id);

drop policy if exists "Space owners can delete their spaces" on public.spaces;
create policy "Space owners can delete their spaces" on public.spaces
  for delete using (auth.uid() = owner_id);

alter table public.spaces add column if not exists map_theme text not null default 'village';

-- Space mode: 'social' hangout spaces or 'zombie' survival spaces (always on zombie_city)
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
  )
  or exists (
    select 1 from public.spaces
    where id = _space_id and owner_id = auth.uid()
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
  for insert with check (
    public.is_member_of_space(space_id)
    or exists (select 1 from public.spaces s where s.id = space_id and s.owner_id = auth.uid())
  );

-- Function: Resolve invite or slug safely
create or replace function public.resolve_space_invite(p_code text)
returns setof public.spaces
language sql
stable
security definer
set search_path = public
as $$
  select s.*
  from public.spaces s
  where btrim(p_code) <> ''
    and (
      (lower(s.slug) = lower(btrim(p_code)) and s.visibility in ('public', 'unlisted'))
      or (s.id::text = btrim(p_code) and s.visibility in ('public', 'unlisted'))
      or (lower(s.join_code) = lower(btrim(p_code)))
      or exists (
        select 1 from public.space_invites si
        where si.space_id = s.id
          and lower(si.code) = lower(btrim(p_code))
          and (si.expires_at is null or si.expires_at > now())
          and (si.max_uses is null or si.uses_count < si.max_uses)
      )
    )
  limit 1;
$$;

-- Function: Join space via invite
create or replace function public.join_space_via_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space public.spaces;
  v_uid uuid := auth.uid();
begin
  select * into v_space from public.resolve_space_invite(p_code);
  if v_space.id is null then
    return null;
  end if;

  if v_uid is not null and exists (select 1 from public.profiles where id = v_uid) then
    insert into public.space_members(space_id, user_id, role)
    values (v_space.id, v_uid, 'member')
    on conflict (space_id, user_id) do nothing;

    update public.space_invites
    set uses_count = uses_count + 1
    where space_id = v_space.id and lower(code) = lower(btrim(p_code));
  end if;

  return v_space.id;
end;
$$;

-- Function: Provision ephemeral guest account
create or replace function public.provision_guest_account(
  p_display_name text,
  p_password text,
  p_avatar_config jsonb default '{}'::jsonb,
  p_gender text default 'male',
  p_username text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid := gen_random_uuid();
  v_rand int := floor(random() * 9000 + 1000)::int;
  v_username text;
  v_email text;
  v_encrypted_pw text;
  v_gender text;
begin
  v_gender := lower(coalesce(nullif(p_gender, ''), 'male'));
  if v_gender not in ('male', 'female') then
    v_gender := 'male';
  end if;

  if p_username is not null and length(trim(p_username)) > 0 then
    v_username := lower(regexp_replace(trim(p_username), '[^a-zA-Z0-9_]', '', 'g'));
    -- If this username is already taken, append a random discriminator
    if exists (select 1 from public.profiles where username = v_username) then
      v_username := v_username || '_' || v_rand;
    end if;
  else
    v_username := 'guest_' || v_rand || '_' || to_char(now(), 'HH24MISS');
  end if;

  v_email := v_username || '@guest.teemchat.local';
  v_encrypted_pw := crypt(p_password, gen_salt('bf'));

  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    phone,
    phone_change,
    phone_change_token,
    email_change_token_current,
    reauthentication_token,
    raw_app_meta_data,
    raw_user_meta_data,
    is_anonymous,
    created_at,
    updated_at
  ) values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email,
    v_encrypted_pw,
    now(),
    '',
    '',
    '',
    '',
    null,
    '',
    '',
    '',
    '',
    jsonb_build_object('provider', 'email', 'providers', array['email'], 'is_guest', true),
    jsonb_build_object('display_name', p_display_name, 'username', v_username, 'is_guest', true, 'gender', v_gender),
    false,
    now(),
    now()
  );

  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email',
    v_user_id::text,
    now(),
    now(),
    now()
  );

  insert into public.profiles (
    id,
    username,
    display_name,
    gender,
    avatar_config,
    is_paid,
    tier,
    has_ai_companion,
    created_at,
    updated_at
  ) values (
    v_user_id,
    v_username,
    p_display_name,
    v_gender,
    p_avatar_config,
    false,
    'free',
    false,
    now(),
    now()
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    avatar_config = excluded.avatar_config,
    gender = excluded.gender;

  return jsonb_build_object(
    'user_id', v_user_id,
    'email', v_email,
    'username', v_username,
    'display_name', p_display_name,
    'gender', v_gender
  );
end;
$$;

-- Function: Delete guest account
create or replace function public.delete_guest_account()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_is_guest boolean;
begin
  if v_uid is null then
    return false;
  end if;

  select coalesce((raw_app_meta_data->>'is_guest')::boolean, is_anonymous, false)
  into v_is_guest
  from auth.users
  where id = v_uid;

  if v_is_guest is true then
    delete from auth.users where id = v_uid;
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.cleanup_guest_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_is_guest boolean;
begin
  select coalesce((raw_app_meta_data->>'is_guest')::boolean, is_anonymous, false)
  into v_is_guest
  from auth.users
  where id = p_user_id;

  if v_is_guest is true then
    delete from auth.users where id = p_user_id;
    return true;
  end if;
  return false;
end;
$$;

grant execute on function public.resolve_space_invite(text) to anon, authenticated;
grant execute on function public.join_space_via_invite(text) to anon, authenticated;
grant execute on function public.provision_guest_account(text, text, jsonb, text, text) to anon, authenticated;
grant execute on function public.delete_guest_account() to authenticated;
grant execute on function public.cleanup_guest_user(uuid) to anon, authenticated;


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

-- Automatically purge messages older than 30 seconds
create or replace function public.purge_expired_messages()
returns trigger
language plpgsql
security definer
as $$
begin
  delete from public.messages
  where created_at < now() - interval '30 seconds';
  return new;
end;
$$;

drop trigger if exists trg_purge_expired_messages on public.messages;
create trigger trg_purge_expired_messages
after insert on public.messages
for each statement
execute function public.purge_expired_messages();

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

-- ==========================================================
-- 13. AI COMPANIONS & USER TIERS (Learned Knowledge & Personality)
-- ==========================================================
alter table public.profiles add column if not exists tier text not null default 'free';
alter table public.profiles add column if not exists is_paid boolean not null default false;
alter table public.profiles add column if not exists has_ai_companion boolean not null default false;

create table if not exists public.ai_companions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade unique not null,
  name text not null default 'Pixel Companion',
  persona text not null default 'A friendly, insightful AI companion who travels the virtual world with you and learns your style.',
  companion_type text not null default 'robot', -- 'robot', 'cyber_cat', 'retro_dog', 'mystic_wisp'
  avatar_style text not null default 'bot_blue',
  learned_context jsonb not null default '{"interests": [], "personality_traits": [], "memories": []}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.ai_companions enable row level security;

drop policy if exists "Users can view their own companion" on public.ai_companions;
create policy "Users can view their own companion" on public.ai_companions
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own companion" on public.ai_companions;
create policy "Users can insert their own companion" on public.ai_companions
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own companion" on public.ai_companions;
create policy "Users can update their own companion" on public.ai_companions
  for update using (auth.uid() = user_id);

drop policy if exists "Users can delete their own companion" on public.ai_companions;
create policy "Users can delete their own companion" on public.ai_companions
  for delete using (auth.uid() = user_id);

create table if not exists public.companion_memories (
  id uuid default gen_random_uuid() primary key,
  companion_id uuid references public.ai_companions(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  memory_key text not null,
  memory_value text not null,
  category text not null default 'general',
  created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.companion_memories enable row level security;

drop policy if exists "Users can view their companion memories" on public.companion_memories;
create policy "Users can view their companion memories" on public.companion_memories
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their companion memories" on public.companion_memories;
create policy "Users can insert their companion memories" on public.companion_memories
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their companion memories" on public.companion_memories;
create policy "Users can update their companion memories" on public.companion_memories
  for update using (auth.uid() = user_id);

drop policy if exists "Users can delete their companion memories" on public.companion_memories;
create policy "Users can delete their companion memories" on public.companion_memories
  for delete using (auth.uid() = user_id);

create table if not exists public.companion_messages (
  id uuid default gen_random_uuid() primary key,
  companion_id uuid references public.ai_companions(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.companion_messages enable row level security;

drop policy if exists "Users can view their companion chat history" on public.companion_messages;
create policy "Users can view their companion chat history" on public.companion_messages
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert companion chat history" on public.companion_messages;
create policy "Users can insert companion chat history" on public.companion_messages
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can delete companion chat history" on public.companion_messages;
create policy "Users can delete companion chat history" on public.companion_messages
  for delete using (auth.uid() = user_id);

create index if not exists idx_companion_user on public.ai_companions(user_id);
create index if not exists idx_companion_memories_user on public.companion_memories(user_id);
create index if not exists idx_companion_messages_comp on public.companion_messages(companion_id, created_at asc);

-- ==========================================================
-- 14. RAG (RETRIEVAL-AUGMENTED GENERATION) FOR AI COMPANION
-- ==========================================================
-- Upgrades companion_memories to use pgvector for semantic
-- similarity search — the core of the RAG pipeline.
-- Embeddings are generated by Gemini text-embedding-004 (768-dim).
-- ==========================================================

-- Enable pgvector extension
create extension if not exists vector;

-- Add vector embedding column (768-dim for Gemini text-embedding-004)
alter table public.companion_memories
  add column if not exists embedding vector(768);

-- Add importance score for weighted retrieval ranking
alter table public.companion_memories
  add column if not exists importance_score float not null default 0.5;

-- Add updated_at for staleness tracking
alter table public.companion_memories
  add column if not exists updated_at timestamptz default timezone('utc'::text, now()) not null;

-- HNSW index for fast approximate nearest-neighbor cosine search
-- HNSW preferred over IVFFlat for < 1M rows; no training required
create index if not exists idx_companion_memories_embedding
  on public.companion_memories
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Composite index for per-companion ordered lookup
create index if not exists idx_companion_memories_companion_created
  on public.companion_memories (companion_id, created_at desc);

-- RPC: Semantic similarity search (primary RAG retrieval path)
-- Called by Flutter client with query embedding to find relevant memories
create or replace function public.match_companion_memories(
  p_companion_id uuid,
  p_query_embedding vector(768),
  p_match_count int default 6,
  p_min_similarity float default 0.65
)
returns table (
  id uuid,
  memory_key text,
  memory_value text,
  category text,
  importance_score float,
  similarity float,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cm.id,
    cm.memory_key,
    cm.memory_value,
    cm.category,
    cm.importance_score,
    1 - (cm.embedding <=> p_query_embedding) as similarity,
    cm.created_at
  from public.companion_memories cm
  where
    cm.companion_id = p_companion_id
    and cm.embedding is not null
    and 1 - (cm.embedding <=> p_query_embedding) >= p_min_similarity
  order by cm.embedding <=> p_query_embedding
  limit p_match_count;
$$;

-- RPC: Fallback — fetch most important recent memories (cold start / no embedding)
create or replace function public.get_recent_companion_memories(
  p_companion_id uuid,
  p_limit int default 10
)
returns table (
  id uuid,
  memory_key text,
  memory_value text,
  category text,
  importance_score float,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    id,
    memory_key,
    memory_value,
    category,
    importance_score,
    created_at
  from public.companion_memories
  where companion_id = p_companion_id
  order by importance_score desc, created_at desc
  limit p_limit;
$$;

-- ==========================================================
-- 10. SPACE PLAYLISTS & SOUND TRIPPING TRACKS
-- ==========================================================
create table if not exists public.space_playlists (
  id uuid default gen_random_uuid() primary key,
  space_id uuid references public.spaces(id) on delete cascade not null,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null,
  artist text default 'Custom Upload',
  audio_url text not null,
  duration_seconds int default 0,
  order_index int default 0,
  is_active boolean default true,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.space_playlists enable row level security;

drop policy if exists "Playlists are viewable by everyone" on public.space_playlists;
create policy "Playlists are viewable by everyone" on public.space_playlists
  for select using (true);

drop policy if exists "Authenticated users can insert playlist tracks" on public.space_playlists;
create policy "Authenticated users can insert playlist tracks" on public.space_playlists
  for insert with check (auth.uid() is not null);

drop policy if exists "Creators or space owners can delete playlist tracks" on public.space_playlists;
create policy "Creators or space owners can delete playlist tracks" on public.space_playlists
  for delete using (auth.uid() = created_by or auth.uid() in (select owner_id from public.spaces where id = space_id));

-- ==========================================================
-- 15. AI COMPANION DAILY USAGE LIMITS & QUOTAS
-- ==========================================================
create table if not exists public.ai_usage (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  usage_date date not null default (current_timestamp at time zone 'utc')::date,
  message_count int not null default 0,
  max_daily_messages int not null default 50,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null,
  unique (user_id, usage_date)
);

create index if not exists idx_ai_usage_user_date on public.ai_usage(user_id, usage_date);

alter table public.ai_usage enable row level security;

drop policy if exists "Users can view their own ai usage" on public.ai_usage;
create policy "Users can view their own ai usage" on public.ai_usage
  for select using (auth.uid() = user_id);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ai_usage'
  ) then
    alter publication supabase_realtime add table public.ai_usage;
  end if;
end $$;

create or replace function public.get_ai_usage_status(
  p_daily_limit int default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (current_timestamp at time zone 'utc')::date;
  v_count int := 0;
  v_resets_at timestamptz := (v_today + interval '1 day') at time zone 'utc';
begin
  if v_user_id is null then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'error', 'unauthorized');
  end if;

  select coalesce(message_count, 0) into v_count
  from public.ai_usage
  where user_id = v_user_id and usage_date = v_today;

  return jsonb_build_object(
    'allowed', (coalesce(v_count, 0) < p_daily_limit),
    'current_count', coalesce(v_count, 0),
    'daily_limit', p_daily_limit,
    'remaining', greatest(0, p_daily_limit - coalesce(v_count, 0)),
    'resets_at', v_resets_at
  );
end;
$$;

create or replace function public.check_and_increment_ai_usage(
  p_daily_limit int default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (current_timestamp at time zone 'utc')::date;
  v_current_count int;
  v_resets_at timestamptz := (v_today + interval '1 day') at time zone 'utc';
  v_is_paid boolean := false;
  v_effective_limit int;
begin
  if v_user_id is null then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'error', 'unauthorized');
  end if;

  -- Look up user subscription status
  select coalesce(is_paid, false) into v_is_paid
  from public.profiles
  where id = v_user_id;

  -- Free accounts receive 5 trial AI messages; paid accounts receive p_daily_limit (default 50)
  if v_is_paid then
    v_effective_limit := coalesce(p_daily_limit, 50);
  else
    v_effective_limit := 5;
  end if;

  insert into public.ai_usage (user_id, usage_date, message_count, max_daily_messages)
  values (v_user_id, v_today, 0, v_effective_limit)
  on conflict (user_id, usage_date) do nothing;

  select message_count into v_current_count
  from public.ai_usage
  where user_id = v_user_id and usage_date = v_today
  for update;

  if v_current_count >= v_effective_limit then
    return jsonb_build_object(
      'allowed', false,
      'current_count', v_current_count,
      'daily_limit', v_effective_limit,
      'remaining', 0,
      'is_trial', not v_is_paid,
      'resets_at', v_resets_at
    );
  end if;

  update public.ai_usage
  set message_count = message_count + 1,
      updated_at = timezone('utc'::text, now())
  where user_id = v_user_id and usage_date = v_today;

  return jsonb_build_object(
    'allowed', true,
    'current_count', v_current_count + 1,
    'daily_limit', v_effective_limit,
    'remaining', v_effective_limit - (v_current_count + 1),
    'is_trial', not v_is_paid,
    'resets_at', v_resets_at
  );
end;
$$;

-- ==========================================================
-- 23. STRIPE SUBSCRIPTIONS & UNLIMITED AI ADD-ON
-- ==========================================================
create table if not exists public.user_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade unique not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_id text not null default 'ai_unlimited_monthly',
  status text not null default 'active', -- 'active', 'trialing', 'past_due', 'canceled'
  has_ai_unlimited boolean not null default true,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists idx_user_subscriptions_user_id on public.user_subscriptions(user_id);
create index if not exists idx_user_subscriptions_stripe_cust on public.user_subscriptions(stripe_customer_id);
create index if not exists idx_user_subscriptions_stripe_sub on public.user_subscriptions(stripe_subscription_id);

alter table public.user_subscriptions enable row level security;

drop policy if exists "Users can view their own subscription" on public.user_subscriptions;
create policy "Users can view their own subscription" on public.user_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "Service role can manage all subscriptions" on public.user_subscriptions;
create policy "Service role can manage all subscriptions" on public.user_subscriptions
  for all using (auth.role() = 'service_role');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_subscriptions'
  ) then
    alter publication supabase_realtime add table public.user_subscriptions;
  end if;
end $$;

-- ==========================================================
-- 24. DASHBOARD SOCIAL HUB: FRIENDSHIPS, REQUESTS, GROUP CHATS
-- ==========================================================

-- Friendships (accepted friends between two users)
create table if not exists public.friendships (
  id uuid default gen_random_uuid() primary key,
  user_one uuid references public.profiles(id) on delete cascade not null,
  user_two uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  check (user_one < user_two),
  unique(user_one, user_two)
);

alter table public.friendships enable row level security;
create index if not exists idx_friendships_user_one on public.friendships(user_one);
create index if not exists idx_friendships_user_two on public.friendships(user_two);

drop policy if exists "Users can view their friendships" on public.friendships;
create policy "Users can view their friendships" on public.friendships
  for select using (auth.uid() in (user_one, user_two));

drop policy if exists "Users can insert friendships" on public.friendships;
create policy "Users can insert friendships" on public.friendships
  for insert with check (auth.uid() in (user_one, user_two));

drop policy if exists "Users can delete their friendships" on public.friendships;
create policy "Users can delete their friendships" on public.friendships
  for delete using (auth.uid() in (user_one, user_two));

-- Friend Requests
create table if not exists public.friend_requests (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  receiver_id uuid references public.profiles(id) on delete cascade not null,
  status text not null default 'pending', -- 'pending', 'accepted', 'declined'
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null,
  check (sender_id <> receiver_id),
  unique(sender_id, receiver_id)
);

alter table public.friend_requests enable row level security;
create index if not exists idx_friend_req_receiver on public.friend_requests(receiver_id, status);
create index if not exists idx_friend_req_sender on public.friend_requests(sender_id, status);

drop policy if exists "Users can view their own friend requests" on public.friend_requests;
create policy "Users can view their own friend requests" on public.friend_requests
  for select using (auth.uid() in (sender_id, receiver_id));

drop policy if exists "Users can send friend requests" on public.friend_requests;
create policy "Users can send friend requests" on public.friend_requests
  for insert with check (auth.uid() = sender_id);

drop policy if exists "Receivers or senders can update request status" on public.friend_requests;
create policy "Receivers or senders can update request status" on public.friend_requests
  for update using (auth.uid() in (sender_id, receiver_id));

drop policy if exists "Users can delete friend requests" on public.friend_requests;
create policy "Users can delete friend requests" on public.friend_requests
  for delete using (auth.uid() in (sender_id, receiver_id));

-- Group Squad Conversations
create table if not exists public.group_conversations (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  icon text not null default '👾',
  created_by uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz default timezone('utc'::text, now()) not null,
  last_preview text,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.group_conversations enable row level security;

create table if not exists public.group_conversation_members (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.group_conversations(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null default 'member', -- 'owner', 'admin', 'member'
  joined_at timestamptz default timezone('utc'::text, now()) not null,
  last_read_at timestamptz default timezone('utc'::text, now()) not null,
  unique(conversation_id, user_id)
);

alter table public.group_conversation_members enable row level security;
create index if not exists idx_group_members_user on public.group_conversation_members(user_id);
create index if not exists idx_group_members_conv on public.group_conversation_members(conversation_id);

create or replace function public.is_member_of_group(_conversation_id uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_conversation_members
    where conversation_id = _conversation_id and user_id = auth.uid()
  );
$$;

drop policy if exists "Members can view their group conversations" on public.group_conversations;
create policy "Members can view their group conversations" on public.group_conversations
  for select using (public.is_member_of_group(id));

drop policy if exists "Authenticated users can create group conversations" on public.group_conversations;
create policy "Authenticated users can create group conversations" on public.group_conversations
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "Members can view group members" on public.group_conversation_members;
create policy "Members can view group members" on public.group_conversation_members
  for select using (public.is_member_of_group(conversation_id));

drop policy if exists "Users can add group members or join" on public.group_conversation_members;
create policy "Users can add group members or join" on public.group_conversation_members
  for insert with check (
    auth.uid() = user_id or public.is_member_of_group(conversation_id) or auth.role() = 'authenticated'
  );

drop policy if exists "Members can leave or owners can remove members" on public.group_conversation_members;
create policy "Members can leave or owners can remove members" on public.group_conversation_members
  for delete using (auth.uid() = user_id or public.is_member_of_group(conversation_id));

-- Group Messages
create table if not exists public.group_messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.group_conversations(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.group_messages enable row level security;
create index if not exists idx_group_messages_conv_created on public.group_messages(conversation_id, created_at desc);

drop policy if exists "Members can view group messages" on public.group_messages;
create policy "Members can view group messages" on public.group_messages
  for select using (public.is_member_of_group(conversation_id));

drop policy if exists "Members can insert group messages" on public.group_messages;
create policy "Members can insert group messages" on public.group_messages
  for insert with check (
    auth.uid() = sender_id and public.is_member_of_group(conversation_id)
  );

-- Atomic Accept Friend Request RPC
create or replace function public.accept_friend_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.friend_requests;
  v_u1 uuid;
  v_u2 uuid;
begin
  select * into v_req from public.friend_requests where id = p_request_id and receiver_id = auth.uid();
  if v_req.id is null then
    return false;
  end if;

  update public.friend_requests
  set status = 'accepted', updated_at = now()
  where id = p_request_id;

  if v_req.sender_id < v_req.receiver_id then
    v_u1 := v_req.sender_id;
    v_u2 := v_req.receiver_id;
  else
    v_u1 := v_req.receiver_id;
    v_u2 := v_req.sender_id;
  end if;

  insert into public.friendships(user_one, user_two)
  values (v_u1, v_u2)
  on conflict (user_one, user_two) do nothing;

  return true;
end;
$$;

grant execute on function public.accept_friend_request(uuid) to authenticated;

-- Realtime Publication for Social Hub
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friend_requests'
  ) then
    alter publication supabase_realtime add table public.friend_requests;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_conversations'
  ) then
    alter publication supabase_realtime add table public.group_conversations;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_messages'
  ) then
    alter publication supabase_realtime add table public.group_messages;
  end if;
end $$;

-- ==========================================================
-- 25. 3NF NORMALIZED ENTERPRISE TABLES & SECURITY HARDENING
-- ==========================================================

-- User Preferences (Multi-device settings)
create table if not exists public.user_preferences (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  master_volume float not null default 1.0,
  sfx_volume float not null default 0.8,
  sfx_enabled boolean not null default true,
  mic_device_id text,
  camera_device_id text,
  speaker_device_id text,
  noise_cancellation_enabled boolean not null default true,
  notifications_enabled boolean not null default true,
  keybindings jsonb not null default '{}'::jsonb,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);
alter table public.user_preferences enable row level security;

-- User Sessions & Audit
create table if not exists public.user_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  device_type text not null default 'desktop',
  user_agent text,
  ip_address inet,
  last_active_at timestamptz default timezone('utc'::text, now()) not null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);
alter table public.user_sessions enable row level security;
create index if not exists idx_user_sessions_user_active on public.user_sessions(user_id, last_active_at desc);

-- Avatar Catalog Items & User Inventory
create table if not exists public.avatar_catalog_items (
  id uuid default gen_random_uuid() primary key,
  item_type text not null check (item_type in ('hair', 'accessory', 'skin', 'shirt', 'outfit', 'pet')),
  item_key text unique not null,
  display_name text not null,
  asset_svg text,
  rarity text not null default 'common' check (rarity in ('common', 'rare', 'epic', 'legendary')),
  required_tier text not null default 'free' check (required_tier in ('free', 'pro', 'studio')),
  is_active boolean not null default true,
  created_at timestamptz default timezone('utc'::text, now()) not null
);
alter table public.avatar_catalog_items enable row level security;

create table if not exists public.user_avatar_inventory (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  item_id uuid references public.avatar_catalog_items(id) on delete cascade not null,
  is_equipped boolean not null default false,
  acquired_at timestamptz default timezone('utc'::text, now()) not null,
  unique(user_id, item_id)
);
alter table public.user_avatar_inventory enable row level security;
create index if not exists idx_user_avatar_inv_user on public.user_avatar_inventory(user_id);
create index if not exists idx_user_avatar_inv_item on public.user_avatar_inventory(item_id);

-- Space Settings & Roles (RBAC)
create table if not exists public.space_settings (
  space_id uuid references public.spaces(id) on delete cascade primary key,
  default_spawn_x double precision not null default 600.0,
  default_spawn_y double precision not null default 400.0,
  allow_guest_chat boolean not null default true,
  allow_screen_share boolean not null default true,
  max_audio_bitrate int not null default 64000,
  background_music_volume double precision not null default 0.5,
  welcome_message text,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);
alter table public.space_settings enable row level security;

create table if not exists public.space_roles (
  id uuid default gen_random_uuid() primary key,
  space_id uuid references public.spaces(id) on delete cascade not null,
  name text not null,
  color text not null default '#3b82f6',
  priority int not null default 0,
  is_default boolean not null default false,
  permissions jsonb not null default '{
    "can_invite": true,
    "can_kick": false,
    "can_ban": false,
    "can_manage_rooms": false,
    "can_broadcast_stage": false,
    "can_edit_world": false,
    "can_play_music": true
  }'::jsonb,
  created_at timestamptz default timezone('utc'::text, now()) not null
);
alter table public.space_roles enable row level security;
create index if not exists idx_space_roles_space_priority on public.space_roles(space_id, priority desc);

alter table public.space_members add column if not exists role_id uuid references public.space_roles(id) on delete set null;
create index if not exists idx_space_members_role_id on public.space_members(role_id);

-- Moderation: Bans, Mutes, Audit Logs & User Reports
create table if not exists public.space_bans (
  id uuid default gen_random_uuid() primary key,
  space_id uuid references public.spaces(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  banned_by uuid references public.profiles(id) on delete set null,
  reason text,
  expires_at timestamptz,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  unique(space_id, user_id)
);
alter table public.space_bans enable row level security;
create index if not exists idx_space_bans_lookup on public.space_bans(space_id, user_id);
create index if not exists idx_space_bans_banned_by on public.space_bans(banned_by);
create index if not exists idx_space_bans_user on public.space_bans(user_id);

create table if not exists public.space_mutes (
  id uuid default gen_random_uuid() primary key,
  space_id uuid references public.spaces(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  muted_by uuid references public.profiles(id) on delete set null,
  mute_type text not null default 'all' check (mute_type in ('all', 'voice', 'chat')),
  reason text,
  expires_at timestamptz,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  unique(space_id, user_id, mute_type)
);
alter table public.space_mutes enable row level security;
create index if not exists idx_space_mutes_lookup on public.space_mutes(space_id, user_id);
create index if not exists idx_space_mutes_muted_by on public.space_mutes(muted_by);
create index if not exists idx_space_mutes_user on public.space_mutes(user_id);

create table if not exists public.space_audit_logs (
  id uuid default gen_random_uuid() primary key,
  space_id uuid references public.spaces(id) on delete cascade not null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz default timezone('utc'::text, now()) not null
);
alter table public.space_audit_logs enable row level security;
create index if not exists idx_space_audit_space_created on public.space_audit_logs(space_id, created_at desc);
create index if not exists idx_space_audit_actor on public.space_audit_logs(actor_id);

create table if not exists public.user_reports (
  id uuid default gen_random_uuid() primary key,
  reporter_id uuid references public.profiles(id) on delete set null not null,
  reported_user_id uuid references public.profiles(id) on delete cascade not null,
  space_id uuid references public.spaces(id) on delete set null,
  room_id text,
  reason text not null,
  details text,
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'resolved', 'dismissed')),
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);
alter table public.user_reports enable row level security;
create index if not exists idx_user_reports_reported on public.user_reports(reported_user_id);
create index if not exists idx_user_reports_reporter on public.user_reports(reporter_id);
create index if not exists idx_user_reports_status on public.user_reports(status);
create index if not exists idx_user_reports_resolved_by on public.user_reports(resolved_by);
create index if not exists idx_user_reports_space_id on public.user_reports(space_id);

-- Chat Attachments, Mentions & DM Attachments
create table if not exists public.message_attachments (
  id uuid default gen_random_uuid() primary key,
  message_id uuid references public.messages(id) on delete cascade not null,
  file_name text not null,
  file_url text not null,
  file_size_bytes bigint not null default 0,
  mime_type text not null default 'application/octet-stream',
  width int,
  height int,
  created_at timestamptz default timezone('utc'::text, now()) not null
);
alter table public.message_attachments enable row level security;
create index if not exists idx_message_attachments_msg on public.message_attachments(message_id);

create table if not exists public.message_mentions (
  id uuid default gen_random_uuid() primary key,
  message_id uuid references public.messages(id) on delete cascade not null,
  mentioned_user_id uuid references public.profiles(id) on delete cascade not null,
  is_read boolean not null default false,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  unique(message_id, mentioned_user_id)
);
alter table public.message_mentions enable row level security;
create index if not exists idx_message_mentions_user_unread on public.message_mentions(mentioned_user_id, is_read);
create index if not exists idx_message_mentions_msg on public.message_mentions(message_id);

create table if not exists public.direct_message_attachments (
  id uuid default gen_random_uuid() primary key,
  direct_message_id uuid references public.direct_messages(id) on delete cascade not null,
  file_name text not null,
  file_url text not null,
  file_size_bytes bigint not null default 0,
  mime_type text not null default 'application/octet-stream',
  created_at timestamptz default timezone('utc'::text, now()) not null
);
alter table public.direct_message_attachments enable row level security;
create index if not exists idx_dm_attachments_msg on public.direct_message_attachments(direct_message_id);

-- User Blocks
create table if not exists public.user_blocks (
  id uuid default gen_random_uuid() primary key,
  blocker_id uuid references public.profiles(id) on delete cascade not null,
  blocked_user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  check (blocker_id <> blocked_user_id),
  unique(blocker_id, blocked_user_id)
);
alter table public.user_blocks enable row level security;
create index if not exists idx_user_blocks_blocker on public.user_blocks(blocker_id);
create index if not exists idx_user_blocks_blocked on public.user_blocks(blocked_user_id);

-- Call Sessions & Participants (LiveKit Integration)
create table if not exists public.call_sessions (
  id uuid default gen_random_uuid() primary key,
  room_name text unique not null,
  call_type text not null default 'dm' check (call_type in ('dm', 'group', 'space_room')),
  space_id uuid references public.spaces(id) on delete cascade,
  conversation_id uuid,
  started_by uuid references public.profiles(id) on delete set null not null,
  is_video boolean not null default false,
  status text not null default 'calling' check (status in ('calling', 'active', 'ended')),
  started_at timestamptz default timezone('utc'::text, now()) not null,
  ended_at timestamptz,
  duration_seconds int not null default 0
);
alter table public.call_sessions enable row level security;
create index if not exists idx_call_sessions_space on public.call_sessions(space_id);
create index if not exists idx_call_sessions_started_by on public.call_sessions(started_by);
create index if not exists idx_call_sessions_status on public.call_sessions(status);

create table if not exists public.call_participants (
  id uuid default gen_random_uuid() primary key,
  call_session_id uuid references public.call_sessions(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  joined_at timestamptz default timezone('utc'::text, now()) not null,
  left_at timestamptz,
  duration_seconds int not null default 0,
  end_reason text default 'hung_up',
  unique(call_session_id, user_id)
);
alter table public.call_participants enable row level security;
create index if not exists idx_call_participants_session on public.call_participants(call_session_id);
create index if not exists idx_call_participants_user on public.call_participants(user_id);

-- Space Tilemaps & Whiteboards
create table if not exists public.space_tilemaps (
  id uuid default gen_random_uuid() primary key,
  space_id uuid references public.spaces(id) on delete cascade unique not null,
  map_width int not null default 40,
  map_height int not null default 30,
  tile_size int not null default 32,
  layers jsonb not null default '[]'::jsonb,
  collision_matrix jsonb not null default '[]'::jsonb,
  version int not null default 1,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);
alter table public.space_tilemaps enable row level security;
create index if not exists idx_space_tilemaps_space on public.space_tilemaps(space_id);

create table if not exists public.whiteboard_sessions (
  id uuid default gen_random_uuid() primary key,
  world_object_id uuid references public.world_objects(id) on delete cascade unique not null,
  space_id uuid references public.spaces(id) on delete cascade not null,
  board_data jsonb not null default '{"elements": []}'::jsonb,
  version int not null default 1,
  last_edited_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);
alter table public.whiteboard_sessions enable row level security;
create index if not exists idx_whiteboard_space on public.whiteboard_sessions(space_id);
create index if not exists idx_whiteboard_editor on public.whiteboard_sessions(last_edited_by);

-- Playlist Tracks
create table if not exists public.playlist_tracks (
  id uuid default gen_random_uuid() primary key,
  playlist_id uuid references public.space_playlists(id) on delete cascade not null,
  title text not null,
  artist text default 'Custom Upload',
  audio_url text not null,
  duration_seconds int default 0,
  order_index int default 0,
  is_active boolean default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);
alter table public.playlist_tracks enable row level security;
create index if not exists idx_playlist_tracks_playlist on public.playlist_tracks(playlist_id, order_index);
create index if not exists idx_playlist_tracks_created_by on public.playlist_tracks(created_by);

-- Billing Invoices
create table if not exists public.billing_invoices (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  stripe_invoice_id text unique,
  amount_cents int not null default 0,
  currency text not null default 'usd',
  status text not null default 'paid' check (status in ('paid', 'open', 'void', 'uncollectible')),
  invoice_pdf text,
  paid_at timestamptz,
  created_at timestamptz default timezone('utc'::text, now()) not null
);
alter table public.billing_invoices enable row level security;
create index if not exists idx_billing_invoices_user on public.billing_invoices(user_id);
create index if not exists idx_billing_invoices_stripe on public.billing_invoices(stripe_invoice_id);

-- Covering Indexes for Foreign Keys
create index if not exists idx_messages_sender_id on public.messages(sender_id);
create index if not exists idx_messages_reply_to_id on public.messages(reply_to_id);
create index if not exists idx_direct_messages_sender_id on public.direct_messages(sender_id);
create index if not exists idx_message_reactions_user_id on public.message_reactions(user_id);
create index if not exists idx_companion_messages_user_id on public.companion_messages(user_id);
create index if not exists idx_space_invites_created_by on public.space_invites(created_by);
create index if not exists idx_space_invites_space_id on public.space_invites(space_id);
create index if not exists idx_spaces_owner_id on public.spaces(owner_id);
create index if not exists idx_world_objects_placed_by on public.world_objects(placed_by);
create index if not exists idx_space_playlists_created_by on public.space_playlists(created_by);
create index if not exists idx_space_playlists_space_id on public.space_playlists(space_id);
create index if not exists idx_worlds_created_by on public.worlds(created_by);





-- ==========================================================
-- SECURITY HARDENING (2026-10-31)
-- 1. Billing columns on profiles can only be changed server-side.
-- 2. profiles.is_paid is derived from user_subscriptions (Stripe webhook).
-- 3. cleanup_guest_user is no longer callable by clients.
-- Idempotent: safe to re-run.
-- ==========================================================

-- 1. Guard billing columns against client writes.
-- Client requests run as 'anon' / 'authenticated'; triggers and SECURITY DEFINER
-- functions run as the owner, and the webhook runs as 'service_role'.
create or replace function public.guard_profile_billing_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_paid := false;
    new.tier := 'free';
    new.has_ai_companion := false;
  else
    new.is_paid := old.is_paid;
    new.tier := old.tier;
    new.has_ai_companion := old.has_ai_companion;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_billing_columns on public.profiles;
create trigger guard_profile_billing_columns
  before insert or update on public.profiles
  for each row execute function public.guard_profile_billing_columns();

-- 2. Keep profiles.is_paid in sync with the Stripe-managed subscription row.
create or replace function public.sync_profile_paid_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active boolean;
begin
  if tg_op = 'DELETE' then
    update public.profiles set is_paid = false, tier = 'free' where id = old.user_id;
    return old;
  end if;

  v_active := new.status in ('active', 'trialing');
  update public.profiles
  set is_paid = v_active,
      tier = case when v_active then 'paid' else 'free' end
  where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists sync_profile_paid_status on public.user_subscriptions;
create trigger sync_profile_paid_status
  after insert or update of status or delete on public.user_subscriptions
  for each row execute function public.sync_profile_paid_status();

-- Backfill: reset any self-granted paid flags to match real subscriptions.
update public.profiles p
set is_paid = exists (
      select 1 from public.user_subscriptions s
      where s.user_id = p.id and s.status in ('active', 'trialing')
    ),
    tier = case when exists (
      select 1 from public.user_subscriptions s
      where s.user_id = p.id and s.status in ('active', 'trialing')
    ) then 'paid' else 'free' end;

-- 3. Clients must not delete arbitrary guest accounts by id.
-- Guests remove themselves via delete_guest_account(); server code uses service_role.
revoke execute on function public.cleanup_guest_user(uuid) from public, anon, authenticated;

-- 4. Group membership: only the group's creator or an existing member may add rows.
-- (created_by covers the creator's initial batch insert, where is_member_of_group
-- cannot yet see the rows being inserted.)
drop policy if exists "Users can add group members or join" on public.group_conversation_members;
create policy "Users can add group members or join" on public.group_conversation_members
  for insert with check (
    public.is_member_of_group(conversation_id)
    or exists (
      select 1 from public.group_conversations g
      where g.id = conversation_id and g.created_by = auth.uid()
    )
  );

-- 5. Space membership: direct joins only for public spaces or the owner.
-- Private/unlisted spaces are joined through join_space_via_invite (SECURITY DEFINER).
drop policy if exists "Users can join public spaces or with invites" on public.space_members;
create policy "Users can join public spaces or with invites" on public.space_members
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.spaces s
      where s.id = space_id and (s.visibility = 'public' or s.owner_id = auth.uid())
    )
  );

-- Playlists no longer leak space ids of spaces the viewer cannot see.
drop policy if exists "Playlists are viewable by everyone" on public.space_playlists;
create policy "Playlists are viewable by everyone" on public.space_playlists
  for select using (exists (select 1 from public.spaces s where s.id = space_id));

-- 6. Space tier/capacity can only be raised server-side.
create or replace function public.guard_space_billing_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.tier := 'free';
    new.max_capacity := least(coalesce(new.max_capacity, 15), 50);
  else
    new.tier := old.tier;
    new.max_capacity := old.max_capacity;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_space_billing_columns on public.spaces;
create trigger guard_space_billing_columns
  before insert or update on public.spaces
  for each row execute function public.guard_space_billing_columns();

-- ==========================================================
-- CRITICAL ACCESS FIXES (2026-11-02)
-- 1. Invite codes are no longer readable by everyone; lookups go through
--    resolve_space_invite (SECURITY DEFINER), which only returns the space.
-- 2. Companion memory RPCs only return memories of the caller's own companion,
--    and memories can only be written to a companion the caller owns.
-- 3. Friendships can only exist on top of an accepted friend request, and only
--    the receiver can change a request's status.
-- 4. Guest provisioning is throttled per client IP and globally, and its inputs
--    are bounded.
-- 5. The legacy 3-arg guest provisioner (unthrottled) is removed.
-- 6. accept_friend_request exists so accepting creates the friendship.
-- Idempotent: safe to re-run.
-- ==========================================================

-- 1. Space invites: only the space's members / owner can list its codes.
drop policy if exists "Anyone can inspect valid invite code" on public.space_invites;
drop policy if exists "Members can view space invites" on public.space_invites;
create policy "Members can view space invites" on public.space_invites
  for select using (
    public.is_member_of_space(space_id)
    or exists (select 1 from public.spaces s where s.id = space_id and s.owner_id = auth.uid())
  );

-- 2. Companion memories: scope the SECURITY DEFINER RPCs to the caller.
create or replace function public.match_companion_memories(
  p_companion_id uuid,
  p_query_embedding vector(768),
  p_match_count int default 6,
  p_min_similarity float default 0.65
)
returns table (
  id uuid,
  memory_key text,
  memory_value text,
  category text,
  importance_score float,
  similarity float,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cm.id,
    cm.memory_key,
    cm.memory_value,
    cm.category,
    cm.importance_score,
    1 - (cm.embedding <=> p_query_embedding) as similarity,
    cm.created_at
  from public.companion_memories cm
  join public.ai_companions c on c.id = cm.companion_id
  where
    cm.companion_id = p_companion_id
    and c.user_id = auth.uid()
    and cm.embedding is not null
    and 1 - (cm.embedding <=> p_query_embedding) >= p_min_similarity
  order by cm.embedding <=> p_query_embedding
  limit least(greatest(p_match_count, 0), 50);
$$;

create or replace function public.get_recent_companion_memories(
  p_companion_id uuid,
  p_limit int default 10
)
returns table (
  id uuid,
  memory_key text,
  memory_value text,
  category text,
  importance_score float,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cm.id,
    cm.memory_key,
    cm.memory_value,
    cm.category,
    cm.importance_score,
    cm.created_at
  from public.companion_memories cm
  join public.ai_companions c on c.id = cm.companion_id
  where cm.companion_id = p_companion_id
    and c.user_id = auth.uid()
  order by cm.importance_score desc, cm.created_at desc
  limit least(greatest(p_limit, 0), 50);
$$;

revoke execute on function public.match_companion_memories(uuid, vector, int, float) from public, anon;
revoke execute on function public.get_recent_companion_memories(uuid, int) from public, anon;
grant execute on function public.match_companion_memories(uuid, vector, int, float) to authenticated;
grant execute on function public.get_recent_companion_memories(uuid, int) to authenticated;

drop policy if exists "Users can insert their companion memories" on public.companion_memories;
create policy "Users can insert their companion memories" on public.companion_memories
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.ai_companions c
      where c.id = companion_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update their companion memories" on public.companion_memories;
create policy "Users can update their companion memories" on public.companion_memories
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.ai_companions c
      where c.id = companion_id and c.user_id = auth.uid()
    )
  );

-- 3. Friendships require an accepted request (accept_friend_request inserts them
--    as SECURITY DEFINER, so this only blocks direct client inserts).
drop policy if exists "Users can insert friendships" on public.friendships;
create policy "Users can insert friendships" on public.friendships
  for insert with check (
    auth.uid() in (user_one, user_two)
    and exists (
      select 1 from public.friend_requests fr
      where fr.status = 'accepted'
        and (
          (fr.sender_id = user_one and fr.receiver_id = user_two)
          or (fr.sender_id = user_two and fr.receiver_id = user_one)
        )
    )
  );

-- Only the receiver answers a request; senders withdraw by deleting it.
drop policy if exists "Receivers or senders can update request status" on public.friend_requests;
drop policy if exists "Receivers can update request status" on public.friend_requests;
create policy "Receivers can update request status" on public.friend_requests
  for update using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);

-- Requests are always created as pending.
drop policy if exists "Users can send friend requests" on public.friend_requests;
create policy "Users can send friend requests" on public.friend_requests
  for insert with check (auth.uid() = sender_id and status = 'pending');

-- 4. Guest provisioning throttle.
-- RLS on with no policies: only SECURITY DEFINER functions can touch it.
create table if not exists public.guest_provision_log (
  id bigint generated always as identity primary key,
  client_ip text not null,
  created_at timestamptz not null default now()
);
alter table public.guest_provision_log enable row level security;
create index if not exists idx_guest_provision_log_ip_created
  on public.guest_provision_log (client_ip, created_at desc);
create index if not exists idx_guest_provision_log_created
  on public.guest_provision_log (created_at desc);

create or replace function public.provision_guest_account(
  p_display_name text,
  p_password text,
  p_avatar_config jsonb default '{}'::jsonb,
  p_gender text default 'male',
  p_username text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid := gen_random_uuid();
  v_headers json;
  v_ip text;
  v_base text;
  v_username text;
  v_display_name text;
  v_email text;
  v_encrypted_pw text;
  v_gender text;
  v_attempt int := 0;
begin
  -- Client IP as seen by the API gateway (Cloudflare sets cf-connecting-ip).
  v_headers := nullif(current_setting('request.headers', true), '')::json;
  v_ip := coalesce(
    nullif(v_headers->>'cf-connecting-ip', ''),
    nullif(v_headers->>'x-real-ip', ''),
    nullif(btrim(split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1)), ''),
    'unknown'
  );

  -- Serialize throttle checks per IP so concurrent calls cannot overshoot.
  perform pg_advisory_xact_lock(hashtext('guest_provision:' || v_ip));

  if (select count(*) from public.guest_provision_log
      where client_ip = v_ip and created_at > now() - interval '15 minutes') >= 10 then
    raise exception 'Too many guest sessions from this network. Please try again later.'
      using errcode = 'P0429';
  end if;

  if (select count(*) from public.guest_provision_log
      where created_at > now() - interval '1 minute') >= 300 then
    raise exception 'Guest sign-ups are temporarily busy. Please try again shortly.'
      using errcode = 'P0429';
  end if;

  delete from public.guest_provision_log where created_at < now() - interval '1 day';
  insert into public.guest_provision_log (client_ip) values (v_ip);

  if p_password is null or length(p_password) < 12 or length(p_password) > 128 then
    raise exception 'Invalid guest credentials' using errcode = '22023';
  end if;

  v_gender := lower(coalesce(nullif(p_gender, ''), 'male'));
  if v_gender not in ('male', 'female') then
    v_gender := 'male';
  end if;

  v_display_name := left(coalesce(nullif(btrim(p_display_name), ''), 'Explorer'), 32);

  if p_avatar_config is null or jsonb_typeof(p_avatar_config) <> 'object'
     or length(p_avatar_config::text) > 4096 then
    p_avatar_config := '{}'::jsonb;
  end if;

  v_base := left(lower(regexp_replace(coalesce(p_username, ''), '[^a-zA-Z0-9_]', '', 'g')), 24);
  if length(v_base) < 3 then
    v_base := 'guest_' || floor(random() * 9000 + 1000)::int;
  end if;

  -- Pick a free username, retrying with fresh discriminators on collision.
  v_username := v_base;
  while exists (select 1 from public.profiles where username = v_username)
     or exists (select 1 from auth.users where email = v_username || '@guest.teemchat.local') loop
    v_attempt := v_attempt + 1;
    if v_attempt > 8 then
      v_username := 'guest_' || replace(gen_random_uuid()::text, '-', '');
      exit;
    end if;
    v_username := v_base || '_' || floor(random() * 90000 + 10000)::int;
  end loop;

  v_email := v_username || '@guest.teemchat.local';
  v_encrypted_pw := crypt(p_password, gen_salt('bf'));

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    phone, phone_change, phone_change_token, email_change_token_current,
    reauthentication_token, raw_app_meta_data, raw_user_meta_data, is_anonymous,
    created_at, updated_at
  ) values (
    v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email, v_encrypted_pw, now(),
    '', '', '', '',
    null, '', '', '',
    '',
    jsonb_build_object('provider', 'email', 'providers', array['email'], 'is_guest', true),
    jsonb_build_object('display_name', v_display_name, 'username', v_username, 'is_guest', true, 'gender', v_gender),
    false,
    now(), now()
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email',
    v_user_id::text,
    now(), now(), now()
  );

  insert into public.profiles (
    id, username, display_name, gender, avatar_config, is_paid, tier, has_ai_companion, created_at, updated_at
  ) values (
    v_user_id, v_username, v_display_name, v_gender, p_avatar_config, false, 'free', false, now(), now()
  )
  on conflict (id) do update set
    username = excluded.username,
    display_name = excluded.display_name,
    avatar_config = excluded.avatar_config,
    gender = excluded.gender;

  return jsonb_build_object(
    'user_id', v_user_id,
    'email', v_email,
    'username', v_username,
    'display_name', v_display_name,
    'gender', v_gender
  );
end;
$$;

grant execute on function public.provision_guest_account(text, text, jsonb, text, text) to anon, authenticated;

-- 5. Remove the legacy 3-argument guest provisioner: it is still anon-callable on
--    older databases and would bypass the throttle above. The app uses the 5-arg form.
drop function if exists public.provision_guest_account(text, text, jsonb);
drop function if exists public.provision_guest_account(text, text, jsonb, text);

-- 6. Accepting a request creates the friendship server-side (friendships cannot be
--    inserted directly by clients). Only the receiver of a pending request can accept.
create or replace function public.accept_friend_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.friend_requests;
begin
  select * into v_req from public.friend_requests
  where id = p_request_id and receiver_id = auth.uid() and status in ('pending', 'accepted')
  for update;
  if v_req.id is null then
    return false;
  end if;

  update public.friend_requests
  set status = 'accepted', updated_at = now()
  where id = p_request_id;

  insert into public.friendships(user_one, user_two)
  values (least(v_req.sender_id, v_req.receiver_id), greatest(v_req.sender_id, v_req.receiver_id))
  on conflict (user_one, user_two) do nothing;

  return true;
end;
$$;

revoke execute on function public.accept_friend_request(uuid) from public, anon;
grant execute on function public.accept_friend_request(uuid) to authenticated;

-- ==========================================================
-- FRIENDSHIP BACKFILL & TRIGGER FUNCTION GRANTS (2026-11-02)
-- 1. Requests accepted while accept_friend_request was missing never got a
--    friendships row; create the missing ones.
-- 2. Trigger functions are not meant to be called over the API. EXECUTE is only
--    checked when a trigger is created, not when it fires, so revoking it is safe.
-- Idempotent: safe to re-run. Inserts only; nothing is deleted.
-- ==========================================================

-- 1. Backfill friendships for accepted requests.
insert into public.friendships (user_one, user_two)
select distinct least(fr.sender_id, fr.receiver_id), greatest(fr.sender_id, fr.receiver_id)
from public.friend_requests fr
where fr.status = 'accepted'
on conflict (user_one, user_two) do nothing;

-- 2. Trigger / event-trigger functions: no direct API access.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.handle_new_user()',
    'public.sync_profile_paid_status()',
    'public.sync_space_member_count()',
    'public.rls_auto_enable()'
  ] loop
    if to_regprocedure(fn) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', fn);
    end if;
  end loop;
end;
$$;

-- ==========================================================
-- GUEST ACCOUNT DELETION (2026-11-03)
-- 1. delete_guest_account() failed for any guest who had sent a chat message:
--    messages.sender_id (and user_reports.reporter_id, call_sessions.started_by)
--    are NOT NULL but ON DELETE SET NULL, so deleting the auth.users row raised
--    23502 and the guest (plus its friendships) stayed behind. purge_guest_user()
--    removes those rows and guest-owned spaces first, then deletes the auth user;
--    profiles, friendships, friend_requests, space_members etc. cascade.
-- 2. delete_guest_account() only deletes the caller, and only when the caller's
--    server-controlled app metadata marks it as a guest.
-- 3. cleanup_stale_guest_accounts() removes guests with no session activity for
--    a day. It is service_role-only and also runs (bounded, best effort) each
--    time a new guest is provisioned, since pg_cron is not installed.
-- Idempotent: safe to re-run. Applying it deletes nothing by itself; the stale
-- cleanup first runs on the next guest provisioning.
-- ==========================================================

-- 1. Internal purge helper: not callable over the API.
create or replace function public.purge_guest_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_is_guest boolean;
begin
  if p_user_id is null then
    return false;
  end if;

  select coalesce((raw_app_meta_data->>'is_guest')::boolean, is_anonymous, false)
  into v_is_guest
  from auth.users
  where id = p_user_id;

  if v_is_guest is not true then
    return false;
  end if;

  -- Rows whose NOT NULL foreign key would otherwise block the delete.
  delete from public.messages where sender_id = p_user_id;
  delete from public.user_reports where reporter_id = p_user_id;
  delete from public.call_sessions where started_by = p_user_id;
  -- Guest spaces are temporary; don't leave them ownerless.
  delete from public.spaces where owner_id = p_user_id;

  delete from auth.users where id = p_user_id;
  return true;
end;
$$;

revoke execute on function public.purge_guest_user(uuid) from public, anon, authenticated;

-- 2. Self-service deletion on guest sign-out.
create or replace function public.delete_guest_account()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  return public.purge_guest_user(auth.uid());
end;
$$;

revoke execute on function public.delete_guest_account() from public, anon;
grant execute on function public.delete_guest_account() to authenticated;

-- 3. Abandoned guests: no session created or refreshed within p_max_idle.
create or replace function public.cleanup_stale_guest_accounts(
  p_max_idle interval default interval '24 hours',
  p_limit int default 50
)
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
  v_count int := 0;
begin
  for v_id in
    select u.id
    from auth.users u
    where coalesce((u.raw_app_meta_data->>'is_guest')::boolean, u.is_anonymous, false)
      and greatest(
            u.created_at,
            coalesce(u.last_sign_in_at, u.created_at),
            coalesce((
              select max(coalesce(s.refreshed_at, s.updated_at, s.created_at))
              from auth.sessions s
              where s.user_id = u.id
            ), u.created_at)
          ) < now() - p_max_idle
    order by u.created_at
    limit greatest(p_limit, 0)
  loop
    if public.purge_guest_user(v_id) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.cleanup_stale_guest_accounts(interval, int) from public, anon, authenticated;
grant execute on function public.cleanup_stale_guest_accounts(interval, int) to service_role;

-- Run a small cleanup batch whenever a guest is provisioned. Failures must
-- never block provisioning.
create or replace function public.cleanup_stale_guests_on_provision()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  begin
    perform public.cleanup_stale_guest_accounts(interval '24 hours', 20);
  exception when others then
    raise warning 'cleanup_stale_guest_accounts failed: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke execute on function public.cleanup_stale_guests_on_provision() from public, anon, authenticated;

drop trigger if exists trg_cleanup_stale_guests on public.guest_provision_log;
create trigger trg_cleanup_stale_guests
  after insert on public.guest_provision_log
  for each statement execute function public.cleanup_stale_guests_on_provision();

-- 4. cleanup_guest_user(uuid) keeps its signature for server code, but now
--    shares the purge path so it no longer fails on chat history.
create or replace function public.cleanup_guest_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return public.purge_guest_user(p_user_id);
end;
$$;

revoke execute on function public.cleanup_guest_user(uuid) from public, anon, authenticated;

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

-- ==========================================================
-- SPACE MEMBER ROLE GUARD (2026-11-07)
-- Security fix: the space_members INSERT policy never constrained `role`, so any
-- authenticated user (guests included) could join a public space with
-- role = 'owner' / 'admin' and pass is_admin_of_space() — kicking members,
-- deleting chat, editing rooms/world objects, banning, etc.
--
--   1. INSERT policy: public-space joins must be role 'member'; the space owner
--      may add themself as 'member' or 'owner'.
--   2. BEFORE INSERT/UPDATE trigger (defense in depth, mirrors
--      guard_space_billing_columns): for client roles, role is forced to
--      'owner' for the space owner and 'member' for everyone else, role_id is
--      cleared on insert, and role / role_id can never be changed by an update.
--      SECURITY DEFINER code (e.g. join_space_via_invite) is unaffected.
--   3. CHECK constraint on allowed role values (NOT VALID: enforced for new and
--      updated rows, existing rows are left untouched).
--
-- Idempotent and non-destructive: safe to re-run. No existing rows are changed.
--
-- Follow-up audit (read-only) for roles that may already have been self-granted:
--   select m.space_id, m.user_id, m.role, s.owner_id
--   from public.space_members m join public.spaces s on s.id = m.space_id
--   where m.role in ('owner', 'admin') and m.user_id <> s.owner_id;
-- ==========================================================

-- 1. Tighten the INSERT policy.
drop policy if exists "Users can join public spaces or with invites" on public.space_members;
create policy "Users can join public spaces or with invites" on public.space_members
  for insert with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.spaces s
      where s.id = space_id
        and (
          (s.visibility = 'public' and role = 'member')
          or (s.owner_id = (select auth.uid()) and role in ('member', 'owner'))
        )
    )
  );

-- 2. Role guard trigger. Runs as the invoker (not SECURITY DEFINER) so that
-- current_user reflects the API role; the owner lookup therefore only succeeds
-- for spaces the caller can actually see as owner, which fails safe to 'member'.
create or replace function public.guard_space_member_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if exists (
      select 1 from public.spaces s
      where s.id = new.space_id and s.owner_id = auth.uid() and new.user_id = auth.uid()
    ) then
      new.role := case when new.role = 'member' then 'member' else 'owner' end;
    else
      new.role := 'member';
    end if;
    new.role_id := null;
  else
    new.role := old.role;
    new.role_id := old.role_id;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_space_member_role on public.space_members;
create trigger guard_space_member_role
  before insert or update on public.space_members
  for each row execute function public.guard_space_member_role();

-- 3. Allowed role values.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'space_members_role_check'
      and conrelid = 'public.space_members'::regclass
  ) then
    alter table public.space_members
      add constraint space_members_role_check
      check (role in ('owner', 'admin', 'moderator', 'member', 'guest')) not valid;
  end if;
end $$;

-- ==========================================================
-- 35. ADMIN DASHBOARD BACKEND & AUDIT TRAIL
-- ==========================================================
create or replace function public.guard_profile_system_role()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if (TG_OP = 'INSERT') then
    if new.system_role is not null and new.system_role <> 'user' then
      if auth.role() is distinct from 'service_role' and not public.is_system_admin(auth.uid()) then
        raise exception 'Unauthorized: Only system administrators can set elevated system_role';
      end if;
    end if;
  elsif (TG_OP = 'UPDATE') then
    if (old.system_role is distinct from new.system_role) then
      if auth.role() is distinct from 'service_role' and not public.is_system_admin(auth.uid()) then
        raise exception 'Unauthorized: Only system administrators can alter system_role';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_system_role_trg on public.profiles;
create trigger guard_profile_system_role_trg
  before insert or update on public.profiles
  for each row execute function public.guard_profile_system_role();

create or replace function public.is_system_admin(p_user_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id and system_role in ('admin', 'superadmin')
  );
$$;

create table if not exists public.admin_audit_logs (
  id uuid default gen_random_uuid() primary key,
  admin_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_table text,
  target_id text,
  changes_before jsonb default null,
  changes_after jsonb default null,
  ip_address text,
  user_agent text,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists idx_admin_audit_logs_created on public.admin_audit_logs(created_at desc);
create index if not exists idx_admin_audit_logs_admin on public.admin_audit_logs(admin_id);
create index if not exists idx_admin_audit_logs_action on public.admin_audit_logs(action);
create index if not exists idx_admin_audit_logs_target on public.admin_audit_logs(target_table, target_id);

alter table public.admin_audit_logs enable row level security;

drop policy if exists "Admins can view admin audit logs" on public.admin_audit_logs;
create policy "Admins can view admin audit logs" on public.admin_audit_logs
  for select using (
    auth.role() = 'service_role' or public.is_system_admin(auth.uid())
  );

drop policy if exists "Admins and service role can insert admin audit logs" on public.admin_audit_logs;
create policy "Admins and service role can insert admin audit logs" on public.admin_audit_logs
  for insert with check (
    auth.role() = 'service_role' or public.is_system_admin(auth.uid())
  );

create or replace function public.get_admin_overview_metrics()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_total_users int;
  v_new_users_24h int;
  v_active_subscriptions int;
  v_total_revenue_cents bigint;
  v_pending_reports int;
  v_active_spaces int;
  v_today_ai_messages int;
begin
  if auth.role() is distinct from 'service_role' and not public.is_system_admin(auth.uid()) then
    raise exception 'Unauthorized: Insufficient administrative privileges';
  end if;

  select count(*) into v_total_users from public.profiles;
  select count(*) into v_new_users_24h from public.profiles where created_at >= (now() - interval '24 hours');
  select count(*) into v_active_subscriptions from public.user_subscriptions where status = 'active';
  select coalesce(sum(amount_cents), 0) into v_total_revenue_cents from public.billing_invoices where status = 'paid';
  select count(*) into v_pending_reports from public.user_reports where status = 'pending';
  select count(*) into v_active_spaces from public.spaces where is_active = true;
  select coalesce(sum(message_count), 0) into v_today_ai_messages from public.ai_usage where usage_date = (timezone('utc', now()))::date;

  return jsonb_build_object(
    'totalUsers', v_total_users,
    'newUsers24h', v_new_users_24h,
    'activeSubscriptions', v_active_subscriptions,
    'totalRevenueCents', v_total_revenue_cents,
    'pendingReports', v_pending_reports,
    'activeSpaces', v_active_spaces,
    'todayAiMessages', v_today_ai_messages
  );
end;
$$;

revoke execute on function public.get_admin_overview_metrics() from public, anon;
grant execute on function public.get_admin_overview_metrics() to authenticated, service_role;

-- Covering indexes for high-scale admin queries
create index if not exists idx_profiles_created_at on public.profiles(created_at desc);
create index if not exists idx_user_subscriptions_status on public.user_subscriptions(status);
create index if not exists idx_billing_invoices_status_amount on public.billing_invoices(status, amount_cents);
create index if not exists idx_ai_usage_usage_date on public.ai_usage(usage_date);

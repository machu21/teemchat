-- ==========================================================
-- TEEMCHAT: PRODUCTION 3NF SCHEMA NORMALIZATION MIGRATION
-- Migration Version: 20261015_production_3nf_schema_normalization
-- Description:
-- 1. Full 3NF data normalization: user preferences, inventory, cosmetics,
--    space settings, RBAC roles, audit logs, moderation (bans/mutes/reports),
--    attachments, mentions, user blocks, call sessions (LiveKit), tilemaps,
--    whiteboard sessions, and billing invoices.
-- 2. Covering indexes for all 12 unindexed foreign keys (Supabase performance advisor).
-- 3. Optimization of 33+ RLS policies with scalar InitPlan caching (select auth.uid()).
-- 4. Elimination of duplicate permissive policies on rooms and world_objects.
-- 5. Hardening of SECURITY DEFINER functions with immutable search_path.
-- 6. Safe Realtime publication configuration for durable chat & call channels.
-- ==========================================================

-- Enable essential extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ==========================================================
-- SECTION 1: IDENTITY, PREFERENCES & AVATAR COSMETICS (3NF)
-- ==========================================================

-- 1. User Preferences (Normalized multi-device client settings)
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

drop policy if exists "Users can view their own preferences" on public.user_preferences;
create policy "Users can view their own preferences" on public.user_preferences
  for select using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own preferences" on public.user_preferences;
create policy "Users can insert their own preferences" on public.user_preferences
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own preferences" on public.user_preferences;
create policy "Users can update their own preferences" on public.user_preferences
  for update using ((select auth.uid()) = user_id);

-- 2. User Sessions & Device Audit Log
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

drop policy if exists "Users can view their own sessions" on public.user_sessions;
create policy "Users can view their own sessions" on public.user_sessions
  for select using ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own sessions" on public.user_sessions;
create policy "Users can delete their own sessions" on public.user_sessions
  for delete using ((select auth.uid()) = user_id);

-- 3. Avatar Catalog Items (Normalized cosmetics master registry)
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

drop policy if exists "Avatar catalog items viewable by everyone" on public.avatar_catalog_items;
create policy "Avatar catalog items viewable by everyone" on public.avatar_catalog_items
  for select using (true);

-- 4. User Avatar Inventory (Junction table of owned / equipped cosmetics)
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

drop policy if exists "Users can view equipped avatar items" on public.user_avatar_inventory;
create policy "Users can view equipped avatar items" on public.user_avatar_inventory
  for select using (is_equipped = true or (select auth.uid()) = user_id);

drop policy if exists "Users can manage their own inventory" on public.user_avatar_inventory;
create policy "Users can manage their own inventory" on public.user_avatar_inventory
  for all using ((select auth.uid()) = user_id);

-- ==========================================================
-- SECTION 2: SPACES, SETTINGS, RBAC & PERMISSIONS (3NF)
-- ==========================================================

-- 5. Space Settings (Normalized space-level configuration)
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

drop policy if exists "Space settings viewable by space members or public spaces" on public.space_settings;
create policy "Space settings viewable by space members or public spaces" on public.space_settings
  for select using (
    public.is_member_of_space(space_id)
    or exists (select 1 from public.spaces s where s.id = space_id and s.visibility in ('public', 'unlisted'))
  );

drop policy if exists "Space admins can update space settings" on public.space_settings;
create policy "Space admins can update space settings" on public.space_settings
  for update using (public.is_admin_of_space(space_id));

drop policy if exists "Space admins can insert space settings" on public.space_settings;
create policy "Space admins can insert space settings" on public.space_settings
  for insert with check (public.is_admin_of_space(space_id));

-- 6. Space Custom Roles (Granular RBAC)
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

-- Link space_members to space_roles
alter table public.space_members add column if not exists role_id uuid references public.space_roles(id) on delete set null;
create index if not exists idx_space_members_role_id on public.space_members(role_id);

drop policy if exists "Space roles viewable by space members" on public.space_roles;
create policy "Space roles viewable by space members" on public.space_roles
  for select using (
    public.is_member_of_space(space_id)
    or exists (select 1 from public.spaces s where s.id = space_id and s.visibility in ('public', 'unlisted'))
  );

drop policy if exists "Space admins can manage space roles" on public.space_roles;
create policy "Space admins can manage space roles" on public.space_roles
  for all using (public.is_admin_of_space(space_id));

-- ==========================================================
-- SECTION 3: MODERATION, SAFETY, BANS & AUDIT (3NF)
-- ==========================================================

-- 7. Space Bans
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

drop policy if exists "Space admins can view space bans" on public.space_bans;
create policy "Space admins can view space bans" on public.space_bans
  for select using (public.is_admin_of_space(space_id));

drop policy if exists "Space admins can create bans" on public.space_bans;
create policy "Space admins can create bans" on public.space_bans
  for insert with check (public.is_admin_of_space(space_id));

drop policy if exists "Space admins can remove bans" on public.space_bans;
create policy "Space admins can remove bans" on public.space_bans
  for delete using (public.is_admin_of_space(space_id));

-- 8. Space Mutes
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

drop policy if exists "Space admins and muted users can view mutes" on public.space_mutes;
create policy "Space admins and muted users can view mutes" on public.space_mutes
  for select using (
    user_id = (select auth.uid())
    or public.is_admin_of_space(space_id)
  );

drop policy if exists "Space admins can manage mutes" on public.space_mutes;
create policy "Space admins can manage mutes" on public.space_mutes
  for all using (public.is_admin_of_space(space_id));

-- 9. Space Audit Logs
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

drop policy if exists "Space admins can view audit logs" on public.space_audit_logs;
create policy "Space admins can view audit logs" on public.space_audit_logs
  for select using (public.is_admin_of_space(space_id));

drop policy if exists "Space admins can insert audit logs" on public.space_audit_logs;
create policy "Space admins can insert audit logs" on public.space_audit_logs
  for insert with check (public.is_admin_of_space(space_id));

-- 10. User Reports
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

drop policy if exists "Users can view their own filed reports" on public.user_reports;
create policy "Users can view their own filed reports" on public.user_reports
  for select using ((select auth.uid()) = reporter_id);

drop policy if exists "Users can file reports" on public.user_reports;
create policy "Users can file reports" on public.user_reports
  for insert with check ((select auth.uid()) = reporter_id);

-- ==========================================================
-- SECTION 4: CHAT ATTACHMENTS, MENTIONS & DM MEDIA (3NF)
-- ==========================================================

-- 11. Message Attachments (Normalized files/images for room chat)
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

drop policy if exists "Message attachments viewable by message readers" on public.message_attachments;
create policy "Message attachments viewable by message readers" on public.message_attachments
  for select using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and (
          public.is_member_of_space(m.space_id)
          or exists (select 1 from public.spaces s where s.id = m.space_id and s.visibility in ('public', 'unlisted'))
        )
    )
  );

drop policy if exists "Users can insert message attachments for their messages" on public.message_attachments;
create policy "Users can insert message attachments for their messages" on public.message_attachments
  for insert with check (
    exists (
      select 1 from public.messages m
      where m.id = message_id and m.sender_id = (select auth.uid())
    )
  );

-- 12. Message Mentions (Normalized @user mentions for unread notifications)
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

drop policy if exists "Mentioned users can view their mentions" on public.message_mentions;
create policy "Mentioned users can view their mentions" on public.message_mentions
  for select using ((select auth.uid()) = mentioned_user_id);

drop policy if exists "Mentioned users can update mention read status" on public.message_mentions;
create policy "Mentioned users can update mention read status" on public.message_mentions
  for update using ((select auth.uid()) = mentioned_user_id);

drop policy if exists "Message senders can insert mentions" on public.message_mentions;
create policy "Message senders can insert mentions" on public.message_mentions
  for insert with check (
    exists (
      select 1 from public.messages m
      where m.id = message_id and m.sender_id = (select auth.uid())
    )
  );

-- 13. Direct Message Attachments (Normalized media for 1-on-1 buddy chat)
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

drop policy if exists "DM participants can view attachments" on public.direct_message_attachments;
create policy "DM participants can view attachments" on public.direct_message_attachments
  for select using (
    exists (
      select 1 from public.direct_messages dm
      join public.buddy_conversations bc on bc.id = dm.conversation_id
      where dm.id = direct_message_id and (select auth.uid()) in (bc.user_one, bc.user_two)
    )
  );

drop policy if exists "DM sender can insert attachments" on public.direct_message_attachments;
create policy "DM sender can insert attachments" on public.direct_message_attachments
  for insert with check (
    exists (
      select 1 from public.direct_messages dm
      where dm.id = direct_message_id and dm.sender_id = (select auth.uid())
    )
  );

-- ==========================================================
-- SECTION 5: USER BLOCKS & PRIVACY (3NF)
-- ==========================================================

-- 14. User Blocks
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

drop policy if exists "Users can view their block list" on public.user_blocks;
create policy "Users can view their block list" on public.user_blocks
  for select using ((select auth.uid()) = blocker_id);

drop policy if exists "Users can block other users" on public.user_blocks;
create policy "Users can block other users" on public.user_blocks
  for insert with check ((select auth.uid()) = blocker_id);

drop policy if exists "Users can unblock users" on public.user_blocks;
create policy "Users can unblock users" on public.user_blocks
  for delete using ((select auth.uid()) = blocker_id);

-- ==========================================================
-- SECTION 6: SOCIAL HUB & SQUAD CONVERSATIONS (ENSURE COMPLETE)
-- ==========================================================

-- 15. Friendships
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
  for select using ((select auth.uid()) in (user_one, user_two));

drop policy if exists "Users can insert friendships" on public.friendships;
create policy "Users can insert friendships" on public.friendships
  for insert with check ((select auth.uid()) in (user_one, user_two));

drop policy if exists "Users can delete their friendships" on public.friendships;
create policy "Users can delete their friendships" on public.friendships
  for delete using ((select auth.uid()) in (user_one, user_two));

-- 16. Friend Requests
create table if not exists public.friend_requests (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  receiver_id uuid references public.profiles(id) on delete cascade not null,
  status text not null default 'pending',
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
  for select using ((select auth.uid()) in (sender_id, receiver_id));

drop policy if exists "Users can send friend requests" on public.friend_requests;
create policy "Users can send friend requests" on public.friend_requests
  for insert with check ((select auth.uid()) = sender_id);

drop policy if exists "Receivers or senders can update request status" on public.friend_requests;
create policy "Receivers or senders can update request status" on public.friend_requests
  for update using ((select auth.uid()) in (sender_id, receiver_id));

drop policy if exists "Users can delete friend requests" on public.friend_requests;
create policy "Users can delete friend requests" on public.friend_requests
  for delete using ((select auth.uid()) in (sender_id, receiver_id));

-- 17. Group Conversations
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
create index if not exists idx_group_conv_created_by on public.group_conversations(created_by);

-- 18. Group Conversation Members
create table if not exists public.group_conversation_members (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.group_conversations(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null default 'member',
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
    where conversation_id = _conversation_id and user_id = (select auth.uid())
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
    (select auth.uid()) = user_id or public.is_member_of_group(conversation_id) or auth.role() = 'authenticated'
  );

drop policy if exists "Members can leave or owners can remove members" on public.group_conversation_members;
create policy "Members can leave or owners can remove members" on public.group_conversation_members
  for delete using ((select auth.uid()) = user_id or public.is_member_of_group(conversation_id));

-- 19. Group Messages
create table if not exists public.group_messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.group_conversations(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.group_messages enable row level security;
create index if not exists idx_group_messages_conv_created on public.group_messages(conversation_id, created_at desc);
create index if not exists idx_group_messages_sender on public.group_messages(sender_id);

drop policy if exists "Members can view group messages" on public.group_messages;
create policy "Members can view group messages" on public.group_messages
  for select using (public.is_member_of_group(conversation_id));

drop policy if exists "Members can insert group messages" on public.group_messages;
create policy "Members can insert group messages" on public.group_messages
  for insert with check (
    (select auth.uid()) = sender_id and public.is_member_of_group(conversation_id)
  );

-- ==========================================================
-- SECTION 7: VOICE & VIDEO CALL LOGS & SESSIONS (LiveKit) (3NF)
-- ==========================================================

-- 20. Call Sessions
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

drop policy if exists "Users can view relevant call sessions" on public.call_sessions;
create policy "Users can view relevant call sessions" on public.call_sessions
  for select using (
    started_by = (select auth.uid())
    or (space_id is not null and (
      public.is_member_of_space(space_id)
      or exists (select 1 from public.spaces s where s.id = space_id and s.visibility in ('public', 'unlisted'))
    ))
    or (conversation_id is not null and exists (
      select 1 from public.buddy_conversations bc where bc.id = conversation_id and (select auth.uid()) in (bc.user_one, bc.user_two)
    ))
    or (conversation_id is not null and public.is_member_of_group(conversation_id))
  );

drop policy if exists "Users can initiate call sessions" on public.call_sessions;
create policy "Users can initiate call sessions" on public.call_sessions
  for insert with check ((select auth.uid()) = started_by);

drop policy if exists "Call starter or participants can update call session" on public.call_sessions;
create policy "Call starter or participants can update call session" on public.call_sessions
  for update using (
    started_by = (select auth.uid())
    or exists (
      select 1 from public.call_participants cp where cp.call_session_id = id and cp.user_id = (select auth.uid())
    )
  );

-- 21. Call Participants
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

drop policy if exists "Users can view participants for visible calls" on public.call_participants;
create policy "Users can view participants for visible calls" on public.call_participants
  for select using (
    user_id = (select auth.uid())
    or exists (select 1 from public.call_sessions cs where cs.id = call_session_id)
  );

drop policy if exists "Users can join call as participant" on public.call_participants;
create policy "Users can join call as participant" on public.call_participants
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their participant status" on public.call_participants;
create policy "Users can update their participant status" on public.call_participants
  for update using ((select auth.uid()) = user_id);

-- ==========================================================
-- SECTION 8: 2D WORLD ENGINE PERSISTENCE (3NF)
-- ==========================================================

-- 22. Space Custom Tilemaps
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

drop policy if exists "Space viewers can view tilemaps" on public.space_tilemaps;
create policy "Space viewers can view tilemaps" on public.space_tilemaps
  for select using (
    public.is_member_of_space(space_id)
    or exists (select 1 from public.spaces s where s.id = space_id and s.visibility in ('public', 'unlisted'))
  );

drop policy if exists "Space admins can update tilemaps" on public.space_tilemaps;
create policy "Space admins can update tilemaps" on public.space_tilemaps
  for all using (public.is_admin_of_space(space_id));

-- 23. Interactive Whiteboard Sessions
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

drop policy if exists "Space members can view whiteboards" on public.whiteboard_sessions;
create policy "Space members can view whiteboards" on public.whiteboard_sessions
  for select using (
    public.is_member_of_space(space_id)
    or exists (select 1 from public.spaces s where s.id = space_id and s.visibility in ('public', 'unlisted'))
  );

drop policy if exists "Space members can edit whiteboards" on public.whiteboard_sessions;
create policy "Space members can edit whiteboards" on public.whiteboard_sessions
  for all using (
    public.is_member_of_space(space_id)
    or exists (select 1 from public.spaces s where s.id = space_id and s.visibility in ('public', 'unlisted'))
  );

-- ==========================================================
-- SECTION 9: SOUND TRIPPING & PLAYLIST TRACKS (3NF)
-- ==========================================================

-- 24. Playlist Tracks (Normalized tracks linked to playlists)
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

drop policy if exists "Playlist tracks viewable by everyone" on public.playlist_tracks;
create policy "Playlist tracks viewable by everyone" on public.playlist_tracks
  for select using (true);

drop policy if exists "Authenticated users can insert playlist tracks" on public.playlist_tracks;
create policy "Authenticated users can insert playlist tracks" on public.playlist_tracks
  for insert with check ((select auth.uid()) is not null);

drop policy if exists "Track creators or space owners can delete tracks" on public.playlist_tracks;
create policy "Track creators or space owners can delete tracks" on public.playlist_tracks
  for delete using (
    (select auth.uid()) = created_by
    or exists (
      select 1 from public.space_playlists sp
      join public.spaces s on s.id = sp.space_id
      where sp.id = playlist_id and s.owner_id = (select auth.uid())
    )
  );

-- ==========================================================
-- SECTION 10: BILLING, INVOICES & STRIPE (3NF)
-- ==========================================================

-- 25. User Subscriptions
create table if not exists public.user_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade unique not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_id text not null default 'ai_unlimited_monthly',
  status text not null default 'active',
  has_ai_unlimited boolean not null default true,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.user_subscriptions enable row level security;
create index if not exists idx_user_subscriptions_user_id on public.user_subscriptions(user_id);
create index if not exists idx_user_subscriptions_stripe_cust on public.user_subscriptions(stripe_customer_id);
create index if not exists idx_user_subscriptions_stripe_sub on public.user_subscriptions(stripe_subscription_id);

drop policy if exists "Users can view their own subscription" on public.user_subscriptions;
create policy "Users can view their own subscription" on public.user_subscriptions
  for select using ((select auth.uid()) = user_id);

drop policy if exists "Service role can manage all subscriptions" on public.user_subscriptions;
create policy "Service role can manage all subscriptions" on public.user_subscriptions
  for all using (auth.role() = 'service_role');

-- 26. Billing Invoices
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

drop policy if exists "Users can view their own billing invoices" on public.billing_invoices;
create policy "Users can view their own billing invoices" on public.billing_invoices
  for select using ((select auth.uid()) = user_id);

drop policy if exists "Service role can manage billing invoices" on public.billing_invoices;
create policy "Service role can manage billing invoices" on public.billing_invoices
  for all using (auth.role() = 'service_role');

-- ==========================================================
-- SECTION 11: PERFORMANCE FIXES: COVERING INDEXES ON 12 FOREIGN KEYS
-- ==========================================================
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
-- SECTION 12: RLS INITPLAN OPTIMIZATIONS (select auth.uid())
-- ==========================================================

-- Profiles
drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile" on public.profiles
  for insert with check ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
  for update using ((select auth.uid()) = id);

-- Spaces
drop policy if exists "Public spaces are viewable by everyone" on public.spaces;
create policy "Public spaces are viewable by everyone" on public.spaces
  for select using (
    visibility in ('public', 'unlisted')
    or owner_id = (select auth.uid())
    or public.is_member_of_space(id)
  );

drop policy if exists "Space owners can update their spaces" on public.spaces;
create policy "Space owners can update their spaces" on public.spaces
  for update using ((select auth.uid()) = owner_id);

drop policy if exists "Space owners can delete their spaces" on public.spaces;
create policy "Space owners can delete their spaces" on public.spaces
  for delete using ((select auth.uid()) = owner_id);

-- Space Members
drop policy if exists "Members can view space members" on public.space_members;
create policy "Members can view space members" on public.space_members
  for select using (
    user_id = (select auth.uid())
    or public.is_member_of_space(space_id)
    or exists (select 1 from public.spaces s where s.id = space_id and s.visibility = 'public')
  );

drop policy if exists "Users can join public spaces or with invites" on public.space_members;
create policy "Users can join public spaces or with invites" on public.space_members
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "Members can leave or admins can manage members" on public.space_members;
create policy "Members can leave or admins can manage members" on public.space_members
  for delete using (
    user_id = (select auth.uid())
    or public.is_admin_of_space(space_id)
  );

-- Space Invites
drop policy if exists "Space members can create invites" on public.space_invites;
create policy "Space members can create invites" on public.space_invites
  for insert with check (
    public.is_member_of_space(space_id)
    or exists (select 1 from public.spaces s where s.id = space_id and s.owner_id = (select auth.uid()))
  );

-- Messages
drop policy if exists "Members can insert room messages" on public.messages;
create policy "Members can insert room messages" on public.messages
  for insert with check (
    (select auth.uid()) = sender_id
    and (
      public.is_member_of_space(space_id)
      or exists (select 1 from public.spaces s where s.id = space_id and s.visibility = 'public')
    )
  );

drop policy if exists "Senders can edit or delete their own messages" on public.messages;
create policy "Senders can edit or delete their own messages" on public.messages
  for update using ((select auth.uid()) = sender_id);

drop policy if exists "Senders or admins can delete messages" on public.messages;
create policy "Senders or admins can delete messages" on public.messages
  for delete using (
    (select auth.uid()) = sender_id
    or public.is_admin_of_space(space_id)
  );

-- Message Reactions
drop policy if exists "Users can toggle their own reactions" on public.message_reactions;
create policy "Users can toggle their own reactions" on public.message_reactions
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "Users can remove their own reactions" on public.message_reactions;
create policy "Users can remove their own reactions" on public.message_reactions
  for delete using ((select auth.uid()) = user_id);

-- Buddy Conversations & Direct Messages
drop policy if exists "Participants can view their buddy conversations" on public.buddy_conversations;
create policy "Participants can view their buddy conversations" on public.buddy_conversations
  for select using ((select auth.uid()) in (user_one, user_two));

drop policy if exists "Participants can create buddy conversations" on public.buddy_conversations;
create policy "Participants can create buddy conversations" on public.buddy_conversations
  for insert with check ((select auth.uid()) in (user_one, user_two));

drop policy if exists "Participants can view direct messages" on public.direct_messages;
create policy "Participants can view direct messages" on public.direct_messages
  for select using (
    exists (
      select 1 from public.buddy_conversations c
      where c.id = conversation_id and (select auth.uid()) in (c.user_one, c.user_two)
    )
  );

drop policy if exists "Participants can send direct messages" on public.direct_messages;
create policy "Participants can send direct messages" on public.direct_messages
  for insert with check (
    (select auth.uid()) = sender_id
    and exists (
      select 1 from public.buddy_conversations c
      where c.id = conversation_id and (select auth.uid()) in (c.user_one, c.user_two)
    )
  );

-- AI Companions & Memories
drop policy if exists "Users can view their own companion" on public.ai_companions;
create policy "Users can view their own companion" on public.ai_companions
  for select using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own companion" on public.ai_companions;
create policy "Users can insert their own companion" on public.ai_companions
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own companion" on public.ai_companions;
create policy "Users can update their own companion" on public.ai_companions
  for update using ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own companion" on public.ai_companions;
create policy "Users can delete their own companion" on public.ai_companions
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their companion memories" on public.companion_memories;
create policy "Users can view their companion memories" on public.companion_memories
  for select using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their companion memories" on public.companion_memories;
create policy "Users can insert their companion memories" on public.companion_memories
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their companion memories" on public.companion_memories;
create policy "Users can update their companion memories" on public.companion_memories
  for update using ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their companion memories" on public.companion_memories;
create policy "Users can delete their companion memories" on public.companion_memories
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their companion chat history" on public.companion_messages;
create policy "Users can view their companion chat history" on public.companion_messages
  for select using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert companion chat history" on public.companion_messages;
create policy "Users can insert companion chat history" on public.companion_messages
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete companion chat history" on public.companion_messages;
create policy "Users can delete companion chat history" on public.companion_messages
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own ai usage" on public.ai_usage;
create policy "Users can view their own ai usage" on public.ai_usage
  for select using ((select auth.uid()) = user_id);

-- Space Playlists
drop policy if exists "Creators or space owners can delete playlist tracks" on public.space_playlists;
create policy "Creators or space owners can delete playlist tracks" on public.space_playlists
  for delete using ((select auth.uid()) = created_by or (select auth.uid()) in (select owner_id from public.spaces where id = space_id));

-- ==========================================================
-- SECTION 13: RESOLVE MULTIPLE PERMISSIVE POLICIES
-- ==========================================================

-- Split "for all" on rooms into specific DML actions
drop policy if exists "Space admins can create or edit rooms" on public.rooms;
create policy "Space admins can insert rooms" on public.rooms
  for insert with check (public.is_admin_of_space(space_id));
create policy "Space admins can update rooms" on public.rooms
  for update using (public.is_admin_of_space(space_id));
create policy "Space admins can delete rooms" on public.rooms
  for delete using (public.is_admin_of_space(space_id));

-- Split "for all" on world_objects into specific DML actions
drop policy if exists "Space admins can place or edit world objects" on public.world_objects;
create policy "Space admins can insert world objects" on public.world_objects
  for insert with check (public.is_admin_of_space(space_id));
create policy "Space admins can update world objects" on public.world_objects
  for update using (public.is_admin_of_space(space_id));
create policy "Space admins can delete world objects" on public.world_objects
  for delete using (public.is_admin_of_space(space_id));

-- ==========================================================
-- SECTION 14: FUNCTION SECURITY HARDENING & RPC ACCESS
-- ==========================================================

alter function public.handle_new_user() set search_path = public;
alter function public.sync_space_member_count() set search_path = public;
alter function public.purge_expired_messages() set search_path = public;

revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.sync_space_member_count() from anon, authenticated;
revoke execute on function public.purge_expired_messages() from anon, authenticated;

-- ==========================================================
-- SECTION 15: REALTIME REPLICATION PUBLICATION SETUP
-- ==========================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'call_sessions'
  ) then
    alter publication supabase_realtime add table public.call_sessions;
  end if;

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

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_subscriptions'
  ) then
    alter publication supabase_realtime add table public.user_subscriptions;
  end if;
end $$;

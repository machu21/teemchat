-- ==========================================================
-- TEEMCHAT: DASHBOARD SOCIAL HUB MIGRATION
-- Friends, Friend Requests, Group Conversations & Realtime Messaging
-- ==========================================================

-- 1. FRIENDSHIPS
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

-- 2. FRIEND REQUESTS
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

-- 3. GROUP SQUAD CONVERSATIONS
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

-- 4. GROUP MESSAGES
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

-- 5. ATOMIC ACCEPT FRIEND REQUEST RPC
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

-- 6. REALTIME REPLICATION CONFIGURATION
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

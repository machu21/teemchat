-- ==========================================================
-- CHAT MINI-GAMES (2026-11-14)
-- Chess, Dama, Tic-Tac-Toe and Block Drop played inside a DM or group chat.
--
-- * public.chat_games holds one row per game. The row is the source of truth;
--   clients get live updates over a broadcast channel (`chatgame:<id>`) and
--   re-fetch the row through RLS, so the table is NOT in supabase_realtime.
-- * Reads: DM participants / group members only.
-- * Writes: only through the SECURITY DEFINER RPCs below (no insert/update
--   policies). They check membership, blocks, turn order and an optimistic
--   `version` lock. Move legality is validated client-side (casual games).
-- * Guests are real auth.users rows, so every check works for them too.
--
-- Idempotent and non-destructive.
-- ==========================================================

create table if not exists public.chat_games (
  id uuid default gen_random_uuid() primary key,
  conversation_type text not null check (conversation_type in ('dm', 'group')),
  conversation_id uuid not null,
  game text not null check (game in ('chess', 'dama', 'tictactoe', 'blockdrop')),
  status text not null default 'invited'
    check (status in ('invited', 'active', 'finished', 'declined', 'abandoned')),
  player_one uuid not null references public.profiles(id) on delete cascade,
  player_two uuid references public.profiles(id) on delete cascade,
  current_turn uuid,
  state jsonb not null default '{}'::jsonb,
  version int not null default 1,
  winner uuid,
  result text check (result is null or result in ('win', 'draw', 'resign', 'timeout')),
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.chat_games enable row level security;

create index if not exists idx_chat_games_conversation on public.chat_games(conversation_id, status);
create index if not exists idx_chat_games_player_one on public.chat_games(player_one);
create index if not exists idx_chat_games_player_two on public.chat_games(player_two);

-- ----------------------------------------------------------
-- Membership helper (private: not exposed through PostgREST)
-- ----------------------------------------------------------
create schema if not exists private;

create or replace function private.can_access_chat(p_type text, p_conversation uuid, p_user uuid)
returns boolean
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select case
    when p_user is null then false
    when p_type = 'dm' then exists (
      select 1 from public.buddy_conversations c
      where c.id = p_conversation and p_user in (c.user_one, c.user_two)
    )
    when p_type = 'group' then exists (
      select 1 from public.group_conversation_members m
      where m.conversation_id = p_conversation and m.user_id = p_user
    )
    else false
  end;
$$;

revoke execute on function private.can_access_chat(text, uuid, uuid) from public, anon;
grant  execute on function private.can_access_chat(text, uuid, uuid) to authenticated, service_role;

drop policy if exists "Chat members can view chat games" on public.chat_games;
create policy "Chat members can view chat games" on public.chat_games
  for select to authenticated
  using (private.can_access_chat(conversation_type, conversation_id, (select auth.uid())));

-- ----------------------------------------------------------
-- RPCs
-- ----------------------------------------------------------

-- Start a challenge. In a DM the other participant is fixed as player two;
-- in a group the first member who accepts becomes player two.
create or replace function public.create_chat_game(
  p_conversation_type text,
  p_conversation_id uuid,
  p_game text,
  p_state jsonb default '{}'::jsonb
)
returns public.chat_games
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_other uuid;
  v_row public.chat_games;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_game not in ('chess', 'dama', 'tictactoe', 'blockdrop') then raise exception 'unknown game'; end if;
  if octet_length(coalesce(p_state, '{}'::jsonb)::text) > 16384 then raise exception 'state too large'; end if;
  if not private.can_access_chat(p_conversation_type, p_conversation_id, v_uid) then
    raise exception 'not a member of this chat';
  end if;

  if p_conversation_type = 'dm' then
    select case when c.user_one = v_uid then c.user_two else c.user_one end
      into v_other
      from public.buddy_conversations c where c.id = p_conversation_id;
    if v_other is null or private.is_blocked_between(v_uid, v_other) then
      raise exception 'cannot play with this user';
    end if;
  end if;

  -- One open game per type per chat: retire stale open invites from this player.
  update public.chat_games
     set status = 'abandoned', updated_at = timezone('utc'::text, now())
   where conversation_id = p_conversation_id
     and game = p_game
     and player_one = v_uid
     and status = 'invited';

  insert into public.chat_games (conversation_type, conversation_id, game, player_one, player_two, state)
  values (p_conversation_type, p_conversation_id, p_game, v_uid, v_other, coalesce(p_state, '{}'::jsonb))
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.accept_chat_game(p_game_id uuid)
returns public.chat_games
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.chat_games;
begin
  select * into v_row from public.chat_games where id = p_game_id for update;
  if not found then raise exception 'game not found'; end if;
  if v_row.status <> 'invited' then raise exception 'game is not open'; end if;
  if v_uid is null or v_uid = v_row.player_one then raise exception 'cannot accept your own game'; end if;
  if v_row.player_two is not null and v_row.player_two <> v_uid then raise exception 'not invited'; end if;
  if not private.can_access_chat(v_row.conversation_type, v_row.conversation_id, v_uid) then
    raise exception 'not a member of this chat';
  end if;
  if private.is_blocked_between(v_uid, v_row.player_one) then raise exception 'cannot play with this user'; end if;

  update public.chat_games
     set status = 'active',
         player_two = v_uid,
         -- Player one always moves first; Block Drop has no turns.
         current_turn = case when game = 'blockdrop' then null else player_one end,
         version = version + 1,
         updated_at = timezone('utc'::text, now())
   where id = p_game_id
   returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.decline_chat_game(p_game_id uuid)
returns public.chat_games
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.chat_games;
begin
  select * into v_row from public.chat_games where id = p_game_id for update;
  if not found then raise exception 'game not found'; end if;
  if v_row.status <> 'invited' then raise exception 'game is not open'; end if;
  -- The challenger can cancel; in a DM the invitee can decline. Group invites
  -- stay open for other members, so only the challenger closes them.
  if v_uid is null or not (v_uid = v_row.player_one or v_uid = v_row.player_two) then
    raise exception 'not allowed';
  end if;

  update public.chat_games
     set status = case when v_uid = player_one then 'abandoned' else 'declined' end,
         version = version + 1,
         updated_at = timezone('utc'::text, now())
   where id = p_game_id
   returning * into v_row;
  return v_row;
end;
$$;

-- Submit a move / state change. Returns the updated row, or no row when
-- `p_expected_version` is stale (the caller reloads and retries).
create or replace function public.submit_chat_game_move(
  p_game_id uuid,
  p_expected_version int,
  p_state jsonb,
  p_next_turn uuid,
  p_status text,
  p_winner uuid,
  p_result text
)
returns setof public.chat_games
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.chat_games;
  v_opponent uuid;
begin
  select * into v_row from public.chat_games where id = p_game_id for update;
  if not found then raise exception 'game not found'; end if;
  if v_row.status <> 'active' then raise exception 'game is not active'; end if;
  if v_uid is null or v_uid not in (v_row.player_one, v_row.player_two) then raise exception 'not a player'; end if;
  if private.is_blocked_between(v_row.player_one, v_row.player_two) then raise exception 'cannot play with this user'; end if;
  if p_status not in ('active', 'finished') then raise exception 'bad status'; end if;
  if p_result is not null and p_result not in ('win', 'draw', 'timeout') then raise exception 'bad result'; end if;
  if octet_length(coalesce(p_state, '{}'::jsonb)::text) > 16384 then raise exception 'state too large'; end if;
  if p_winner is not null and p_winner not in (v_row.player_one, v_row.player_two) then raise exception 'bad winner'; end if;

  v_opponent := case when v_uid = v_row.player_one then v_row.player_two else v_row.player_one end;

  if v_row.game = 'blockdrop' then
    -- No turns. A player can only report their own loss (winner = opponent),
    -- never declare themselves the winner.
    if p_winner = v_uid then raise exception 'cannot declare yourself the winner'; end if;
    p_next_turn := null;
  else
    if v_row.current_turn is distinct from v_uid then raise exception 'not your turn'; end if;
    if p_status = 'active' and p_next_turn is distinct from v_opponent then raise exception 'bad next turn'; end if;
    if p_status = 'finished' then p_next_turn := null; end if;
  end if;

  if v_row.version <> p_expected_version then
    return; -- stale: no row
  end if;

  return query
  update public.chat_games
     set state = coalesce(p_state, '{}'::jsonb),
         current_turn = p_next_turn,
         status = p_status,
         winner = case when p_status = 'finished' then p_winner else null end,
         result = case when p_status = 'finished' then coalesce(p_result, case when p_winner is null then 'draw' else 'win' end) else null end,
         version = version + 1,
         updated_at = timezone('utc'::text, now())
   where id = p_game_id
   returning *;
end;
$$;

create or replace function public.resign_chat_game(p_game_id uuid)
returns public.chat_games
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.chat_games;
begin
  select * into v_row from public.chat_games where id = p_game_id for update;
  if not found then raise exception 'game not found'; end if;
  if v_row.status <> 'active' then raise exception 'game is not active'; end if;
  if v_uid is null or v_uid not in (v_row.player_one, v_row.player_two) then raise exception 'not a player'; end if;

  update public.chat_games
     set status = 'finished',
         result = 'resign',
         winner = case when v_uid = player_one then player_two else player_one end,
         current_turn = null,
         version = version + 1,
         updated_at = timezone('utc'::text, now())
   where id = p_game_id
   returning * into v_row;
  return v_row;
end;
$$;

-- Signed-in only (guests are authenticated users).
revoke execute on function public.create_chat_game(text, uuid, text, jsonb) from public, anon;
grant  execute on function public.create_chat_game(text, uuid, text, jsonb) to authenticated;
revoke execute on function public.accept_chat_game(uuid) from public, anon;
grant  execute on function public.accept_chat_game(uuid) to authenticated;
revoke execute on function public.decline_chat_game(uuid) from public, anon;
grant  execute on function public.decline_chat_game(uuid) to authenticated;
revoke execute on function public.submit_chat_game_move(uuid, int, jsonb, uuid, text, uuid, text) from public, anon;
grant  execute on function public.submit_chat_game_move(uuid, int, jsonb, uuid, text, uuid, text) to authenticated;
revoke execute on function public.resign_chat_game(uuid) from public, anon;
grant  execute on function public.resign_chat_game(uuid) to authenticated;

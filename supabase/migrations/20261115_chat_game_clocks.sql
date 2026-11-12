-- ==========================================================
-- CHAT GAME CLOCKS (2026-11-15)
-- Optional chess clocks for chat games (turn-based games only).
--
-- * time_base_ms = 0 means untimed (the default; existing rows stay untimed).
-- * The server owns the clocks: on every move it charges the mover the time
--   since turn_started_at, then adds the increment. White's first move is free
--   (turn_started_at is null until then), so a challenger who is away when the
--   invite is accepted does not lose time.
-- * A move made with no time left ends the game as a timeout loss.
-- * claim_chat_game_timeout lets either player end a game whose side-to-move
--   has run out, so a player who walks away cannot stall forever.
-- * chat_games_server_now() lets clients line their display clocks up with the
--   server clock.
--
-- Idempotent. The only DROP is the old 4-argument create_chat_game signature,
-- replaced by the 6-argument one below (callers using named 4-argument calls
-- keep working through the defaults).
-- ==========================================================

alter table public.chat_games add column if not exists time_base_ms int not null default 0;
alter table public.chat_games add column if not exists time_increment_ms int not null default 0;
alter table public.chat_games add column if not exists clock_one_ms int;
alter table public.chat_games add column if not exists clock_two_ms int;
alter table public.chat_games add column if not exists turn_started_at timestamptz;

alter table public.chat_games drop constraint if exists chat_games_time_control_check;
alter table public.chat_games add constraint chat_games_time_control_check
  check (time_base_ms between 0 and 10800000 and time_increment_ms between 0 and 60000);

drop function if exists public.create_chat_game(text, uuid, text, jsonb);

create or replace function public.create_chat_game(
  p_conversation_type text,
  p_conversation_id uuid,
  p_game text,
  p_state jsonb default '{}'::jsonb,
  p_time_base_ms int default 0,
  p_time_increment_ms int default 0
)
returns public.chat_games
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_other uuid;
  v_base int := coalesce(p_time_base_ms, 0);
  v_inc int := coalesce(p_time_increment_ms, 0);
  v_row public.chat_games;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_game not in ('chess', 'dama', 'tictactoe', 'blockdrop') then raise exception 'unknown game'; end if;
  if octet_length(coalesce(p_state, '{}'::jsonb)::text) > 16384 then raise exception 'state too large'; end if;
  if v_base < 0 or v_base > 10800000 or v_inc < 0 or v_inc > 60000 then raise exception 'bad time control'; end if;
  if p_game = 'blockdrop' or v_base = 0 then
    v_base := 0;
    v_inc := 0;
  end if;
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

  update public.chat_games
     set status = 'abandoned', updated_at = timezone('utc'::text, now())
   where conversation_id = p_conversation_id
     and game = p_game
     and player_one = v_uid
     and status = 'invited';

  insert into public.chat_games (
    conversation_type, conversation_id, game, player_one, player_two, state,
    time_base_ms, time_increment_ms, clock_one_ms, clock_two_ms
  )
  values (
    p_conversation_type, p_conversation_id, p_game, v_uid, v_other, coalesce(p_state, '{}'::jsonb),
    v_base, v_inc, nullif(v_base, 0), nullif(v_base, 0)
  )
  returning * into v_row;
  return v_row;
end;
$$;

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
  v_timed boolean;
  v_left int;
begin
  select * into v_row from public.chat_games where id = p_game_id for update;
  if not found then raise exception 'game not found'; end if;
  if v_row.status <> 'active' then raise exception 'game is not active'; end if;
  if v_uid is null or v_uid not in (v_row.player_one, v_row.player_two) then raise exception 'not a player'; end if;
  if private.is_blocked_between(v_row.player_one, v_row.player_two) then raise exception 'cannot play with this user'; end if;
  if p_status not in ('active', 'finished') then raise exception 'bad status'; end if;
  if p_result is not null and p_result not in ('win', 'draw') then raise exception 'bad result'; end if;
  if octet_length(coalesce(p_state, '{}'::jsonb)::text) > 16384 then raise exception 'state too large'; end if;
  if p_winner is not null and p_winner not in (v_row.player_one, v_row.player_two) then raise exception 'bad winner'; end if;

  v_opponent := case when v_uid = v_row.player_one then v_row.player_two else v_row.player_one end;
  v_timed := v_row.game <> 'blockdrop' and v_row.time_base_ms > 0;

  if v_row.game = 'blockdrop' then
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

  if v_timed then
    v_left := case when v_uid = v_row.player_one then v_row.clock_one_ms else v_row.clock_two_ms end;
    if v_row.turn_started_at is not null then
      v_left := v_left - floor(extract(epoch from (now() - v_row.turn_started_at)) * 1000)::int;
      if v_left <= 0 then
        -- Flagged: the move came too late; the mover loses on time.
        return query
        update public.chat_games
           set status = 'finished',
               result = 'timeout',
               winner = v_opponent,
               current_turn = null,
               clock_one_ms = case when v_uid = player_one then 0 else clock_one_ms end,
               clock_two_ms = case when v_uid = player_two then 0 else clock_two_ms end,
               turn_started_at = null,
               version = version + 1,
               updated_at = timezone('utc'::text, now())
         where id = p_game_id
         returning *;
        return;
      end if;
      v_left := v_left + v_row.time_increment_ms;
    end if;
  end if;

  return query
  update public.chat_games
     set state = coalesce(p_state, '{}'::jsonb),
         current_turn = p_next_turn,
         status = p_status,
         winner = case when p_status = 'finished' then p_winner else null end,
         result = case when p_status = 'finished' then coalesce(p_result, case when p_winner is null then 'draw' else 'win' end) else null end,
         clock_one_ms = case when v_timed and v_uid = player_one then v_left else clock_one_ms end,
         clock_two_ms = case when v_timed and v_uid = player_two then v_left else clock_two_ms end,
         turn_started_at = case when v_timed and p_status = 'active' then now() else null end,
         version = version + 1,
         updated_at = timezone('utc'::text, now())
   where id = p_game_id
   returning *;
end;
$$;

-- Ends a timed game whose side-to-move has no time left. Either player may call it.
create or replace function public.claim_chat_game_timeout(p_game_id uuid)
returns public.chat_games
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.chat_games;
  v_left int;
begin
  select * into v_row from public.chat_games where id = p_game_id for update;
  if not found then raise exception 'game not found'; end if;
  if v_uid is null or v_uid not in (v_row.player_one, v_row.player_two) then raise exception 'not a player'; end if;
  if v_row.status <> 'active' then return v_row; end if; -- already over: nothing to claim
  if v_row.time_base_ms = 0 or v_row.turn_started_at is null or v_row.current_turn is null then
    raise exception 'time not up';
  end if;

  v_left := (case when v_row.current_turn = v_row.player_one then v_row.clock_one_ms else v_row.clock_two_ms end)
            - floor(extract(epoch from (now() - v_row.turn_started_at)) * 1000)::int;
  if v_left > 0 then raise exception 'time not up'; end if;

  update public.chat_games
     set status = 'finished',
         result = 'timeout',
         winner = case when current_turn = player_one then player_two else player_one end,
         clock_one_ms = case when current_turn = player_one then 0 else clock_one_ms end,
         clock_two_ms = case when current_turn = player_two then 0 else clock_two_ms end,
         current_turn = null,
         turn_started_at = null,
         version = version + 1,
         updated_at = timezone('utc'::text, now())
   where id = p_game_id
   returning * into v_row;
  return v_row;
end;
$$;

-- Resigning also stops the clocks.
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
         turn_started_at = null,
         version = version + 1,
         updated_at = timezone('utc'::text, now())
   where id = p_game_id
   returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.chat_games_server_now()
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $$
  select now();
$$;

revoke execute on function public.create_chat_game(text, uuid, text, jsonb, int, int) from public, anon;
grant  execute on function public.create_chat_game(text, uuid, text, jsonb, int, int) to authenticated;
revoke execute on function public.submit_chat_game_move(uuid, int, jsonb, uuid, text, uuid, text) from public, anon;
grant  execute on function public.submit_chat_game_move(uuid, int, jsonb, uuid, text, uuid, text) to authenticated;
revoke execute on function public.claim_chat_game_timeout(uuid) from public, anon;
grant  execute on function public.claim_chat_game_timeout(uuid) to authenticated;
revoke execute on function public.resign_chat_game(uuid) from public, anon;
grant  execute on function public.resign_chat_game(uuid) to authenticated;
revoke execute on function public.chat_games_server_now() from public, anon;
grant  execute on function public.chat_games_server_now() to authenticated;

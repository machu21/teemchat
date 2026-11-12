# Chat Mini-Games (Chess, Dama, Tic-Tac-Toe, Block Drop)

Games played inside any DM or group chat in `MessengerDrawer`.

## Layers

| Layer | Files |
| :--- | :--- |
| SQL | `supabase/migrations/20261114_chat_games.sql`: `public.chat_games` + RPCs |
| Rules (pure, tested) | `next-app/src/lib/games/{types,tictactoe,chess,dama,blockdrop}.ts` |
| Service | `next-app/src/lib/services/chatGames.ts` (`ChatGameService`) |
| UI | `next-app/src/components/games/*`, wired in `components/dashboard/MessengerDrawer.tsx` |
| Tests | `next-app/tests/games_rules.test.ts`, `next-app/tests/chat_games_service.test.ts` |

## Flow

1. The **Games** button (gamepad icon) in the chat header opens `GamePicker`. `ChatGameService.create` calls `create_chat_game` and returns the row.
2. The drawer posts a normal chat message `[[game:<uuid>:<kind>]]` (`encodeInvite`). The existing DM and group pipelines deliver and store it. The message list renders it as a `GameInviteCard` (`parseInvite`).
3. The opponent opens the card, which shows `GameOverlay`, and accepts with `accept_chat_game`. In a DM, player two is fixed to the other participant. In a group, the first member to accept becomes player two, and everyone else spectates.
4. Moves go through `submit_chat_game_move(id, expected_version, ...)`. The RPC checks membership, blocks, turn order and an optimistic `version` lock. If the version is stale it returns an empty set, and the client reloads.

## Realtime rules

- `chat_games` is **not** in `supabase_realtime`.
- Live updates use a broadcast channel `chatgame:<id>`:
  - `moved {version}`: receivers **re-fetch the row through RLS**. They never apply the payload directly, so a spoofed broadcast cannot change game state.
  - `board {snapshot, score, lines}` (Block Drop): throttled to 1 per 250 ms, and repeats of the same board are dropped.
  - `garbage {to_user_id, count}` (Block Drop): the count is clamped to 0..4.
- Incoming messages are filtered by `client_id` (one per mounted overlay), not by `userId`.
- `dispose()` removes the channel. `GameOverlay` calls it on unmount.

## Game rules

- **Tic-Tac-Toe:** player one is X and moves first.
- **Chess:** uses `chess.js`. Player one is white. Threefold repetition is not detected because only the FEN is stored.
- **Dama** (Filipino):
  - Men move forward and capture both ways.
  - Capturing is mandatory, and multi-jumps must be completed.
  - Kings fly.
  - A side with no legal move loses.
  - 80 quiet king plies is a draw.
- **Block Drop:** original falling-block versus (do not call it or style it after any trademarked game).
  - Both players share a seed, so they get the same 7-bag piece sequence.
  - Clearing 2, 3 or 4 lines sends 1, 2 or 4 garbage lines.
  - The player who tops out reports their own loss. The RPC refuses `winner = caller` for Block Drop.

## Trust model

Move legality is checked on the client only; this is acceptable for casual games with no stakes. The server enforces who can move, when they can move, and the version lock.

## No emoji

Chess pieces use the lucide `ChessKing`/... icons, registered as `chessKing` etc. in `src/lib/icons`. Never use the Unicode chess glyphs.

## Solo mode (vs computer)

Solo games run locally in `components/games/SoloGame.tsx`. They have no database row and post no chat message. The human is always seat one (white / X) and the computer is seat two.

Bots are in `lib/games/bots.ts`. They are rule-based search, with no AI service:
- **Tic-Tac-Toe:** memoized minimax. Easy and Medium make random mistakes.
- **Chess:** alpha-beta negamax over material and piece-square tables.
  - Iterative deepening with a time cap per level: Easy 300 ms, Medium 600 ms, Hard 1000 ms, up to depth 3.
  - A mate in one is always played.
  - Easier levels choose among near-best moves and sometimes blunder.
- **Dama:** alpha-beta search (depth 1, 3 or 5) on material plus advancement.
- **Block Drop:** `BlockDropCpu` ranks every rotation and column of the current piece (height, holes, bumpiness, lines), then steers the piece there at the level's speed. Lines it clears send garbage to the player.

Chess and Dama searches run in `bot.worker.ts` through `botRunner.ts`, so the board and clocks stay smooth while the computer thinks. If a Worker can't start, the search runs inline instead.

## Chess clocks

Clock data:
- Time controls are in `lib/games/clock.ts`: none, 3+2, 5+0, 10+0, 15+10.
- Columns added by `20261115_chat_game_clocks.sql`: `time_base_ms`, `time_increment_ms`, `clock_one_ms`, `clock_two_ms`, `turn_started_at`.

The server owns the clocks:
- `submit_chat_game_move` charges the mover `now() - turn_started_at` and then adds the increment.
- White's first move is free: `turn_started_at` stays null until then.
- A move made with no time left ends the game as `result = 'timeout'`.
- `claim_chat_game_timeout` lets either player end a game once the side to move has run out.

The client side:
- `GameOverlay` shows the clocks using the skew measured from `chat_games_server_now()`.
- When the shown time hits zero it calls `claim_chat_game_timeout`, retrying every 1.6 s until the server agrees.
- Solo chess uses the same rules with local clocks; the computer's thinking time counts against its own clock.

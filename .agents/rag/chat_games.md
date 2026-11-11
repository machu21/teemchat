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

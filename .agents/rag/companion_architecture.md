# Living AI Companion RAG

A pixel pet (cat / robot / dog / wisp) that follows its owner on the canvas, speaks up on its own, guides, and remembers. Owner-only chat; other players only see its name + sprite.

## Map of the code
| Layer | File | Role |
| :--- | :--- | :--- |
| Shared types / sanitizers | `next-app/src/lib/companion/{types,normalize}.ts` | Species, moods, emotes, actions; `oneLine()` bounds every value that reaches a prompt |
| Prompt | `lib/companion/prompt.ts` + `appKnowledge.ts` | `buildSystemPrompt()` (pure): persona, traits, mood, bond, ≤8 facts, ≤3 diary summaries + follow-up threads, world snapshot, voice rules, JSON reply schema |
| Server data | `lib/companion/server.ts` | `getOrCreateCompanion`, fact upsert-by-key (`learnFromExchange`), `saveExchange`, `maybeSummarize` (every 20 messages), `awardBond` |
| Route | `app/api/companion/chat/route.ts` | Loads the companion **server-side** (body `companion` is ignored), Gemini structured JSON reply `{text, mood, emote, actions}`, background work via `after()` |
| Client data | `lib/services/companion.ts` | Profile, history, reminders, all RLS-scoped (memories and diary are server-only) |
| Hooks | `lib/hooks/useCompanionChat.ts`, `useSpaceCompanion.ts` | Chat state; the space hook owns brain, tour, guide, reminders, presence badge |
| Brain | `lib/companion/{brain,lines}.ts` | Template proactive lines; 45s global cooldown, per-event cooldowns, muted while owner types |
| Actions | `lib/companion/actions.ts` | Whitelist only: navigate_to_zone, open_dms, open_friends, open_map, start_tour, set_reminder. They only open UI or move the pet, never send anything |
| Tour | `lib/companion/tour.ts` | 6-step first-run tour, progress in `ai_companions.tour_progress` |
| Canvas | `game/entities/companion.ts` | State machine follow → idle → sleep (180s AFK) → wake; guide mode walks ahead with a dotted trail; bubbles + emotes; `passive` mode for remote pets |
| UI | `components/companion/CompanionPanel.tsx`, `CompanionPortrait.tsx` | Chat · Bond tabs; customize name / form / personality / nickname (Lv 3). Memories are automatic and intentionally never shown in the UI |

## Rules
- Never trust client-sent persona, memories or companion id. The world snapshot is display-only and goes through `normalizeWorldContext`.
- Bond XP is written only by `award_companion_bond()` (SECURITY DEFINER, +≤5 per call, once per 20s). The `guard_companion_bond_columns` trigger blocks direct client writes.
- Remote visibility rides the existing presence payload (`companion: {name, species}`) through `WorldSyncService.setCompanionBadge()`, which costs one throttled re-track. Never put memories in presence.
- Guests get a locked "egg" (the API returns 403 for them).
- AI is paid-only, with no free trial. Every Gemini route (`companion/chat`, `companion/screen-help`, `meetings/notes`) goes through `authenticateCompanionRequest` in `lib/companionAuth.ts`, which returns 402 `{ upgradeRequired: true }` unless the caller's `user_subscriptions` row has `has_ai_addon` on an active, unexpired subscription. `check_and_increment_ai_usage()` enforces the same rule in SQL (`has_active_ai_addon`), and `checkCompanionQuota` fails closed. Any new AI route must use both. Migration: `supabase/migrations/20261116_ai_paid_only.sql`.
- Migration: `supabase/migrations/20261104_companion_life.sql` (also appended to `schema.sql`).

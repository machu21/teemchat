# TeemChat Agent RAG Knowledge Base

Welcome to the **TeemChat Agent RAG (Retrieval-Augmented Generation) Knowledge Base**. This repository of structured domain knowledge enables all specialized engineering agents (`senior_developer`, `frontend_engineer`, `backend_developer`, `database_manager`) to retrieve critical architectural constraints, database schemas, Realtime WebSocket protocols, and game engine lifecycles across sessions.

---

## 📚 Knowledge Index

| Document | Focus Domain | Key Topics Covered |
| :--- | :--- | :--- |
| [`system_architecture.md`](file:///c:/Users/ACER.DESKTOP-FLMICGU/Documents/antigravity/clever-carson/.agents/rag/system_architecture.md) | Fullstack Topology | Flutter Web, Flame 2D Engine, Supabase BaaS, LiveKit WebRTC, Service Layer |
| [`realtime_sync_spec.md`](file:///c:/Users/ACER.DESKTOP-FLMICGU/Documents/antigravity/clever-carson/.agents/rag/realtime_sync_spec.md) | Networking & Realtime | Channels (`space:id:world` vs `public:messages`), Broadcast throttling, Presence diffs |
| [`database_schema_and_rls.md`](file:///c:/Users/ACER.DESKTOP-FLMICGU/Documents/antigravity/clever-carson/.agents/rag/database_schema_and_rls.md) | PostgreSQL & Supabase | Tables (`profiles`, `spaces`, `messages`), RLS policies, Guest provisioning, Realtime publication |
| [`flame_game_canvas.md`](file:///c:/Users/ACER.DESKTOP-FLMICGU/Documents/antigravity/clever-carson/.agents/rag/flame_game_canvas.md) | 2D Canvas Engine | Flame lifecycle (`onLoad`, `onMount`, `onRemove`), `RemotePlayerAvatar`, Camera follow, TileMap |
| [`chat_system_and_retention.md`](file:///c:/Users/ACER.DESKTOP-FLMICGU/Documents/antigravity/clever-carson/.agents/rag/chat_system_and_retention.md) | Messaging & Lifecycle | `postgresChanges` replication, 30s hard removal architecture (DB trigger/pg_cron + Flutter Timer) |
| [`known_issues_and_solutions.md`](file:///c:/Users/ACER.DESKTOP-FLMICGU/Documents/antigravity/clever-carson/.agents/rag/known_issues_and_solutions.md) | Post-Mortems & Bug Bank | Avatar invisibility root cause, WebSocket broadcast rate-limiting, Flame listener detach |

---

## 🛠 How Agents Use This RAG

1. **Before Modifying Services**: Read [`realtime_sync_spec.md`](file:///c:/Users/ACER.DESKTOP-FLMICGU/Documents/antigravity/clever-carson/.agents/rag/realtime_sync_spec.md) to preserve packet bandwidth constraints (max 10 msgs/sec in Supabase Realtime).
2. **Before Modifying Flame / Game Loop**: Read [`flame_game_canvas.md`](file:///c:/Users/ACER.DESKTOP-FLMICGU/Documents/antigravity/clever-carson/.agents/rag/flame_game_canvas.md) to avoid detaching ValueNotifier listeners on Flutter widget rebuilds.
3. **Before Authoring SQL**: Read [`database_schema_and_rls.md`](file:///c:/Users/ACER.DESKTOP-FLMICGU/Documents/antigravity/clever-carson/.agents/rag/database_schema_and_rls.md) to ensure idempotent statements and compatibility with guest sessions.
4. **Before Fixing Synchronization Bugs**: Check [`known_issues_and_solutions.md`](file:///c:/Users/ACER.DESKTOP-FLMICGU/Documents/antigravity/clever-carson/.agents/rag/known_issues_and_solutions.md) to inspect proven root causes and verified architectural patches.

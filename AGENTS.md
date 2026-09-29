# TeemChat Engineering Team: Specialized Agents Guide

Welcome to the **TeemChat Engineering Agent System**. This document defines the roles, capabilities, collaboration workflows, and invocation instructions for our 4 specialized agents configured for this codebase.

---

## 👥 The Engineering Agent Roster

| Agent Name | Role | Primary Focus | Key Files & Technologies |
| :--- | :--- | :--- | :--- |
| **`senior_developer`** | Principal Architect & Tech Lead | Fullstack architecture, quality gates, test verification, cross-layer coordination, code reviews | All directories, `analysis_options.yaml`, `test/`, `pubspec.yaml` |
| **`frontend_engineer`** | Lead Frontend & Canvas Engineer | Flutter widgets, Neo-brutalist design system, responsive viewports, Flame 2D game canvas, micro-animations | `lib/core/widgets/`, `lib/core/constants/`, `lib/features/world/`, `lib/features/auth/`, `lib/features/dashboard/` |
| **`backend_developer`** | Lead Backend & Systems Developer | Dart service layer, Supabase Realtime client, LiveKit spatial voice, auth lifecycle, state management | `lib/features/**/auth_service.dart`, `lib/core/services/`, LiveKit/WebRTC, WebSockets |
| **`database_manager`** | Database Architect (Supabase Expert) | PostgreSQL schema, Row Level Security (RLS) policies, Realtime publications, migrations, indexing, triggers | `supabase/schema.sql`, `supabase/migrations/`, Supabase Storage buckets, PL/pgSQL |

---

## 🎯 Agent Profiles & Boundaries

### 1. Senior Developer (`senior_developer`)
* **When to use**:
  * You need to plan a complex multi-part feature across frontend, backend, and database.
  * You want an architectural audit, performance diagnosis, or code review.
  * You want to run the full QA suite (`flutter test` and `flutter analyze`) and ensure zero regressions.
* **Core Rule**: Always enforces that every code change leaves the codebase passing `flutter analyze` with `No issues found!` and all unit/widget tests green.

### 2. Frontend Engineer (`frontend_engineer`)
* **When to use**:
  * Implementing or styling Neo-brutalism UI components (`NeoCard`, `NeoButton`, `NeoBadge`, `NeoInput`).
  * Crafting responsive layouts that scale seamlessly from mobile (320px) to desktop (1440px+).
  * Enhancing the Flame 2D virtual world (`TileMapComponent`, `PlayerComponent`, retro avatars, collision, on-screen joystick).
  * Adding micro-animations (e.g., `TypewriterAnimatedText`, glowing live tags, bouncy hover states).
* **Core Rule**: Never places unconstrained `Spacer()` inside scrollable views, and never uses `CrossAxisAlignment.baseline` inside `IntrinsicHeight`.

### 3. Backend Developer (`backend_developer`)
* **When to use**:
  * Writing or refactoring Dart service layers (`AuthService`, `SpaceService`, `AudioService`).
  * Setting up real-time presence channels, broadcast rooms, or WebSocket event listeners.
  * Implementing proximity voice attenuation math (`distance -> volume`) with LiveKit.
  * Handling guest auth fallback, token refreshing, and error handling.
* **Core Rule**: Guarantees clean asynchronous safety (`mounted` checks, proper stream disposals, and error boundaries).

### 4. Database Manager (`database_manager`)
* **When to use**:
  * Designing or altering database tables, foreign keys, or enum types.
  * Writing or auditing Row Level Security (RLS) policies to prevent cross-tenant data leaks.
  * Enabling tables for Supabase Realtime replication (`ALTER PUBLICATION supabase_realtime ADD TABLE`).
  * Creating triggers, stored procedures (PL/pgSQL), or configuring storage bucket policies.
* **Core Rule**: All SQL must be idempotent (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS`) and safe against accidental data loss.

---

## 🚀 How to Invoke and Use the Agents

You can invoke these agents in your conversation in several natural ways:

### Method 1: Direct Persona Prefix (Recommended)
Simply start your message with the agent's title:
* `"Frontend Engineer: Add a retro sound effect toggle button to the top navbar."`
* `"Database Manager: Write a migration to add room pins and bookmarks with RLS."`
* `"Backend Developer: Implement proximity voice calculation for two players within 150px."`
* `"Senior Developer: Plan and coordinate the implementation of private direct messages."`

### Method 2: Multi-Agent Collaboration Pipeline
For major features, you can prompt the **Senior Developer** to break down the task and orchestrate the other agents:

```markdown
"Senior Developer: We want to introduce interactive campfires in the 2D world where users can gather and roast virtual marshmallows.
Coordinate with Database Manager for any table needs, Backend Developer for presence sync, and Frontend Engineer for the Flame sprite and UI."
```

### Method 3: Combined with Slash Commands
* **/plan**: Combine with Senior Developer to generate a thorough blueprint:
  * `"/plan Senior Developer: Architect an in-space screen sharing feature."`
* **/goal**: Combine for autonomous execution with full quality verification:
  * `"/goal Senior Developer: Implement avatar outfit color picker and verify all tests pass."`

---

## 🔄 Standard Collaborative Workflows

```
┌────────────────────────────────────────────────────────┐
│                   SENIOR DEVELOPER                     │
│  (System Architecture, Task Decomposition, Standards)   │
└──────────────┬──────────────────┬──────────────────────┘
               │                  │
               ▼                  ▼
     ┌──────────────────┐  ┌──────────────────┐
     │ DATABASE MANAGER │  │ BACKEND DEVELOPER│
     │  (Schema, RLS,   │  │ (Dart Services,  │
     │   Publications)  │  │  Realtime, Voice)│
     └─────────┬────────┘  └────────┬─────────┘
               │                    │
               └──────────┬─────────┘
                          ▼
               ┌──────────────────────┐
               │  FRONTEND ENGINEER   │
               │ (UI, Flame 2D Canvas,│
               │  Neo-brutalism, Anim)│
               └──────────┬───────────┘
                          ▼
               ┌──────────────────────┐
               │   QUALITY ASSURANCE  │
               │ (flutter test &      │
               │  flutter analyze)    │
               └──────────────────────┘
```

### Flow 1: End-to-End Feature Development
1. **Senior Developer**: Designs feature contract, validates scope, and assigns domain tasks.
2. **Database Manager**: Prepares SQL schema migrations and sets up RLS policies.
3. **Backend Developer**: Builds Dart service methods and integrates Supabase/LiveKit streaming.
4. **Frontend Engineer**: Constructs Neo-brutalist UI screens, responsive widgets, and Flame canvas components.
5. **Senior Developer**: Runs `flutter test` and `flutter analyze` to ensure 100% pass before completion.

### Flow 2: UI Redesign & Canvas Optimization
1. **Frontend Engineer**: Drafts components using `NeoCard`, `NeoButton`, and `AppColors`.
2. **Senior Developer**: Reviews layout constraints (`IntrinsicHeight`, flex widgets) to prevent layout overflows.

### Flow 3: Security & RLS Policy Hardening
1. **Database Manager**: Audits `supabase/schema.sql` against anonymous access and unauthorized mutation.
2. **Backend Developer**: Tests auth token validation against Supabase RLS.

---

## 📋 Quick Reference Prompt Templates

### For Frontend Engineer:
```
Frontend Engineer:
Please update [file_name] to [describe visual or interactive change].
Ensure it matches our Neo-brutalist theme (bold 2px borders, Offset(3, 3.5) drop shadow, Plus Jakarta Sans),
handles both light and dark mode, and remains fully responsive on screens from 360px to 1440px.
```

### For Backend Developer:
```
Backend Developer:
Please implement [feature_name] in [service_file].
Connect to Supabase Realtime / LiveKit to handle [broadcast/presence/stream].
Ensure proper error handling, unmounted checks, and lifecycle disposal.
```

### For Database Manager:
```
Database Manager:
Please author an idempotent migration in supabase/schema.sql for [table_name].
Include columns, relationships, indexes, and full RLS policies for:
- Viewing records
- Creating records
- Updating records
Enable Supabase Realtime publication if live sync is required.
```

### For Senior Developer:
```
Senior Developer:
Review the recent changes in [files/feature].
Verify code architecture, check for potential layout or memory leaks,
and run flutter test and flutter analyze to confirm zero issues.
```

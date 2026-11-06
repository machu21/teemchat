# Handoff Report: Database Schema, Migrations, Triggers & Frontend Admin UI Integration

**Agent**: `survey_explorer_3`  
**Focus**: Database Schema & Migrations, Triggers, Security Boundaries, Performance Inefficiencies, and Frontend Admin UI / Client Integration.  
**Working Directory**: `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\survey_explorer_3\`  
**Date**: 2026-11-06T03:21:00Z  

---

## 1. Observation

### 1.1 Database Schema, Migrations & Triggers

1. **Trigger Attachment and Scope on `public.profiles`**:
   - File: `supabase/migrations/20261109_admin_dashboard_backend.sql` (lines 18-31) and `supabase/schema.sql` (lines 2715-2728):
     ```sql
     create or replace function public.guard_profile_system_role()
     returns trigger language plpgsql security invoker as $$
     begin
       if current_user in ('anon', 'authenticated') and (old.system_role is distinct from new.system_role) then
         raise exception 'Unauthorized: Only system administrators can alter system_role';
       end if;
       return new;
     end;
     $$;

     drop trigger if exists guard_profile_system_role_trg on public.profiles;
     create trigger guard_profile_system_role_trg
       before update on public.profiles
       for each row execute function public.guard_profile_system_role();
     ```
   - Profile Insert Policy in `supabase/schema.sql` (lines 45-47):
     ```sql
     drop policy if exists "Users can insert their own profile" on public.profiles;
     create policy "Users can insert their own profile" on public.profiles
       for insert with check (auth.uid() = id);
     ```

2. **Metrics RPC Access Controls and Timezone Sensitivity**:
   - File: `supabase/migrations/20261109_admin_dashboard_backend.sql` (lines 76-105) and `supabase/schema.sql` (lines 2770-2799):
     ```sql
     create or replace function public.get_admin_overview_metrics()
     returns jsonb language plpgsql security definer as $$
     declare
       v_total_users int;
       v_new_users_24h int;
       v_active_subscriptions int;
       v_total_revenue_cents bigint;
       v_pending_reports int;
       v_active_spaces int;
       v_today_ai_messages int;
     begin
       select count(*) into v_total_users from public.profiles;
       select count(*) into v_new_users_24h from public.profiles where created_at >= (now() - interval '24 hours');
       select count(*) into v_active_subscriptions from public.user_subscriptions where status = 'active';
       select coalesce(sum(amount_cents), 0) into v_total_revenue_cents from public.billing_invoices where status = 'paid';
       select count(*) into v_pending_reports from public.user_reports where status = 'pending';
       select count(*) into v_active_spaces from public.spaces;
       select coalesce(sum(message_count), 0) into v_today_ai_messages from public.ai_usage where usage_date = current_date;
     ...
     ```
   - No `REVOKE EXECUTE` is issued on `public.get_admin_overview_metrics()`.
   - Neither `public.is_system_admin` nor `public.get_admin_overview_metrics()` specifies `SET search_path = public, pg_temp`.

3. **Covering Indexes on High-Scale Tables**:
   - In `supabase/schema.sql`:
     - `profiles`: Index on `id` (PK), `username` (unique), `system_role`. Missing index on `created_at desc`.
     - `user_subscriptions`: Index on `user_id`, `stripe_customer_id`, `stripe_subscription_id`. Missing index on `status`.
     - `billing_invoices`: Index on `user_id`, `stripe_invoice_id`. Missing index on `status` or composite `(status, amount_cents)`.
     - `ai_usage`: Index on `(user_id, usage_date)`. Missing index with `usage_date` as leading column.
     - `spaces`: `is_active boolean not null default true`. The query `count(*) from public.spaces` counts all spaces, including deactivated ones.

### 1.2 Backend CRUD Route Handlers vs Database Schema

1. **Hardcoded Primary Key `id` on `space_settings` in CRUD Entity Routes**:
   - File: `next-app/src/app/api/admin/crud/[entity]/[id]/route.ts`:
     - Line 30 (GET): `auth.supabaseAdmin.from(entity).select('*').eq('id', id).single()`
     - Line 81 (PATCH): `auth.supabaseAdmin.from(entity).update(...).eq('id', id).select().single()`
     - Line 140 (DELETE): `auth.supabaseAdmin.from(entity).delete().eq('id', id)`
   - Schema in `supabase/schema.sql` (lines 1503-1514):
     ```sql
     create table if not exists public.space_settings (
       space_id uuid references public.spaces(id) on delete cascade primary key,
       default_spawn_x double precision not null default 600.0,
       ...
     ```
     `public.space_settings` has NO column named `id`. Its primary key is `space_id`.

2. **Unconditional Injection of `updated_at` in CRUD Entity Updates**:
   - File: `next-app/src/app/api/admin/crud/[entity]/[id]/route.ts` (line 80):
     ```ts
     const { data: updatedRecord, error: updateErr } = await (auth.supabaseAdmin.from(entity as any) as any)
       .update({ ...body, updated_at: new Date().toISOString() })
       .eq('id', id)
       .select()
       .single();
     ```
   - Inspection of the 15 `WHITELISTED_CRUD_ENTITIES` in `supabase/schema.sql`:
     - Entities with `updated_at`: `spaces`, `space_settings`, `user_reports`, `ai_companions`, `user_subscriptions` (5 tables).
     - Entities WITHOUT `updated_at`: `worlds`, `space_members`, `space_roles`, `space_bans`, `space_mutes`, `companion_memories`, `space_playlists`, `playlist_tracks`, `world_objects`, `billing_invoices` (10 tables).

3. **Missing `created_at` in `space_roles`**:
   - File: `next-app/src/lib/services/adminClient.ts` (lines 643-650):
     ```ts
     let sortBy = query?.sortBy;
     if (!sortBy) {
       if (entity === 'space_settings') sortBy = 'updated_at';
       else if (entity === 'space_members') sortBy = 'joined_at';
       else sortBy = 'created_at';
     }
     ```
   - File: `next-app/src/app/api/admin/crud/[entity]/route.ts` (line 31):
     ```ts
     const sortBy = url.searchParams.get('sortBy') || 'created_at';
     ```
   - Schema in `supabase/schema.sql` (lines 1516-1531):
     `public.space_roles` contains `id`, `space_id`, `name`, `color`, `priority`, `is_default`, `permissions`. It has neither `created_at` nor `updated_at`.

### 1.3 PostgREST Search Filter Syntax & Date Range Logic

1. **Unescaped Comma Breaks in PostgREST `.or()` Filters**:
   - File: `next-app/src/app/api/admin/users/route.ts` (line 31):
     ```ts
     query = query.or(`username.ilike.%${search}%,display_name.ilike.%${search}%`);
     ```
   - File: `next-app/src/app/api/admin/logs/route.ts` (lines 35, 54, 73, 129):
     Similar `.or(...)` filter constructions with unescaped `${search}`.
   - PostgREST filter expressions use commas `,` to delimit conditions.

2. **Truncation of `endDate` in Logs Tab**:
   - File: `next-app/src/app/admin/components/LogsTab.tsx` (line 110):
     ```ts
     endDate: endDate ? new Date(endDate).toISOString() : undefined,
     ```
   - File: `next-app/src/app/api/admin/logs/route.ts` (lines 34, 53, 72, 91, 109, 128):
     ```ts
     if (endDate) query = query.lte('created_at', endDate);
     ```
   - When a user selects a date (e.g. `2026-11-05`), `new Date("2026-11-05").toISOString()` generates `2026-11-05T00:00:00.000Z` (the very start of the day), filtering out all records created during that day.

3. **Search Inactivity for `ai_usage` in Logs API**:
   - File: `next-app/src/app/api/admin/logs/route.ts` (lines 86-101):
     Unlike other categories, the `ai_usage` switch branch lacks an `if (search)` block.

### 1.4 Frontend Design & Iconography Audit

1. **Zero-Emoji Compliance**:
   - File: `next-app/src/app/admin/components/AdminIcons.tsx`: 100% vector SVG icons with scalable `size`, `color`, and `strokeWidth`.
   - File: `next-app/src/app/admin/page.tsx`, `AdminNav.tsx`, `OverviewTab.tsx`, `UsersTab.tsx`, `PaymentsTab.tsx`, `LogsTab.tsx`, `CrudTab.tsx`: All UI elements use vector icons or badges. Zero emoji characters present.

2. **Neo-brutalist Styling Tokens**:
   - File: `next-app/src/app/admin/admin.module.css`:
     - Borders: `2px solid var(--card-border)` / `var(--neo-border-width)`.
     - Drop Shadows: Hard 0-blur offset box-shadows (`2px 2px 0px`, `2.5px 2.5px 0px`, `3px 3px 0px #18181B`).
     - Fonts: Plus Jakarta Sans, heavy weights (700, 800, 900), uppercase badge tags (`PAID`, `FREE`, `ACTIVE`, `SUPERADMIN`).
     - Safe Area Insets: Mobile support via `calc(14px + env(safe-area-inset-top, 0px))`.

---

## 2. Logic Chain

1. **Trigger Privilege Escalation Chain**:
   - **Step 1**: `guard_profile_system_role_trg` is created `before update on public.profiles`. (Observation 1.1.1)
   - **Step 2**: An authenticated client calling `supabase.from('profiles').insert({ id: auth.uid(), system_role: 'superadmin' })` triggers the `insert` event, not `update`. (Observation 1.1.1)
   - **Step 3**: The RLS insert policy checks `auth.uid() = id` and does not check `system_role`. (Observation 1.1.1)
   - **Step 4**: The insert succeeds, allowing self-elevation to `superadmin` or `admin`.
   - **Step 5**: Changing the trigger to `before insert or update` without adapting the plpgsql function logic would cause `(old.system_role is distinct from new.system_role)` to evaluate to `NULL is distinct from 'user'`, which is `true`, breaking ordinary new user registration.
   - **Conclusion**: The trigger must hook `BEFORE INSERT OR UPDATE`, and the function must use `TG_OP` to validate that new users cannot insert `system_role <> 'user'`, and existing users cannot alter `system_role` on update unless caller is an admin or service_role.

2. **Information Disclosure in `get_admin_overview_metrics()`**:
   - **Step 1**: The function `get_admin_overview_metrics()` is created with `SECURITY DEFINER`. (Observation 1.1.2)
   - **Step 2**: In Postgres, public execute privileges are granted to `PUBLIC` by default on new functions unless revoked. (Observation 1.1.2)
   - **Step 3**: There is no check inside the function body for caller role or user permissions. (Observation 1.1.2)
   - **Step 4**: Any anonymous user can invoke `/rest/v1/rpc/get_admin_overview_metrics` and extract confidential revenue, user counts, and moderation statistics.
   - **Conclusion**: The function must enforce `if auth.role() <> 'service_role' and not public.is_system_admin(auth.uid()) then raise exception ...` and revoke execution from `PUBLIC` and `anon`.

3. **`space_settings` CRUD Query Failure**:
   - **Step 1**: `public.space_settings` has primary key `space_id` and has no `id` column. (Observation 1.2.1)
   - **Step 2**: `crud/[entity]/[id]/route.ts` hardcodes `.eq('id', id)`. (Observation 1.2.1)
   - **Step 3**: Calling GET, PATCH, or DELETE on `space_settings/[id]` generates a SQL query with `where id = ...`.
   - **Step 4**: Postgres fails with `column space_settings.id does not exist`.
   - **Conclusion**: `crud/[entity]/[id]/route.ts` must use `space_id` as the filter column when `entity === 'space_settings'`.

4. **10 Entity Mutation Failures Due to Nonexistent `updated_at`**:
   - **Step 1**: `crud/[entity]/[id]/route.ts` executes `.update({ ...body, updated_at: new Date().toISOString() })`. (Observation 1.2.2)
   - **Step 2**: 10 of the 15 whitelisted tables lack an `updated_at` column in the database schema. (Observation 1.2.2)
   - **Step 3**: Updating any record in these 10 tables fails with `column "updated_at" of relation "<entity>" does not exist`.
   - **Conclusion**: `crud/[entity]/[id]/route.ts` must only inject `updated_at` if the target entity schema contains that column.

5. **`space_roles` Ordering Crash**:
   - **Step 1**: `space_roles` contains no `created_at` or `updated_at` column. (Observation 1.2.3)
   - **Step 2**: `adminClient.ts` and `crud/[entity]/route.ts` fall back to `sortBy = 'created_at'`. (Observation 1.2.3)
   - **Step 3**: Querying `space_roles` via the CRUD Explorer produces `column space_roles.created_at does not exist` and HTTP 500.
   - **Conclusion**: `space_roles` must default to ordering by `priority` or `name` in both client and route handler.

6. **Filter Syntax & Range Inefficiencies**:
   - **Step 1**: PostgREST uses `,` as a delimiter in `.or()`. An unescaped search term with commas disrupts the parser. (Observation 1.3.1)
   - **Step 2**: Parsing a date input string with `new Date("YYYY-MM-DD").toISOString()` produces midnight UTC at the start of that day, causing `lte('created_at', endDate)` to exclude all events that occurred on that day. (Observation 1.3.2)
   - **Conclusion**: Search terms in `.or()` must sanitize commas, and `endDate` must extend to the end of the day (`23:59:59.999Z`).

---

## 3. Caveats

- **No Caveats on Local Code Analysis**: All files listed in the dispatch mandate were inspected directly in the workspace.
- **Environment Dependency**: Live database execution was not performed as tests run in mocked offline Vitest mode in accordance with project constraints.

---

## 4. Conclusion

The admin dashboard architecture is cleanly structured with modular Neo-brutalist UI components, strict vector SVG iconography, and comprehensive rate limiting. However, 7 distinct functional, security, and schema integration defects were identified:

1. **Privilege Escalation**: `guard_profile_system_role_trg` does not guard `INSERT` on `public.profiles`.
2. **Information Disclosure & Privilege Hijacking**: `get_admin_overview_metrics()` is publicly callable over PostgREST without auth checks, and `SECURITY DEFINER` functions omit `SET search_path = public, pg_temp`.
3. **Missing DB Covering Indexes**: High-scale metrics aggregation queries lack indexes on `profiles(created_at)`, `user_subscriptions(status)`, `billing_invoices(status, amount_cents)`, and `ai_usage(usage_date)`.
4. **CRUD Route PK Mismatch**: `crud/[entity]/[id]/route.ts` hardcodes `.eq('id', id)`, breaking all operations on `space_settings`.
5. **Nonexistent `updated_at` Injection**: `crud/[entity]/[id]/route.ts` injects `updated_at` into 10 tables that do not have this column, preventing updates.
6. **`space_roles` Ordering Failure**: `adminClient.ts` and `crud/[entity]/route.ts` default to `created_at`, which does not exist on `space_roles`.
7. **PostgREST Filter Breaking & Date Range Truncation**: Search terms containing commas break PostgREST `.or()`, and `endDate` truncates at 00:00:00 UTC.

---

## 5. Verification Method

### 5.1 Test Suites Execution
Run the full test suite and linter to establish baseline and verify future fixes:
```bash
# 1. Run full test suite across all 52 test files (660 tests)
npm --prefix next-app test -- --run

# 2. Run ESLint across next-app
npm --prefix next-app run lint

# 3. Targeted execution of admin unit & integration tests
npx vitest run tests/admin_guard.test.ts tests/api/admin_*.test.ts
```

### 5.2 Verification Files to Inspect
1. `supabase/migrations/20261109_admin_dashboard_backend.sql` & `supabase/schema.sql`:
   - Verify `guard_profile_system_role()` handles both `TG_OP = 'INSERT'` and `TG_OP = 'UPDATE'`.
   - Verify `get_admin_overview_metrics()` checks `auth.role() = 'service_role' or public.is_system_admin(auth.uid())`.
   - Verify `search_path = public, pg_temp` is set on both `is_system_admin` and `get_admin_overview_metrics`.
   - Verify covering indexes exist for `created_at`, `status`, and `usage_date`.
2. `next-app/src/app/api/admin/crud/[entity]/[id]/route.ts`:
   - Verify PK uses `space_id` when `entity === 'space_settings'`.
   - Verify `updated_at` is only injected for tables that possess it.
3. `next-app/src/lib/services/adminClient.ts` & `next-app/src/app/api/admin/crud/[entity]/route.ts`:
   - Verify `space_roles` defaults to sorting by `priority` instead of `created_at`.
4. `next-app/src/app/api/admin/users/route.ts` & `logs/route.ts`:
   - Verify search inputs sanitize commas before passing to `.or()`.
5. `next-app/src/app/admin/components/LogsTab.tsx`:
   - Verify `endDate` is converted to end of day (`23:59:59.999Z`).

---

### 5.3 Detailed Proposed Patches

#### A. Database Trigger Fix (`supabase/migrations/20261109_admin_dashboard_backend.sql` & `supabase/schema.sql`)
```sql
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
```

#### B. RPC Security & Indexes Fix (`supabase/migrations/20261109_admin_dashboard_backend.sql` & `supabase/schema.sql`)
```sql
create or replace function public.is_system_admin(p_user_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id and system_role in ('admin', 'superadmin')
  );
$$;

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

-- Covering indexes
create index if not exists idx_profiles_created_at on public.profiles(created_at desc);
create index if not exists idx_user_subscriptions_status on public.user_subscriptions(status);
create index if not exists idx_billing_invoices_status_amount on public.billing_invoices(status, amount_cents);
create index if not exists idx_ai_usage_usage_date on public.ai_usage(usage_date);
```

#### C. CRUD Route Fix (`next-app/src/app/api/admin/crud/[entity]/[id]/route.ts`)
```ts
const pkColumn = entity === 'space_settings' ? 'space_id' : 'id';

// GET
const { data: record, error } = await (auth.supabaseAdmin.from(entity as any) as any)
  .select('*')
  .eq(pkColumn, id)
  .single();

// PATCH
const hasUpdatedAt = ['spaces', 'space_settings', 'user_reports', 'ai_companions', 'user_subscriptions'].includes(entity);
const updates = hasUpdatedAt ? { ...body, updated_at: new Date().toISOString() } : { ...body };

const { data: updatedRecord, error: updateErr } = await (auth.supabaseAdmin.from(entity as any) as any)
  .update(updates)
  .eq(pkColumn, id)
  .select()
  .single();

// DELETE
const { error: deleteErr } = await (auth.supabaseAdmin.from(entity as any) as any)
  .delete()
  .eq(pkColumn, id);
```

# Database Schema & Row-Level Security (RLS) RAG

## 1. Schema Hierarchy

All tables reside in PostgreSQL schema `public`:

```
auth.users (Supabase Auth)
  └── public.profiles (User Profiles & Guest Profiles)
        ├── public.spaces (Virtual spaces created or owned)
        │     ├── public.space_members (Role: owner, admin, member)
        │     ├── public.space_invites (Invite codes & join codes)
        │     └── public.messages (Chat messages scoped to room_id)
        └── public.direct_messages (1-on-1 direct messages)
```

---

## 2. Ephemeral Guest Session Architecture

Guests are provisioned via PostgreSQL Security Definer RPC:
```sql
public.provision_guest_account(p_display_name text, p_password text, p_avatar_config jsonb)
```
- Creates an authentic record in `auth.users` with `is_guest = true`.
- Creates a profile in `public.profiles`.
- Signs the guest in with standard Supabase JWT credentials.
- **Consequence**: Guests are fully authenticated users with a real `auth.uid()`, granting them valid RLS access to read and write messages in public or joined spaces.

---

## 3. The `public.messages` Table

```sql
create table if not exists public.messages (
  id uuid default gen_random_uuid() primary key,
  room_id text not null,
  space_id uuid references public.spaces(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete set null not null,
  content text not null,
  attachments jsonb not null default '[]'::jsonb,
  reply_to_id uuid references public.messages(id) on delete set null,
  is_edited boolean not null default false,
  is_pinned boolean not null default false,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);
```

### RLS Policies on `messages`
1. **Read (`select`)**:
   ```sql
   public.is_member_of_space(space_id)
   or exists (select 1 from public.spaces s where s.id = space_id and s.visibility = 'public')
   ```
2. **Insert (`insert`)**:
   ```sql
   auth.uid() = sender_id
   and (
     public.is_member_of_space(space_id)
     or exists (select 1 from public.spaces s where s.id = space_id and s.visibility = 'public')
   )
   ```
3. **Delete (`delete`)**:
   ```sql
   auth.uid() = sender_id or public.is_admin_of_space(space_id)
   ```

---

## 4. Realtime Publication Rules

Only tables requiring cross-client notification are registered in `supabase_realtime`:
```sql
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.direct_messages;
```
- Tables containing high-frequency movement coordinates (`(x, y)`) MUST NOT be added to `supabase_realtime` to prevent database WAL saturation.

-- ==========================================================
-- SPACE MEMBER ROLE GUARD (2026-11-07)
-- Security fix: the space_members INSERT policy never constrained `role`, so any
-- authenticated user (guests included) could join a public space with
-- role = 'owner' / 'admin' and pass is_admin_of_space() — kicking members,
-- deleting chat, editing rooms/world objects, banning, etc.
--
--   1. INSERT policy: public-space joins must be role 'member'; the space owner
--      may add themself as 'member' or 'owner'.
--   2. BEFORE INSERT/UPDATE trigger (defense in depth, mirrors
--      guard_space_billing_columns): for client roles, role is forced to
--      'owner' for the space owner and 'member' for everyone else, role_id is
--      cleared on insert, and role / role_id can never be changed by an update.
--      SECURITY DEFINER code (e.g. join_space_via_invite) is unaffected.
--   3. CHECK constraint on allowed role values (NOT VALID: enforced for new and
--      updated rows, existing rows are left untouched).
--
-- Idempotent and non-destructive: safe to re-run. No existing rows are changed.
--
-- Follow-up audit (read-only) for roles that may already have been self-granted:
--   select m.space_id, m.user_id, m.role, s.owner_id
--   from public.space_members m join public.spaces s on s.id = m.space_id
--   where m.role in ('owner', 'admin') and m.user_id <> s.owner_id;
-- ==========================================================

-- 1. Tighten the INSERT policy.
drop policy if exists "Users can join public spaces or with invites" on public.space_members;
create policy "Users can join public spaces or with invites" on public.space_members
  for insert with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.spaces s
      where s.id = space_id
        and (
          (s.visibility = 'public' and role = 'member')
          or (s.owner_id = (select auth.uid()) and role in ('member', 'owner'))
        )
    )
  );

-- 2. Role guard trigger. Runs as the invoker (not SECURITY DEFINER) so that
-- current_user reflects the API role; the owner lookup therefore only succeeds
-- for spaces the caller can actually see as owner, which fails safe to 'member'.
create or replace function public.guard_space_member_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if exists (
      select 1 from public.spaces s
      where s.id = new.space_id and s.owner_id = auth.uid() and new.user_id = auth.uid()
    ) then
      new.role := case when new.role = 'member' then 'member' else 'owner' end;
    else
      new.role := 'member';
    end if;
    new.role_id := null;
  else
    new.role := old.role;
    new.role_id := old.role_id;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_space_member_role on public.space_members;
create trigger guard_space_member_role
  before insert or update on public.space_members
  for each row execute function public.guard_space_member_role();

-- 3. Allowed role values.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'space_members_role_check'
      and conrelid = 'public.space_members'::regclass
  ) then
    alter table public.space_members
      add constraint space_members_role_check
      check (role in ('owner', 'admin', 'moderator', 'member', 'guest')) not valid;
  end if;
end $$;

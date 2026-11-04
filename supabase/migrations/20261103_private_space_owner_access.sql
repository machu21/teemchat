-- ==========================================================
-- PRIVATE SPACE OWNER ACCESS (2026-11-03)
-- Owners are not inserted into space_members when they create a space, so in a
-- private space the member-only policies (messages, rooms, world_objects,
-- space_members, space_invites) locked the owner out of their own space.
-- is_member_of_space now also counts the space's owner. Invited users still
-- become members through join_space_via_invite.
-- Idempotent: safe to re-run.
-- ==========================================================

create or replace function public.is_member_of_space(_space_id uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.space_members
    where space_id = _space_id and user_id = auth.uid()
  )
  or exists (
    select 1 from public.spaces
    where id = _space_id and owner_id = auth.uid()
  );
$$;

-- ==========================================================
-- WAVE 1 COLLABORATION (2026-11-11)
-- ----------------------------------------------------------
-- * whiteboard_sessions writes: banned / chat-muted players become read-only,
--   and a board must belong to a whiteboard object in the same space.
-- * world_objects: visitors of unlisted spaces can see placed objects (boards).
-- * profiles.status already accepts 'focus' (no check constraint on it).
-- Idempotent. Depends on private.has_space_restriction (20261110_safety_family_mode.sql).
-- ==========================================================

drop policy if exists "Space members can edit whiteboards" on public.whiteboard_sessions;
create policy "Space members can edit whiteboards" on public.whiteboard_sessions
  for all
  using (
    (
      public.is_member_of_space(space_id)
      or exists (
        select 1 from public.spaces s
        where s.id = whiteboard_sessions.space_id and s.visibility in ('public', 'unlisted')
      )
    )
    and not private.has_space_restriction(space_id, (select auth.uid()), 'ban')
    and not private.has_space_restriction(space_id, (select auth.uid()), 'chat')
  )
  with check (
    (
      public.is_member_of_space(space_id)
      or exists (
        select 1 from public.spaces s
        where s.id = whiteboard_sessions.space_id and s.visibility in ('public', 'unlisted')
      )
    )
    and not private.has_space_restriction(space_id, (select auth.uid()), 'ban')
    and not private.has_space_restriction(space_id, (select auth.uid()), 'chat')
    and exists (
      select 1 from public.world_objects o
      where o.id = whiteboard_sessions.world_object_id
        and o.space_id = whiteboard_sessions.space_id
        and o.object_type = 'whiteboard'
    )
  );

drop policy if exists "World objects are viewable by space viewers" on public.world_objects;
create policy "World objects are viewable by space viewers" on public.world_objects
  for select using (
    public.is_member_of_space(space_id)
    or exists (
      select 1 from public.spaces s
      where s.id = world_objects.space_id and s.visibility in ('public', 'unlisted')
    )
  );

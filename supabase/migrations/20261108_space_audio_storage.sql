-- ==========================================================
-- SPACE AUDIO STORAGE BUCKET + PLAYLIST UPDATE POLICY
-- ----------------------------------------------------------
-- PlaylistService.uploadTrack uploads MP3s to the `space-audio`
-- bucket at `<space_id>/<track_id>.mp3`, but the bucket was never
-- created. Uploads failed silently and space_playlists.audio_url
-- stored a tab-local `blob:` URL that dies on reload / in other
-- browsers. This creates the bucket, scopes storage.objects RLS to
-- it, and lets a track's creator (or the space owner) repair a
-- track's audio_url. Idempotent; no data is dropped.
-- ==========================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('space-audio', 'space-audio', true, 26214400, array['audio/mpeg', 'audio/mp3'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Uploader must own the space, or be a member of it (path's first folder = space id).
drop policy if exists "space-audio read" on storage.objects;
create policy "space-audio read" on storage.objects
  for select using (bucket_id = 'space-audio');

drop policy if exists "space-audio insert by space members" on storage.objects;
create policy "space-audio insert by space members" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'space-audio'
    and exists (
      select 1 from public.spaces s
      where s.id::text = (storage.foldername(name))[1]
        and (
          s.owner_id = auth.uid()
          or exists (
            select 1 from public.space_members m
            where m.space_id = s.id and m.user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "space-audio update by uploader or space owner" on storage.objects;
create policy "space-audio update by uploader or space owner" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'space-audio'
    and (
      owner_id = auth.uid()::text
      or exists (
        select 1 from public.spaces s
        where s.id::text = (storage.foldername(name))[1] and s.owner_id = auth.uid()
      )
    )
  );

drop policy if exists "space-audio delete by uploader or space owner" on storage.objects;
create policy "space-audio delete by uploader or space owner" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'space-audio'
    and (
      owner_id = auth.uid()::text
      or exists (
        select 1 from public.spaces s
        where s.id::text = (storage.foldername(name))[1] and s.owner_id = auth.uid()
      )
    )
  );

-- Let the creator / space owner repair a track's audio_url (self-heal of blob: rows).
drop policy if exists "Creators or space owners can update playlist tracks" on public.space_playlists;
create policy "Creators or space owners can update playlist tracks" on public.space_playlists
  for update
  using (auth.uid() = created_by or auth.uid() in (select owner_id from public.spaces where id = space_id))
  with check (auth.uid() = created_by or auth.uid() in (select owner_id from public.spaces where id = space_id));

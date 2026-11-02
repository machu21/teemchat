-- ==========================================================
-- CRITICAL ACCESS FIXES (2026-11-02)
-- 1. Invite codes are no longer readable by everyone; lookups go through
--    resolve_space_invite (SECURITY DEFINER), which only returns the space.
-- 2. Companion memory RPCs only return memories of the caller's own companion,
--    and memories can only be written to a companion the caller owns.
-- 3. Friendships can only exist on top of an accepted friend request, and only
--    the receiver can change a request's status.
-- 4. Guest provisioning is throttled per client IP and globally, and its inputs
--    are bounded.
-- 5. The legacy 3-arg guest provisioner (unthrottled) is removed.
-- 6. accept_friend_request exists so accepting creates the friendship.
-- Idempotent: safe to re-run.
-- ==========================================================

-- 1. Space invites: only the space's members / owner can list its codes.
drop policy if exists "Anyone can inspect valid invite code" on public.space_invites;
drop policy if exists "Members can view space invites" on public.space_invites;
create policy "Members can view space invites" on public.space_invites
  for select using (
    public.is_member_of_space(space_id)
    or exists (select 1 from public.spaces s where s.id = space_id and s.owner_id = auth.uid())
  );

-- 2. Companion memories: scope the SECURITY DEFINER RPCs to the caller.
create or replace function public.match_companion_memories(
  p_companion_id uuid,
  p_query_embedding vector(768),
  p_match_count int default 6,
  p_min_similarity float default 0.65
)
returns table (
  id uuid,
  memory_key text,
  memory_value text,
  category text,
  importance_score float,
  similarity float,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cm.id,
    cm.memory_key,
    cm.memory_value,
    cm.category,
    cm.importance_score,
    1 - (cm.embedding <=> p_query_embedding) as similarity,
    cm.created_at
  from public.companion_memories cm
  join public.ai_companions c on c.id = cm.companion_id
  where
    cm.companion_id = p_companion_id
    and c.user_id = auth.uid()
    and cm.embedding is not null
    and 1 - (cm.embedding <=> p_query_embedding) >= p_min_similarity
  order by cm.embedding <=> p_query_embedding
  limit least(greatest(p_match_count, 0), 50);
$$;

create or replace function public.get_recent_companion_memories(
  p_companion_id uuid,
  p_limit int default 10
)
returns table (
  id uuid,
  memory_key text,
  memory_value text,
  category text,
  importance_score float,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cm.id,
    cm.memory_key,
    cm.memory_value,
    cm.category,
    cm.importance_score,
    cm.created_at
  from public.companion_memories cm
  join public.ai_companions c on c.id = cm.companion_id
  where cm.companion_id = p_companion_id
    and c.user_id = auth.uid()
  order by cm.importance_score desc, cm.created_at desc
  limit least(greatest(p_limit, 0), 50);
$$;

revoke execute on function public.match_companion_memories(uuid, vector, int, float) from public, anon;
revoke execute on function public.get_recent_companion_memories(uuid, int) from public, anon;
grant execute on function public.match_companion_memories(uuid, vector, int, float) to authenticated;
grant execute on function public.get_recent_companion_memories(uuid, int) to authenticated;

drop policy if exists "Users can insert their companion memories" on public.companion_memories;
create policy "Users can insert their companion memories" on public.companion_memories
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.ai_companions c
      where c.id = companion_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update their companion memories" on public.companion_memories;
create policy "Users can update their companion memories" on public.companion_memories
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.ai_companions c
      where c.id = companion_id and c.user_id = auth.uid()
    )
  );

-- 3. Friendships require an accepted request (accept_friend_request inserts them
--    as SECURITY DEFINER, so this only blocks direct client inserts).
drop policy if exists "Users can insert friendships" on public.friendships;
create policy "Users can insert friendships" on public.friendships
  for insert with check (
    auth.uid() in (user_one, user_two)
    and exists (
      select 1 from public.friend_requests fr
      where fr.status = 'accepted'
        and (
          (fr.sender_id = user_one and fr.receiver_id = user_two)
          or (fr.sender_id = user_two and fr.receiver_id = user_one)
        )
    )
  );

-- Only the receiver answers a request; senders withdraw by deleting it.
drop policy if exists "Receivers or senders can update request status" on public.friend_requests;
drop policy if exists "Receivers can update request status" on public.friend_requests;
create policy "Receivers can update request status" on public.friend_requests
  for update using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);

-- Requests are always created as pending.
drop policy if exists "Users can send friend requests" on public.friend_requests;
create policy "Users can send friend requests" on public.friend_requests
  for insert with check (auth.uid() = sender_id and status = 'pending');

-- 4. Guest provisioning throttle.
-- RLS on with no policies: only SECURITY DEFINER functions can touch it.
create table if not exists public.guest_provision_log (
  id bigint generated always as identity primary key,
  client_ip text not null,
  created_at timestamptz not null default now()
);
alter table public.guest_provision_log enable row level security;
create index if not exists idx_guest_provision_log_ip_created
  on public.guest_provision_log (client_ip, created_at desc);
create index if not exists idx_guest_provision_log_created
  on public.guest_provision_log (created_at desc);

create or replace function public.provision_guest_account(
  p_display_name text,
  p_password text,
  p_avatar_config jsonb default '{}'::jsonb,
  p_gender text default 'male',
  p_username text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid := gen_random_uuid();
  v_headers json;
  v_ip text;
  v_base text;
  v_username text;
  v_display_name text;
  v_email text;
  v_encrypted_pw text;
  v_gender text;
  v_attempt int := 0;
begin
  -- Client IP as seen by the API gateway (Cloudflare sets cf-connecting-ip).
  v_headers := nullif(current_setting('request.headers', true), '')::json;
  v_ip := coalesce(
    nullif(v_headers->>'cf-connecting-ip', ''),
    nullif(v_headers->>'x-real-ip', ''),
    nullif(btrim(split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1)), ''),
    'unknown'
  );

  -- Serialize throttle checks per IP so concurrent calls cannot overshoot.
  perform pg_advisory_xact_lock(hashtext('guest_provision:' || v_ip));

  if (select count(*) from public.guest_provision_log
      where client_ip = v_ip and created_at > now() - interval '15 minutes') >= 10 then
    raise exception 'Too many guest sessions from this network. Please try again later.'
      using errcode = 'P0429';
  end if;

  if (select count(*) from public.guest_provision_log
      where created_at > now() - interval '1 minute') >= 300 then
    raise exception 'Guest sign-ups are temporarily busy. Please try again shortly.'
      using errcode = 'P0429';
  end if;

  delete from public.guest_provision_log where created_at < now() - interval '1 day';
  insert into public.guest_provision_log (client_ip) values (v_ip);

  if p_password is null or length(p_password) < 12 or length(p_password) > 128 then
    raise exception 'Invalid guest credentials' using errcode = '22023';
  end if;

  v_gender := lower(coalesce(nullif(p_gender, ''), 'male'));
  if v_gender not in ('male', 'female') then
    v_gender := 'male';
  end if;

  v_display_name := left(coalesce(nullif(btrim(p_display_name), ''), 'Explorer'), 32);

  if p_avatar_config is null or jsonb_typeof(p_avatar_config) <> 'object'
     or length(p_avatar_config::text) > 4096 then
    p_avatar_config := '{}'::jsonb;
  end if;

  v_base := left(lower(regexp_replace(coalesce(p_username, ''), '[^a-zA-Z0-9_]', '', 'g')), 24);
  if length(v_base) < 3 then
    v_base := 'guest_' || floor(random() * 9000 + 1000)::int;
  end if;

  -- Pick a free username, retrying with fresh discriminators on collision.
  v_username := v_base;
  while exists (select 1 from public.profiles where username = v_username)
     or exists (select 1 from auth.users where email = v_username || '@guest.teemchat.local') loop
    v_attempt := v_attempt + 1;
    if v_attempt > 8 then
      v_username := 'guest_' || replace(gen_random_uuid()::text, '-', '');
      exit;
    end if;
    v_username := v_base || '_' || floor(random() * 90000 + 10000)::int;
  end loop;

  v_email := v_username || '@guest.teemchat.local';
  v_encrypted_pw := crypt(p_password, gen_salt('bf'));

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    phone, phone_change, phone_change_token, email_change_token_current,
    reauthentication_token, raw_app_meta_data, raw_user_meta_data, is_anonymous,
    created_at, updated_at
  ) values (
    v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email, v_encrypted_pw, now(),
    '', '', '', '',
    null, '', '', '',
    '',
    jsonb_build_object('provider', 'email', 'providers', array['email'], 'is_guest', true),
    jsonb_build_object('display_name', v_display_name, 'username', v_username, 'is_guest', true, 'gender', v_gender),
    false,
    now(), now()
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email',
    v_user_id::text,
    now(), now(), now()
  );

  insert into public.profiles (
    id, username, display_name, gender, avatar_config, is_paid, tier, has_ai_companion, created_at, updated_at
  ) values (
    v_user_id, v_username, v_display_name, v_gender, p_avatar_config, false, 'free', false, now(), now()
  )
  on conflict (id) do update set
    username = excluded.username,
    display_name = excluded.display_name,
    avatar_config = excluded.avatar_config,
    gender = excluded.gender;

  return jsonb_build_object(
    'user_id', v_user_id,
    'email', v_email,
    'username', v_username,
    'display_name', v_display_name,
    'gender', v_gender
  );
end;
$$;

grant execute on function public.provision_guest_account(text, text, jsonb, text, text) to anon, authenticated;

-- 5. Remove the legacy 3-argument guest provisioner: it is still anon-callable on
--    older databases and would bypass the throttle above. The app uses the 5-arg form.
drop function if exists public.provision_guest_account(text, text, jsonb);
drop function if exists public.provision_guest_account(text, text, jsonb, text);

-- 6. Accepting a request creates the friendship server-side (friendships cannot be
--    inserted directly by clients). Only the receiver of a pending request can accept.
create or replace function public.accept_friend_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.friend_requests;
begin
  select * into v_req from public.friend_requests
  where id = p_request_id and receiver_id = auth.uid() and status in ('pending', 'accepted')
  for update;
  if v_req.id is null then
    return false;
  end if;

  update public.friend_requests
  set status = 'accepted', updated_at = now()
  where id = p_request_id;

  insert into public.friendships(user_one, user_two)
  values (least(v_req.sender_id, v_req.receiver_id), greatest(v_req.sender_id, v_req.receiver_id))
  on conflict (user_one, user_two) do nothing;

  return true;
end;
$$;

revoke execute on function public.accept_friend_request(uuid) from public, anon;
grant execute on function public.accept_friend_request(uuid) to authenticated;

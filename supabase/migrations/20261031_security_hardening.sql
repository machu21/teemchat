-- ==========================================================
-- SECURITY HARDENING (2026-10-31)
-- 1. Billing columns on profiles can only be changed server-side.
-- 2. profiles.is_paid is derived from user_subscriptions (Stripe webhook).
-- 3. cleanup_guest_user is no longer callable by clients.
-- 4-6. Close self-join RLS gaps (groups, private spaces) and guard space tier/capacity.
-- Idempotent: safe to re-run.
-- ==========================================================

-- 1. Guard billing columns against client writes.
-- Client requests run as 'anon' / 'authenticated'; triggers and SECURITY DEFINER
-- functions run as the owner, and the webhook runs as 'service_role'.
create or replace function public.guard_profile_billing_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_paid := false;
    new.tier := 'free';
    new.has_ai_companion := false;
  else
    new.is_paid := old.is_paid;
    new.tier := old.tier;
    new.has_ai_companion := old.has_ai_companion;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_billing_columns on public.profiles;
create trigger guard_profile_billing_columns
  before insert or update on public.profiles
  for each row execute function public.guard_profile_billing_columns();

-- 2. Keep profiles.is_paid in sync with the Stripe-managed subscription row.
create or replace function public.sync_profile_paid_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active boolean;
begin
  if tg_op = 'DELETE' then
    update public.profiles set is_paid = false, tier = 'free' where id = old.user_id;
    return old;
  end if;

  v_active := new.status in ('active', 'trialing');
  update public.profiles
  set is_paid = v_active,
      tier = case when v_active then 'paid' else 'free' end
  where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists sync_profile_paid_status on public.user_subscriptions;
create trigger sync_profile_paid_status
  after insert or update of status or delete on public.user_subscriptions
  for each row execute function public.sync_profile_paid_status();

-- Backfill: reset any self-granted paid flags to match real subscriptions.
update public.profiles p
set is_paid = exists (
      select 1 from public.user_subscriptions s
      where s.user_id = p.id and s.status in ('active', 'trialing')
    ),
    tier = case when exists (
      select 1 from public.user_subscriptions s
      where s.user_id = p.id and s.status in ('active', 'trialing')
    ) then 'paid' else 'free' end;

-- 3. Clients must not delete arbitrary guest accounts by id.
-- Guests remove themselves via delete_guest_account(); server code uses service_role.
revoke execute on function public.cleanup_guest_user(uuid) from public, anon, authenticated;

-- 4. Group membership: only the group's creator or an existing member may add rows.
-- (created_by covers the creator's initial batch insert, where is_member_of_group
-- cannot yet see the rows being inserted.)
drop policy if exists "Users can add group members or join" on public.group_conversation_members;
create policy "Users can add group members or join" on public.group_conversation_members
  for insert with check (
    public.is_member_of_group(conversation_id)
    or exists (
      select 1 from public.group_conversations g
      where g.id = conversation_id and g.created_by = auth.uid()
    )
  );

-- 5. Space membership: direct joins only for public spaces or the owner.
-- Private/unlisted spaces are joined through join_space_via_invite (SECURITY DEFINER).
drop policy if exists "Users can join public spaces or with invites" on public.space_members;
create policy "Users can join public spaces or with invites" on public.space_members
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.spaces s
      where s.id = space_id and (s.visibility = 'public' or s.owner_id = auth.uid())
    )
  );

-- Playlists no longer leak space ids of spaces the viewer cannot see.
drop policy if exists "Playlists are viewable by everyone" on public.space_playlists;
create policy "Playlists are viewable by everyone" on public.space_playlists
  for select using (exists (select 1 from public.spaces s where s.id = space_id));

-- 6. Space tier/capacity can only be raised server-side.
create or replace function public.guard_space_billing_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.tier := 'free';
    new.max_capacity := least(coalesce(new.max_capacity, 15), 50);
  else
    new.tier := old.tier;
    new.max_capacity := old.max_capacity;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_space_billing_columns on public.spaces;
create trigger guard_space_billing_columns
  before insert or update on public.spaces
  for each row execute function public.guard_space_billing_columns();

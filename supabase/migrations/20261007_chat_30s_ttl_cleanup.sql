-- Migration: 20261007_chat_30s_ttl_cleanup.sql
-- Description: Hard remove messages older than 30 seconds automatically via PostgreSQL trigger

create or replace function public.purge_expired_messages()
returns trigger
language plpgsql
security definer
as $$
begin
  delete from public.messages
  where created_at < now() - interval '30 seconds';
  return new;
end;
$$;

drop trigger if exists trg_purge_expired_messages on public.messages;
create trigger trg_purge_expired_messages
after insert on public.messages
for each statement
execute function public.purge_expired_messages();

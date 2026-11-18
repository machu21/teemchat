-- Migration: 20261117_e2ee_crypto_keys.sql
-- Description: End-to-End Encryption (E2EE) cryptographic public keys and zero-knowledge private key backups

-- 1. Public key column on profiles for fast key discovery in chat and space interactions
alter table public.profiles add column if not exists public_key text;

-- 2. Zero-knowledge encrypted private key backup table (strictly readable only by owner)
create table if not exists public.user_crypto_backups (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  public_key text not null,
  encrypted_private_key text not null,
  key_salt text not null,
  key_iv text not null,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.user_crypto_backups enable row level security;

drop policy if exists "Users can only read their own crypto backup" on public.user_crypto_backups;
create policy "Users can only read their own crypto backup" on public.user_crypto_backups
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own crypto backup" on public.user_crypto_backups;
create policy "Users can insert their own crypto backup" on public.user_crypto_backups
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own crypto backup" on public.user_crypto_backups;
create policy "Users can update their own crypto backup" on public.user_crypto_backups
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own crypto backup" on public.user_crypto_backups;
create policy "Users can delete their own crypto backup" on public.user_crypto_backups
  for delete using (auth.uid() = user_id);


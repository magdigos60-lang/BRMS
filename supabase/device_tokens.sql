-- Run this once in Supabase > SQL Editor
-- NOTE: if your users.id column is not uuid (e.g. bigint), change user_id's type to match.
create table if not exists device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token text not null unique,
  platform text default 'android',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists device_tokens_user_idx on device_tokens(user_id);

-- DO NOT RUN (archived). Legacy SQL: re-opens direct anon writes and breaks v054_close_writes. For a new DB see README, section sql/.
-- v0.33: site login via the bot (t.me/upl30_bot?start=login_<token>)
-- Run the whole file in Supabase SQL Editor.

create table if not exists public.tg_logins (
  token      text primary key,
  created_at timestamptz not null default now(),
  tg_id      bigint not null,
  first_name text,
  last_name  text,
  username   text,
  used       boolean not null default false
);
-- server only (bot and /api/auth with the service key): no client policies
alter table public.tg_logins enable row level security;

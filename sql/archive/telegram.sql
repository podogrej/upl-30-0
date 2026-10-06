-- DO NOT RUN (archived). Legacy SQL: re-opens direct anon writes and breaks v054_close_writes. For a new DB see README, section sql/.
-- v0.18: Telegram player id and profile name
-- Run the whole file in Supabase SQL Editor.

alter table public.seasons       add column if not exists tg_user_id bigint;
alter table public.seasons       add column if not exists tg_name    text;
alter table public.daily_results add column if not exists tg_user_id bigint;
alter table public.daily_results add column if not exists tg_name    text;

create index if not exists seasons_tg_idx on public.seasons (tg_user_id, created_at desc);

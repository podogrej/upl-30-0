-- НЕ ЗАПУСКАТИ (архів, 0.67). Старий SQL: відкриває пряму запис для anon і зламає крок 2 (v054_close_writes). Для нової бази — README, розділ sql/.
-- 30-0 УПЛ · v0.18 · Telegram: хто зіграв (id і ім'я з профілю Telegram)
-- Вставити цілком у Supabase → SQL Editor → Run

alter table public.seasons       add column if not exists tg_user_id bigint;
alter table public.seasons       add column if not exists tg_name    text;
alter table public.daily_results add column if not exists tg_user_id bigint;
alter table public.daily_results add column if not exists tg_name    text;

create index if not exists seasons_tg_idx on public.seasons (tg_user_id, created_at desc);

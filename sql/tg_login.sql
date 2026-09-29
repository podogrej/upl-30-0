-- 30-0 УПЛ · v0.33 · вхід на сайт через бота (t.me/upl30_bot?start=login_<токен>)
-- Вставити цілком у Supabase → SQL Editor → Run

create table if not exists public.tg_logins (
  token      text primary key,
  created_at timestamptz not null default now(),
  tg_id      bigint not null,
  first_name text,
  last_name  text,
  username   text,
  used       boolean not null default false
);
-- доступ лише серверу (бот і /api/auth із секретним ключем): політик для браузера немає
alter table public.tg_logins enable row level security;

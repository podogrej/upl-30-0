-- 30-0 УПЛ · v0.25 · ліги груп Telegram
-- Вставити цілком у Supabase → SQL Editor → Run

create table if not exists public.leagues (
  chat_id    bigint primary key,          -- id групи Telegram
  title      text not null,
  created_by bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.league_members (
  chat_id    bigint not null references public.leagues(chat_id) on delete cascade,
  tg_user_id bigint not null,
  name       text,
  joined_at  timestamptz not null default now(),
  primary key (chat_id, tg_user_id)
);
create index if not exists league_members_user_idx on public.league_members (tg_user_id);

create table if not exists public.league_results (
  chat_id    bigint not null references public.leagues(chat_id) on delete cascade,
  day        date not null,
  tg_user_id bigint not null,
  name       text,
  w int, d int, l int, pts int, place int, gf int, ga int,
  xp real, formation text, trophies text[], season_id bigint,
  created_at timestamptz not null default now(),
  primary key (chat_id, day, tg_user_id)
);

create table if not exists public.league_boards (
  chat_id      bigint not null references public.leagues(chat_id) on delete cascade,
  day          date not null,
  message_id   bigint,
  summary_sent boolean not null default false,
  primary key (chat_id, day)
);

-- писати може лише сервер (ключ у Vercel); читати таблиці ліг можна всім (імена й очки)
alter table public.leagues        enable row level security;
alter table public.league_members enable row level security;
alter table public.league_results enable row level security;
alter table public.league_boards  enable row level security;
drop policy if exists "leagues read" on public.leagues;
create policy "leagues read" on public.leagues for select to anon, authenticated using (true);
drop policy if exists "league results read" on public.league_results;
create policy "league results read" on public.league_results for select to anon, authenticated using (true);

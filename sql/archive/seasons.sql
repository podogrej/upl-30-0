-- DO NOT RUN (archived). Legacy SQL: re-opens direct anon writes and breaks v054_close_writes. For a new DB see README, section sql/.
-- v0.13: log of all played seasons
-- Run the whole file in Supabase SQL Editor.

create table if not exists public.seasons (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  device_id   uuid not null,
  nickname    text,
  mode        text not null,
  format      text not null,
  club        text,
  formation   text not null,
  year        int,
  seed        bigint,
  version     text,
  w int, d int, l int, pts int, place int, gf int, ga int,
  xp real, xg real, xga real,
  tier        text,
  perfect     boolean not null default false,
  practice    boolean not null default false,
  day         date,
  xi          jsonb,
  tbl         jsonb
);

create index if not exists seasons_top_idx on public.seasons (format, practice, pts desc, place);
create index if not exists seasons_day_idx on public.seasons (day, device_id);
create index if not exists seasons_device_idx on public.seasons (device_id, created_at desc);

alter table public.seasons enable row level security;

drop policy if exists "seasons read" on public.seasons;
create policy "seasons read" on public.seasons for select to anon using (true);

drop policy if exists "seasons insert" on public.seasons;
create policy "seasons insert" on public.seasons for insert to anon
  with check (w + d + l = 30 and pts = w * 3 + d and place between 1 and 16);

-- nick may be set after submission to the daily table; only this column is updatable
drop policy if exists "seasons nick" on public.seasons;
create policy "seasons nick" on public.seasons for update to anon using (true) with check (true);
revoke update on public.seasons from anon;
grant update (nickname) on public.seasons to anon;

-- counters for the home page
create or replace function public.game_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'seasons',   (select count(*) from seasons),
    'players',   (select count(distinct device_id) from seasons),
    'champions', (select count(*) from seasons where place = 1 and not practice and format <> 'anti'),
    'unbeaten',  (select count(*) from seasons where place = 1 and l = 0 and not practice and format <> 'anti'),
    'perfect',   (select count(*) from seasons where perfect and not practice and format <> 'anti'),
    'anti',      (select count(*) from seasons where format = 'anti' and l = 30 and not practice)
  );
$$;
grant execute on function public.game_stats() to anon;

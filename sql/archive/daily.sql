-- DO NOT RUN (archived). Legacy SQL: re-opens direct anon writes and breaks v054_close_writes. For a new DB see README, section sql/.
-- v0.9: daily challenge table
-- Already exists in the main DB; run only on a NEW (test) DB, before the other files.

create table if not exists public.daily_results (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  day        date not null,
  device_id  uuid not null,
  nickname   text not null check (length(nickname) between 2 and 24),
  formation  text,
  w int, d int, l int, pts int, place int, gf int, ga int,
  xp         real,
  xi         jsonb,
  unique (day, device_id)
);
create index if not exists daily_top_idx on public.daily_results (day, pts desc);

alter table public.daily_results enable row level security;
drop policy if exists "daily read" on public.daily_results;
create policy "daily read" on public.daily_results for select to anon using (true);
drop policy if exists "daily insert" on public.daily_results;
create policy "daily insert" on public.daily_results for insert to anon
  with check (day between (now() at time zone 'Europe/Kyiv')::date - 1 and (now() at time zone 'Europe/Kyiv')::date
              and w + d + l = 30 and pts = w * 3 + d);

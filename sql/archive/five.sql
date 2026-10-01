-- НЕ ЗАПУСКАТИ (архів, 0.67). Старий SQL: відкриває пряму запис для anon і зламає крок 2 (v054_close_writes). Для нової бази — README, розділ sql/.
-- 30-0 УПЛ · v0.38 · 5×5 онлайн: кімнати, учасники, піки
-- Вставити цілком у Supabase → SQL Editor → Run

create table if not exists public.f5_rooms (
  id          text primary key,
  created_at  timestamptz not null default now(),
  seed        bigint not null,
  mode        text not null check (mode in ('turns','solo')),
  max_players int  not null default 10 check (max_players between 2 and 10),
  status      text not null default 'lobby' check (status in ('lobby','draft','done')),
  players_n   int,
  host_device uuid
);
create table if not exists public.f5_players (
  room_id    text not null references public.f5_rooms(id) on delete cascade,
  seat       int  not null check (seat between 0 and 9),
  device_id  uuid not null,
  name       text not null,
  team       text,
  form       text not null,
  joined_at  timestamptz not null default now(),
  primary key (room_id, seat),
  unique (room_id, device_id)
);
create table if not exists public.f5_picks (
  room_id    text not null references public.f5_rooms(id) on delete cascade,
  seat       int  not null,
  k          int  not null check (k between 0 and 4),   -- номер піку цього гравця
  n          int  not null,                               -- загальний номер піку (для «по черзі»)
  club_idx   int  not null,
  person_id  text not null,
  slot_idx   int  not null,
  ptr        int  not null default 0,                     -- позиція в спільній послідовності колеса після цього піку
  created_at timestamptz not null default now(),
  primary key (room_id, seat, k)
);
create unique index if not exists f5_picks_turn_n on public.f5_picks (room_id, n);

alter table public.f5_rooms   enable row level security;
alter table public.f5_players enable row level security;
alter table public.f5_picks   enable row level security;

drop policy if exists "f5 rooms read" on public.f5_rooms;
create policy "f5 rooms read" on public.f5_rooms for select to anon, authenticated using (true);
drop policy if exists "f5 rooms insert" on public.f5_rooms;
create policy "f5 rooms insert" on public.f5_rooms for insert to anon, authenticated with check (length(id) between 5 and 12 and status = 'lobby');
drop policy if exists "f5 rooms update" on public.f5_rooms;
create policy "f5 rooms update" on public.f5_rooms for update to anon, authenticated using (true) with check (status in ('lobby','draft','done'));

drop policy if exists "f5 players read" on public.f5_players;
create policy "f5 players read" on public.f5_players for select to anon, authenticated using (true);
drop policy if exists "f5 players insert" on public.f5_players;
create policy "f5 players insert" on public.f5_players for insert to anon, authenticated
  with check (length(name) between 1 and 24 and exists (select 1 from public.f5_rooms r where r.id = room_id and r.status = 'lobby' and seat < r.max_players));

drop policy if exists "f5 picks read" on public.f5_picks;
create policy "f5 picks read" on public.f5_picks for select to anon, authenticated using (true);
drop policy if exists "f5 picks insert" on public.f5_picks;
create policy "f5 picks insert" on public.f5_picks for insert to anon, authenticated
  with check (exists (select 1 from public.f5_rooms r where r.id = room_id and r.status = 'draft'));

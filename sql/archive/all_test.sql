-- DO NOT RUN (archived). Legacy SQL: re-opens direct anon writes and breaks v054_close_writes. For a new DB see README, section sql/.
-- v0.39: TEST DB, full schema from scratch in one file (all project SQL in order)
-- Only for a NEW empty DB (upl-30-0-test). Not for the main DB; use v039_prod.sql there.
-- Run the whole file in Supabase SQL Editor.

-- ===================== seasons.sql =====================
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

-- ===================== daily.sql =====================
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

-- ===================== telegram.sql =====================
-- v0.18: Telegram player id and profile name
-- Run the whole file in Supabase SQL Editor.

alter table public.seasons       add column if not exists tg_user_id bigint;
alter table public.seasons       add column if not exists tg_name    text;
alter table public.daily_results add column if not exists tg_user_id bigint;
alter table public.daily_results add column if not exists tg_name    text;

create index if not exists seasons_tg_idx on public.seasons (tg_user_id, created_at desc);

-- ===================== trophies.sql =====================
-- v0.19: unlocked trophies per player (for trophy share %)
-- Run the whole file in Supabase SQL Editor.

alter table public.seasons add column if not exists golden boolean;

create table if not exists public.trophies (
  device_id  uuid not null,
  trophy     text not null,
  tg_user_id bigint,
  tg_name    text,
  created_at timestamptz not null default now(),
  primary key (device_id, trophy)
);

alter table public.trophies enable row level security;
drop policy if exists "trophies read" on public.trophies;
create policy "trophies read" on public.trophies for select to anon using (true);
drop policy if exists "trophies insert" on public.trophies;
create policy "trophies insert" on public.trophies for insert to anon with check (length(trophy) <= 24);

-- number of players per unlocked trophy
create or replace function public.trophy_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'players', (select count(distinct device_id) from seasons where not practice),
    't', coalesce((select json_object_agg(trophy, n) from (select trophy, count(*) n from trophies group by trophy) x), '{}'::json)
  );
$$;
grant execute on function public.trophy_stats() to anon;

-- ===================== accounts.sql =====================
-- v0.20: optional accounts (Google / Telegram)
-- Run the whole file in Supabase SQL Editor.

-- player state (trophies, streak, records, nick), one row per account
create table if not exists public.user_state (
  user_id    uuid primary key references auth.users on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_state enable row level security;
drop policy if exists "own state" on public.user_state;
create policy "own state" on public.user_state for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- link results to an account
alter table public.seasons       add column if not exists user_id uuid;
alter table public.daily_results add column if not exists user_id uuid;
alter table public.trophies      add column if not exists user_id uuid;
create index if not exists seasons_user_idx on public.seasons (user_id, created_at desc);
create unique index if not exists daily_one_per_user on public.daily_results (day, user_id) where user_id is not null;

-- user_id is set server-side, so the client cannot spoof another user
create or replace function public.set_user_id() returns trigger language plpgsql security definer set search_path = public as $$
begin new.user_id := auth.uid(); return new; end $$;
drop trigger if exists seasons_uid on public.seasons;
create trigger seasons_uid before insert on public.seasons for each row execute function public.set_user_id();
drop trigger if exists daily_uid on public.daily_results;
create trigger daily_uid before insert on public.daily_results for each row execute function public.set_user_id();
drop trigger if exists trophies_uid on public.trophies;
create trigger trophies_uid before insert on public.trophies for each row execute function public.set_user_id();

-- same grants for the authenticated role as for anon
drop policy if exists "seasons read auth" on public.seasons;
create policy "seasons read auth" on public.seasons for select to authenticated using (true);
drop policy if exists "seasons insert auth" on public.seasons;
create policy "seasons insert auth" on public.seasons for insert to authenticated
  with check (w + d + l = 30 and pts = w * 3 + d and place between 1 and 16);
drop policy if exists "seasons nick auth" on public.seasons;
create policy "seasons nick auth" on public.seasons for update to authenticated using (user_id is null or user_id = auth.uid());
grant update (nickname) on public.seasons to authenticated;

drop policy if exists "daily read auth" on public.daily_results;
create policy "daily read auth" on public.daily_results for select to authenticated using (true);
drop policy if exists "daily insert auth" on public.daily_results;
create policy "daily insert auth" on public.daily_results for insert to authenticated
  with check (day between (now() at time zone 'Europe/Kyiv')::date - 1 and (now() at time zone 'Europe/Kyiv')::date);

drop policy if exists "trophies read auth" on public.trophies;
create policy "trophies read auth" on public.trophies for select to authenticated using (true);
drop policy if exists "trophies insert auth" on public.trophies;
create policy "trophies insert auth" on public.trophies for insert to authenticated with check (length(trophy) <= 24);

-- on sign-in: move this device's pre-login results to the account
create or replace function public.claim_device(p_device uuid) returns void language sql security definer set search_path = public as $$
  update seasons       set user_id = auth.uid() where device_id = p_device and user_id is null and auth.uid() is not null;
  update daily_results set user_id = auth.uid() where device_id = p_device and user_id is null and auth.uid() is not null;
  update trophies      set user_id = auth.uid() where device_id = p_device and user_id is null and auth.uid() is not null;
$$;
revoke execute on function public.claim_device(uuid) from anon;
grant execute on function public.claim_device(uuid) to authenticated;

-- trophy share ("X% of players"): a player = an account or an account-less device
create or replace function public.trophy_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'players', (select count(distinct coalesce(user_id::text, device_id::text)) from seasons where not practice),
    't', coalesce((select json_object_agg(trophy, n) from (select trophy, count(distinct coalesce(user_id::text, device_id::text)) n from trophies group by trophy) x), '{}'::json)
  );
$$;
grant execute on function public.trophy_stats() to anon, authenticated;
grant execute on function public.game_stats() to authenticated;

-- ===================== leagues.sql =====================
-- v0.25: Telegram group leagues
-- Run the whole file in Supabase SQL Editor.

create table if not exists public.leagues (
  chat_id    bigint primary key,          -- Telegram group id
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

-- writes: server only (service key); reads: public (names and points)
alter table public.leagues        enable row level security;
alter table public.league_members enable row level security;
alter table public.league_results enable row level security;
alter table public.league_boards  enable row level security;
drop policy if exists "leagues read" on public.leagues;
create policy "leagues read" on public.leagues for select to anon, authenticated using (true);
drop policy if exists "league results read" on public.league_results;
create policy "league results read" on public.league_results for select to anon, authenticated using (true);

-- ===================== challenges.sql =====================
-- v0.28: "beat my score" challenges + weekly league summary
-- Run the whole file in Supabase SQL Editor.

create table if not exists public.challenges (
  id         text primary key,
  created_at timestamptz not null default now(),
  device_id  uuid,
  user_id    uuid,
  name       text,
  seed       bigint not null,
  formation  text not null,
  year       int not null,
  mode       text not null,
  w int, d int, l int, pts int, place int, gf int, ga int
);
create table if not exists public.challenge_results (
  challenge_id text not null references public.challenges(id) on delete cascade,
  device_id    uuid not null,
  user_id      uuid,
  name         text,
  w int, d int, l int, pts int, place int, gf int, ga int,
  created_at   timestamptz not null default now(),
  primary key (challenge_id, device_id)
);
alter table public.challenges        enable row level security;
alter table public.challenge_results enable row level security;
drop policy if exists "chal read" on public.challenges;
create policy "chal read" on public.challenges for select to anon, authenticated using (true);
drop policy if exists "chal insert" on public.challenges;
create policy "chal insert" on public.challenges for insert to anon, authenticated
  with check (length(id) between 6 and 12 and w + d + l = 30 and pts = w * 3 + d and place between 1 and 16);
drop policy if exists "chal res read" on public.challenge_results;
create policy "chal res read" on public.challenge_results for select to anon, authenticated using (true);
drop policy if exists "chal res insert" on public.challenge_results;
create policy "chal res insert" on public.challenge_results for insert to anon, authenticated
  with check (w + d + l = 30 and pts = w * 3 + d and place between 1 and 16);
drop trigger if exists chal_uid on public.challenges;
create trigger chal_uid before insert on public.challenges for each row execute function public.set_user_id();
drop trigger if exists chal_res_uid on public.challenge_results;
create trigger chal_res_uid before insert on public.challenge_results for each row execute function public.set_user_id();

-- weekly league summary: already-sent marker
alter table public.league_boards add column if not exists weekly_sent boolean not null default false;

-- ===================== anticheat.sql =====================
-- v0.29: anti-cheat, server issues seeds and verifies seasons
-- Run the whole file in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- issued seeds (server only: no anon policies)
create table if not exists public.season_seeds (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  device_id  uuid not null,
  xi_hash    text not null,
  seed       bigint not null,
  day        date not null,
  daily      boolean not null default false,
  official   boolean not null default false,
  formation  text, mode text, format text, year int,
  used_by    bigint
);
create index if not exists season_seeds_daily_idx on public.season_seeds (device_id, day) where daily;
alter table public.season_seeds enable row level security;

alter table public.seasons       add column if not exists seed_id     uuid;
alter table public.seasons       add column if not exists verified    boolean;
alter table public.seasons       add column if not exists verify_note text;
alter table public.daily_results add column if not exists verified    boolean;
create index if not exists seasons_verified_top_idx on public.seasons (format, verified, pts desc) where verified;

-- only the server may set the verified flag
create or replace function public.strip_verified() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'UPDATE' then
      new.verified := old.verified;
      if tg_table_name = 'seasons' then new.verify_note := old.verify_note; end if;
    else
      new.verified := null;
      if tg_table_name = 'seasons' then new.verify_note := null; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists seasons_strip_verified on public.seasons;
create trigger seasons_strip_verified before insert or update on public.seasons for each row execute function public.strip_verified();
drop trigger if exists daily_strip_verified on public.daily_results;
create trigger daily_strip_verified before insert or update on public.daily_results for each row execute function public.strip_verified();

-- ===================== tg_login.sql =====================
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

-- ===================== five.sql =====================
-- v0.38: online 5x5, rooms, members, picks
-- Run the whole file in Supabase SQL Editor.

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
  k          int  not null check (k between 0 and 4),   -- pick index of this player
  n          int  not null,                               -- global pick index (for alternating turns)
  club_idx   int  not null,
  person_id  text not null,
  slot_idx   int  not null,
  ptr        int  not null default 0,                     -- position in the shared wheel sequence after this pick
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

-- ===================== players.sql =====================
-- v0.39: unified player, one person = one player row; devices and logins (Google, Telegram) link to it
-- Run the whole file in Supabase SQL Editor. Idempotent.

create extension if not exists pgcrypto;

-- ---------- players (public: id and names) ----------
create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text check (name is null or length(name) between 2 and 24),
  anon_name   text not null,
  merged_into uuid references public.players(id),
  deleted_at  timestamptz
);
alter table public.players enable row level security;
drop policy if exists "players read" on public.players;
create policy "players read" on public.players for select to anon, authenticated using (true);

-- ---------- links (private: server and the functions below only) ----------
-- kind: device (key = device_id), auth = Google/Telegram account (key = auth user id), tg = Telegram id
create table if not exists public.player_links (
  kind        text not null check (kind in ('device','auth','tg')),
  key         text not null,
  player_id   uuid not null references public.players(id),
  secret_hash text,
  created_at  timestamptz not null default now(),
  primary key (kind, key)
);
create index if not exists player_links_player_idx on public.player_links (player_id);
alter table public.player_links enable row level security;

-- ---------- anonymous name, e.g. "Silent Owl" ----------
create or replace function public.anon_name() returns text language sql volatile as $$
  select (array['Silent','Swift','Clever','Brave','Lucky','Sneaky','Calm','Bold','Quiet','Wild','Sharp','Happy',
                'Mighty','Rapid','Hidden','Golden','Cosmic','Stormy','Sunny','Frosty','Nimble','Fearless','Curious','Steady'])[1 + floor(random() * 24)::int]
      || ' ' ||
         (array['Owl','Fox','Wolf','Bear','Lynx','Hawk','Otter','Badger','Eagle','Stork','Heron','Beaver',
                'Falcon','Raven','Bison','Hare','Moose','Panther','Tiger','Dolphin','Hedgehog','Squirrel','Marten','Crane'])[1 + floor(random() * 24)::int];
$$;

-- player for this device; creates one for a new device
create or replace function public.player_for_device(p_device uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if p_device is null then return null; end if;
  select player_id into pid from player_links where kind = 'device' and key = p_device::text;
  if pid is null then
    insert into players (anon_name) values (public.anon_name()) returning id into pid;
    insert into player_links (kind, key, player_id) values ('device', p_device::text, pid) on conflict (kind, key) do nothing;
    select player_id into pid from player_links where kind = 'device' and key = p_device::text;
  end if;
  return pid;
end $$;

create or replace function public.player_for_auth(p_uid uuid) returns uuid language sql volatile security definer set search_path = public as $$
  select player_id from player_links where kind = 'auth' and key = p_uid::text;
$$;

-- ---------- player_id in all result tables (set by the DB, not the client) ----------
alter table public.seasons           add column if not exists player_id uuid references public.players(id);
alter table public.daily_results     add column if not exists player_id uuid references public.players(id);
alter table public.trophies          add column if not exists player_id uuid references public.players(id);
alter table public.challenges        add column if not exists player_id uuid references public.players(id);
alter table public.challenge_results add column if not exists player_id uuid references public.players(id);
alter table public.f5_players        add column if not exists player_id uuid references public.players(id);
alter table public.league_results    add column if not exists player_id uuid references public.players(id);
alter table public.league_members    add column if not exists player_id uuid references public.players(id);
create index if not exists seasons_player_idx on public.seasons (player_id, created_at desc);
create index if not exists daily_player_idx   on public.daily_results (player_id);

-- championship (reserved for other leagues), data version, goal difference for table sorting
alter table public.seasons       add column if not exists competition  text not null default 'upl';
alter table public.daily_results add column if not exists competition  text not null default 'upl';
alter table public.challenges    add column if not exists competition  text not null default 'upl';
alter table public.seasons       add column if not exists data_version text;
alter table public.seasons       add column if not exists gd int generated always as (gf - ga) stored;
create index if not exists seasons_board_idx on public.seasons (competition, format, verified, pts desc, place, gd desc, gf desc, created_at) where verified;

create or replace function public.set_player_from_device() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.player_id := coalesce(public.player_for_auth(auth.uid()), public.player_for_device(new.device_id));
  return new;
end $$;
create or replace function public.set_player_from_tg() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.player_id := (select player_id from player_links where kind = 'tg' and key = new.tg_user_id::text);
  return new;
end $$;

drop trigger if exists seasons_pid on public.seasons;
create trigger seasons_pid before insert on public.seasons for each row execute function public.set_player_from_device();
drop trigger if exists daily_pid on public.daily_results;
create trigger daily_pid before insert on public.daily_results for each row execute function public.set_player_from_device();
drop trigger if exists trophies_pid on public.trophies;
create trigger trophies_pid before insert on public.trophies for each row execute function public.set_player_from_device();
drop trigger if exists chal_pid on public.challenges;
create trigger chal_pid before insert on public.challenges for each row execute function public.set_player_from_device();
drop trigger if exists chal_res_pid on public.challenge_results;
create trigger chal_res_pid before insert on public.challenge_results for each row execute function public.set_player_from_device();
drop trigger if exists f5_players_pid on public.f5_players;
create trigger f5_players_pid before insert on public.f5_players for each row execute function public.set_player_from_device();
drop trigger if exists league_results_pid on public.league_results;
create trigger league_results_pid before insert on public.league_results for each row execute function public.set_player_from_tg();
drop trigger if exists league_members_pid on public.league_members;
create trigger league_members_pid before insert on public.league_members for each row execute function public.set_player_from_tg();

-- ---------- merge two players into one (account login from a new device) ----------
create or replace function public.merge_players(p_src uuid, p_dst uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_src is null or p_dst is null or p_src = p_dst then return; end if;
  update player_links      set player_id = p_dst where player_id = p_src;
  update seasons           set player_id = p_dst where player_id = p_src;
  update daily_results     set player_id = p_dst where player_id = p_src;
  update trophies          set player_id = p_dst where player_id = p_src;
  update challenges        set player_id = p_dst where player_id = p_src;
  update challenge_results set player_id = p_dst where player_id = p_src;
  update f5_players        set player_id = p_dst where player_id = p_src;
  update league_results    set player_id = p_dst where player_id = p_src;
  update league_members    set player_id = p_dst where player_id = p_src;
  update players d set name = coalesce(d.name, s.name) from players s where d.id = p_dst and s.id = p_src;
  update players set merged_into = p_dst where id = p_src;
end $$;

-- device secret check: device_id is public in tables, so acting as a device requires its secret.
-- First caller with a secret pins it (devices created before 0.39).
create or replace function public.device_check(p_device uuid, p_secret text) returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid; h text; want text;
begin
  if p_device is null or length(coalesce(p_secret, '')) < 16 then raise exception 'device?' using errcode = '22023'; end if;
  pid := public.player_for_device(p_device);
  want := encode(sha256(convert_to(p_secret, 'UTF8')), 'hex');
  select secret_hash into h from player_links where kind = 'device' and key = p_device::text;
  if h is null then update player_links set secret_hash = want where kind = 'device' and key = p_device::text;
  elsif h <> want then raise exception 'device secret' using errcode = '28000'; end if;
  return pid;
end $$;

-- volatile, not stable: otherwise a player created in the same query is not visible
create or replace function public.player_json(p_id uuid) returns json language sql volatile security definer set search_path = public as $$
  select json_build_object('id', id, 'name', name, 'anon_name', anon_name) from players where id = p_id;
$$;

-- ---------- RPCs called by the game ----------
-- hello: resolve the player for this device
create or replace function public.player_hello(p_device uuid, p_secret text) returns json language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  pid := public.device_check(p_device, p_secret);
  return public.player_json(pid);
end $$;

-- rename (empty = revert to anonymous name)
create or replace function public.set_player_name(p_device uuid, p_secret text, p_name text) returns json language plpgsql security definer set search_path = public as $$
declare pid uuid; nm text := nullif(btrim(coalesce(p_name, '')), '');
begin
  pid := public.device_check(p_device, p_secret);
  if nm is not null and length(nm) not between 2 and 24 then raise exception 'name length' using errcode = '22023'; end if;
  update players set name = nm where id = pid;
  return public.player_json(pid);
end $$;

-- after sign-in: device and account become one player; merge if the account already had one
create or replace function public.link_account(p_device uuid, p_secret text) returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); dev uuid; acc uuid; tgid text;
begin
  if uid is null then raise exception 'login?' using errcode = '28000'; end if;
  dev := public.device_check(p_device, p_secret);
  acc := public.player_for_auth(uid);
  if acc is null then
    insert into player_links (kind, key, player_id) values ('auth', uid::text, dev) on conflict (kind, key) do nothing;
    acc := public.player_for_auth(uid);
  end if;
  if acc <> dev then perform public.merge_players(dev, acc); end if;
  select substring(email from '^tg-(\d+)@users\.') into tgid from auth.users where id = uid;
  if tgid is not null then
    insert into player_links (kind, key, player_id) values ('tg', tgid, acc) on conflict (kind, key) do nothing;
    update league_results set player_id = acc where tg_user_id = tgid::bigint and player_id is null;
    update league_members set player_id = acc where tg_user_id = tgid::bigint and player_id is null;
  end if;
  return public.player_json(acc);
end $$;

revoke execute on function public.player_for_device(uuid)        from public, anon, authenticated;
revoke execute on function public.player_for_auth(uuid)          from public, anon, authenticated;
revoke execute on function public.merge_players(uuid, uuid)      from public, anon, authenticated;
revoke execute on function public.device_check(uuid, text)       from public, anon, authenticated;
revoke execute on function public.player_json(uuid)              from public, anon, authenticated;
revoke execute on function public.link_account(uuid, text)       from public, anon;
grant  execute on function public.player_hello(uuid, text)       to anon, authenticated;
grant  execute on function public.set_player_name(uuid, text, text) to anon, authenticated;
grant  execute on function public.link_account(uuid, text)       to authenticated;

-- ---------- backfill existing results ----------
-- every device that has played gets a player
select public.player_for_device(d) from (
  select device_id d from seasons union select device_id from daily_results union select device_id from trophies
  union select device_id from challenges union select device_id from challenge_results union select device_id from f5_players
) x where d is not null;

update seasons           t set player_id = l.player_id from player_links l where l.kind = 'device' and l.key = t.device_id::text and t.player_id is null;
update daily_results     t set player_id = l.player_id from player_links l where l.kind = 'device' and l.key = t.device_id::text and t.player_id is null;
update trophies          t set player_id = l.player_id from player_links l where l.kind = 'device' and l.key = t.device_id::text and t.player_id is null;
update challenges        t set player_id = l.player_id from player_links l where l.kind = 'device' and l.key = t.device_id::text and t.player_id is null;
update challenge_results t set player_id = l.player_id from player_links l where l.kind = 'device' and l.key = t.device_id::text and t.player_id is null;
update f5_players        t set player_id = l.player_id from player_links l where l.kind = 'device' and l.key = t.device_id::text and t.player_id is null;

-- name: the player's latest nick
update players p set name = x.nick
from (select distinct on (device_id) device_id, btrim(nickname) nick from seasons
      where nickname is not null and length(btrim(nickname)) between 2 and 24 order by device_id, created_at desc) x
join player_links l on l.kind = 'device' and l.key = x.device_id::text
where p.id = l.player_id and p.name is null;

-- account used on several devices: merge into one player
do $$
declare r record; i int;
begin
  for r in select user_id, array_agg(distinct player_id) ps from seasons
           where user_id is not null and player_id is not null group by user_id having count(distinct player_id) > 1 loop
    for i in 2 .. array_length(r.ps, 1) loop perform public.merge_players(r.ps[i], r.ps[1]); end loop;
  end loop;
end $$;
insert into player_links (kind, key, player_id)
select distinct on (user_id) 'auth', user_id::text, player_id from seasons
where user_id is not null and player_id is not null order by user_id, created_at
on conflict (kind, key) do nothing;

-- Telegram accounts: link Telegram id -> player so group leagues resolve the player
insert into player_links (kind, key, player_id)
select 'tg', substring(u.email from '^tg-(\d+)@users\.'), l.player_id
from auth.users u join player_links l on l.kind = 'auth' and l.key = u.id::text
where u.email ~ '^tg-\d+@users\.'
on conflict (kind, key) do nothing;
update league_results t set player_id = l.player_id from player_links l where l.kind = 'tg' and l.key = t.tg_user_id::text and t.player_id is null;
update league_members t set player_id = l.player_id from player_links l where l.kind = 'tg' and l.key = t.tg_user_id::text and t.player_id is null;

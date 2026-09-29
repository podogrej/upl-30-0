-- 30-0 УПЛ · ЧАСТИНА A · лише ТЕСТОВА база (upl-30-0-test): базові таблиці
create table if not exists public.seasons (
  id bigint generated always as identity primary key,
created_at timestamptz not null default now(),
  device_id uuid not null,
  nickname text,
  mode text not null,
  format text not null,
  club text,
  formation text not null,
  year int,
  seed bigint,
  version text,
  w int, d int, l int, pts int, place int, gf int, ga int,
  xp real, xg real, xga real,
  tier text,
  perfect boolean not null default false,
  practice boolean not null default false,
  day date,
  xi jsonb,
  tbl jsonb
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
drop policy if exists "seasons nick" on public.seasons;
create policy "seasons nick" on public.seasons for update to anon using (true) with check (true);
revoke update on public.seasons from anon;
grant update (nickname) on public.seasons to anon;
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
create table if not exists public.daily_results (
  id bigint generated always as identity primary key,
created_at timestamptz not null default now(),
  day date not null,
  device_id uuid not null,
  nickname text not null check (length(nickname) between 2 and 24),
  formation text,
  w int, d int, l int, pts int, place int, gf int, ga int,
  xp real,
  xi jsonb,
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
alter table public.seasons add column if not exists tg_user_id bigint;
alter table public.seasons add column if not exists tg_name text;
alter table public.daily_results add column if not exists tg_user_id bigint;
alter table public.daily_results add column if not exists tg_name text;
create index if not exists seasons_tg_idx on public.seasons (tg_user_id, created_at desc);
alter table public.seasons add column if not exists golden boolean;
create table if not exists public.trophies (
  device_id uuid not null,
  trophy text not null,
  tg_user_id bigint,
  tg_name text,
created_at timestamptz not null default now(),
  primary key (device_id, trophy)
);
alter table public.trophies enable row level security;
drop policy if exists "trophies read" on public.trophies;
create policy "trophies read" on public.trophies for select to anon using (true);
drop policy if exists "trophies insert" on public.trophies;
create policy "trophies insert" on public.trophies for insert to anon with check (length(trophy) <= 24);
create or replace function public.trophy_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'players', (select count(distinct device_id) from seasons where not practice),
    't', coalesce((select json_object_agg(trophy, n) from (select trophy, count(*) n from trophies group by trophy) x), '{}'::json)
  );
$$;
grant execute on function public.trophy_stats() to anon;
create table if not exists public.user_state (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null default '{}'::jsonb,
updated_at timestamptz not null default now()
);
alter table public.user_state enable row level security;
drop policy if exists "own state" on public.user_state;
create policy "own state" on public.user_state for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table public.seasons add column if not exists user_id uuid;
alter table public.daily_results add column if not exists user_id uuid;
alter table public.trophies add column if not exists user_id uuid;
create index if not exists seasons_user_idx on public.seasons (user_id, created_at desc);
create unique index if not exists daily_one_per_user on public.daily_results (day, user_id) where user_id is not null;
create or replace function public.set_user_id() returns trigger language plpgsql security definer set search_path = public as $$
begin new.user_id := auth.uid(); return new; end $$;
drop trigger if exists seasons_uid on public.seasons;
create trigger seasons_uid before insert on public.seasons for each row execute function public.set_user_id();
drop trigger if exists daily_uid on public.daily_results;
create trigger daily_uid before insert on public.daily_results for each row execute function public.set_user_id();
drop trigger if exists trophies_uid on public.trophies;
create trigger trophies_uid before insert on public.trophies for each row execute function public.set_user_id();
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
create or replace function public.claim_device(p_device uuid) returns void language sql security definer set search_path = public as $$
  update seasons       set user_id = auth.uid() where device_id = p_device and user_id is null and auth.uid() is not null;
  update daily_results set user_id = auth.uid() where device_id = p_device and user_id is null and auth.uid() is not null;
  update trophies      set user_id = auth.uid() where device_id = p_device and user_id is null and auth.uid() is not null;
$$;
revoke execute on function public.claim_device(uuid) from anon;
grant execute on function public.claim_device(uuid) to authenticated;
create or replace function public.trophy_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'players', (select count(distinct coalesce(user_id::text, device_id::text)) from seasons where not practice),
    't', coalesce((select json_object_agg(trophy, n) from (select trophy, count(distinct coalesce(user_id::text, device_id::text)) n from trophies group by trophy) x), '{}'::json)
  );
$$;
grant execute on function public.trophy_stats() to anon, authenticated;
grant execute on function public.game_stats() to authenticated;
create table if not exists public.leagues (
  chat_id bigint primary key,
  title text not null,
created_by bigint,
created_at timestamptz not null default now()
);
create table if not exists public.league_members (
  chat_id bigint not null references public.leagues(chat_id) on delete cascade,
  tg_user_id bigint not null,
  name text,
joined_at timestamptz not null default now(),
  primary key (chat_id, tg_user_id)
);
create index if not exists league_members_user_idx on public.league_members (tg_user_id);
create table if not exists public.league_results (
  chat_id bigint not null references public.leagues(chat_id) on delete cascade,
  day date not null,
  tg_user_id bigint not null,
  name text,
  w int, d int, l int, pts int, place int, gf int, ga int,
  xp real, formation text, trophies text[], season_id bigint,
created_at timestamptz not null default now(),
  primary key (chat_id, day, tg_user_id)
);
create table if not exists public.league_boards (
  chat_id bigint not null references public.leagues(chat_id) on delete cascade,
  day date not null,
  message_id bigint,
  summary_sent boolean not null default false,
  primary key (chat_id, day)
);
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.league_results enable row level security;
alter table public.league_boards enable row level security;
drop policy if exists "leagues read" on public.leagues;
create policy "leagues read" on public.leagues for select to anon, authenticated using (true);
drop policy if exists "league results read" on public.league_results;
create policy "league results read" on public.league_results for select to anon, authenticated using (true);
create table if not exists public.challenges (
  id text primary key,
created_at timestamptz not null default now(),
  device_id uuid,
  user_id uuid,
  name text,
  seed bigint not null,
  formation text not null,
  year int not null,
  mode text not null,
  w int, d int, l int, pts int, place int, gf int, ga int
);
create table if not exists public.challenge_results (
  challenge_id text not null references public.challenges(id) on delete cascade,
  device_id uuid not null,
  user_id uuid,
  name text,
  w int, d int, l int, pts int, place int, gf int, ga int,
created_at timestamptz not null default now(),
  primary key (challenge_id, device_id)
);
alter table public.challenges enable row level security;
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
alter table public.league_boards add column if not exists weekly_sent boolean not null default false;
create extension if not exists pgcrypto;
create table if not exists public.season_seeds (
  id uuid primary key default gen_random_uuid(),
created_at timestamptz not null default now(),
  device_id uuid not null,
  xi_hash text not null,
  seed bigint not null,
  day date not null,
  daily boolean not null default false,
  official boolean not null default false,
  formation text, mode text, format text, year int,
  used_by bigint
);
create index if not exists season_seeds_daily_idx on public.season_seeds (device_id, day) where daily;
alter table public.season_seeds enable row level security;
alter table public.seasons add column if not exists seed_id uuid;
alter table public.seasons add column if not exists verified boolean;
alter table public.seasons add column if not exists verify_note text;
alter table public.daily_results add column if not exists verified boolean;
create index if not exists seasons_verified_top_idx on public.seasons (format, verified, pts desc) where verified;
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
create table if not exists public.tg_logins (
  token text primary key,
created_at timestamptz not null default now(),
  tg_id bigint not null,
  first_name text,
  last_name text,
  username text,
  used boolean not null default false
);
alter table public.tg_logins enable row level security;

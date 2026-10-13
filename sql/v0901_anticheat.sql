-- 0.90.1 anti-cheat: server wheel and server season, friend-league attempts on lock, server trophies, name after the first season,
-- IP limits for player_hello / set_player_name, cached game_stats / trophy_stats. Additive and safe to run repeatedly;
-- the 0.90 site keeps working before and after (its seeds simply have kind = null).

-- 1. draft seeds (api/_draft.js): kind 'draft' rows carry the wheel seed, the rules the wheel was issued for and, after lock, the server result
alter table public.season_seeds add column if not exists kind text;
alter table public.season_seeds add column if not exists wheel_seed bigint;
alter table public.season_seeds add column if not exists era text;
alter table public.season_seeds add column if not exists club text;
alter table public.season_seeds add column if not exists rerolls smallint;
alter table public.season_seeds add column if not exists fl_id text;
alter table public.season_seeds add column if not exists chal_id text;
alter table public.season_seeds add column if not exists locked_at timestamptz;
alter table public.season_seeds add column if not exists res jsonb;
create index if not exists season_seeds_draft_day_idx on public.season_seeds (player_id, day) where kind = 'draft';

-- 2. friend-league attempt is written when the squad is locked (an abandoned season still spends the try); the season is linked later
alter table public.fl_entries add column if not exists seed_id uuid;
alter table public.fl_entries alter column season_id drop not null;
create unique index if not exists fl_entries_seed_uq on public.fl_entries (seed_id) where seed_id is not null;

create or replace function public.fl_record_seed(p_seed uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare s season_seeds%rowtype; L fl_leagues%rowtype; v_day date; n int; r jsonb;
begin
  select * into s from season_seeds where id = p_seed;
  if not found or s.kind is distinct from 'draft' or s.fl_id is null or s.locked_at is null or s.res is null or s.player_id is null then return null; end if;
  select try_n into n from fl_entries where seed_id = p_seed;
  if found then return n; end if;
  select * into L from fl_leagues where id = s.fl_id and deleted_at is null;
  if not found or L.fmt <> '11' then return null; end if;
  v_day := (s.locked_at at time zone 'Europe/Kyiv')::date;
  if v_day < L.start_day or v_day >= L.start_day + L.days then return null; end if;
  if s.format <> 'classic' or s.mode <> 'normal' or coalesce(s.era, 'all') <> L.era then return null; end if;
  if not exists (select 1 from fl_members where league_id = L.id and player_id = s.player_id and left_at is null) then return null; end if;
  perform 1 from fl_members where league_id = L.id and player_id = s.player_id for update;   -- one try number per parallel lock
  select count(*) into n from fl_entries where league_id = L.id and player_id = s.player_id and day = v_day;
  if n >= L.tries then return null; end if;
  r := s.res;
  insert into fl_entries (league_id, player_id, day, try_n, season_id, seed_id, pts, w, d, l, gf, ga, place)
    values (L.id, s.player_id, v_day, n + 1, null, p_seed, (r->>'pts')::int, (r->>'w')::int, (r->>'d')::int, (r->>'l')::int,
            (r->>'gf')::int, (r->>'ga')::int, (r->>'place')::int);
  return n + 1;
end $$;
revoke execute on function public.fl_record_seed(uuid) from public, anon, authenticated;
grant execute on function public.fl_record_seed(uuid) to service_role;

-- fl_record (after verification): a try already written on lock is linked to the season; otherwise as before
create or replace function public.fl_record(p_season bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare s seasons%rowtype; L fl_leagues%rowtype; v_day date; n int;
begin
  select * into s from seasons where id = p_season;
  if not found or s.fl_id is null or s.verified is not true or s.practice or s.day is not null then return null; end if;
  if exists (select 1 from fl_entries where season_id = p_season) then return (select try_n from fl_entries where season_id = p_season); end if;
  if s.seed_id is not null then
    update fl_entries set season_id = p_season where seed_id = s.seed_id and season_id is null returning try_n into n;
    if n is not null then return n; end if;
    if exists (select 1 from fl_entries where seed_id = s.seed_id) then return null; end if;
  end if;
  select * into L from fl_leagues where id = s.fl_id and deleted_at is null;
  if not found or L.fmt <> '11' then return null; end if;
  v_day := (s.created_at at time zone 'Europe/Kyiv')::date;
  if v_day < L.start_day or v_day >= L.start_day + L.days then return null; end if;
  if s.format <> 'classic' or s.mode <> 'normal' or coalesce(s.era, 'all') <> L.era then return null; end if;
  if not exists (select 1 from fl_members where league_id = L.id and player_id = s.player_id and left_at is null) then return null; end if;
  select count(*) into n from fl_entries where league_id = L.id and player_id = s.player_id and day = v_day;
  if n >= L.tries then return null; end if;
  insert into fl_entries (league_id, player_id, day, try_n, season_id, seed_id, pts, w, d, l, gf, ga, place)
    values (L.id, s.player_id, v_day, n + 1, s.id, s.seed_id, s.pts, s.w, s.d, s.l, s.gf, s.ga, s.place);
  return n + 1;
end $$;

-- 3. trophies written by the server from a verified season: src = 'srv' (older rows keep src = null)
alter table public.trophies add column if not exists src text;

-- 4. own name only after the first verified season; the automatic first name (Telegram / Google) is not affected
create or replace function public.set_player_name(p_device uuid, p_secret text, p_name text) returns json
language plpgsql security definer set search_path = public as $$
declare pid uuid; nm text; cur players%rowtype; ip text;
begin
  ip := split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1);
  if btrim(ip) <> '' and not public.rate_hit('name:ip:' || btrim(ip), 10) then raise exception 'rate' using errcode = 'P0001'; end if;
  pid := public.device_check(p_device, p_secret);
  select * into cur from players where id = pid for update;
  begin
    nm := public.name_clean(p_name);
  exception when sqlstate '22023' then
    nm := nullif(regexp_replace(lower(btrim(coalesce(p_name, ''))), '\s+', '_', 'g'), '');
    if nm is not null and exists (select 1 from name_reserved r where r.name = nm and r.player_id = pid) then
      null;
    elsif cur.name is null then
      perform public.name_auto_set(pid, p_name); return public.player_json(pid);
    else
      raise;
    end if;
  end;
  if nm is not distinct from public.name_key(cur.name) then
    if nm is not null and cur.name is distinct from nm then update players set name = nm where id = pid; end if;
    return public.player_json(pid);
  end if;
  if nm is not null and not exists (select 1 from name_reserved r where r.name = nm and r.player_id = pid)
     and not exists (select 1 from seasons where player_id = pid and verified is true and not practice) then
    raise exception 'name_season' using errcode = '22023';
  end if;
  if cur.name_changed_at > now() - interval '30 days' then
    raise exception 'name_wait:%', to_char((cur.name_changed_at + interval '30 days') at time zone 'Europe/Kyiv', 'YYYY-MM-DD') using errcode = '22023';
  end if;
  if nm is not null and (exists (select 1 from players where id <> pid and name is not null and merged_into is null and deleted_at is null
                                                          and public.name_key(name) = nm)
                         or exists (select 1 from name_reserved r where r.name = nm and r.player_id <> pid)) then
    raise exception 'name_taken' using errcode = '23505';
  end if;
  begin
    update players set name = nm, name_changed_at = case when cur.name is not null then now() else name_changed_at end where id = pid;
  exception when unique_violation then raise exception 'name_taken' using errcode = '23505';
  end;
  return public.player_json(pid);
end $$;

-- 5. player_hello: per-IP limit (a page load calls it once)
create or replace function public.player_hello(p_device uuid, p_secret text) returns json
language plpgsql security definer set search_path = public as $$
declare pid uuid; ip text;
begin
  ip := split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1);
  if btrim(ip) <> '' and not public.rate_hit('hello:ip:' || btrim(ip), 120) then raise exception 'rate' using errcode = 'P0001'; end if;
  pid := public.device_check(p_device, p_secret);
  return public.player_json(pid);
end $$;

-- 6. home-page counters from a 10-minute cache instead of a full scan per call (anon can call these)
create table if not exists public.stats_cache (k text primary key, v json not null, at timestamptz not null default now());
alter table public.stats_cache enable row level security;
revoke all on public.stats_cache from anon, authenticated;

create or replace function public.game_stats() returns json
language plpgsql security definer set search_path = public as $$
declare v json;
begin
  select c.v into v from stats_cache c where c.k = 'game' and c.at > now() - interval '10 minutes';
  if found then return v; end if;
  select json_build_object(
    'seasons',   (select count(*) from seasons),
    'players',   (select count(distinct coalesce(player_id::text, device_id::text)) from seasons),
    'champions', (select count(*) from seasons where place = 1 and not practice and format <> 'anti'),
    'unbeaten',  (select count(*) from seasons where place = 1 and l = 0 and not practice and format <> 'anti'),
    'perfect',   (select count(*) from seasons where perfect and not practice and format <> 'anti'),
    'anti',      (select count(*) from seasons where format = 'anti' and l = 30 and not practice)) into v;
  insert into stats_cache (k, v, at) values ('game', v, now()) on conflict (k) do update set v = excluded.v, at = excluded.at;
  return v;
end $$;

create or replace function public.trophy_stats() returns json
language plpgsql security definer set search_path = public as $$
declare v json;
begin
  select c.v into v from stats_cache c where c.k = 'trophy' and c.at > now() - interval '10 minutes';
  if found then return v; end if;
  select json_build_object(
    'players', (select count(distinct coalesce(player_id::text, device_id::text)) from seasons where not practice),
    't', coalesce((select json_object_agg(trophy, n) from (select trophy, count(distinct coalesce(player_id::text, device_id::text)) n from trophies group by trophy) x), '{}'::json)) into v;
  insert into stats_cache (k, v, at) values ('trophy', v, now()) on conflict (k) do update set v = excluded.v, at = excluded.at;
  return v;
end $$;
grant execute on function public.game_stats() to anon, authenticated;
grant execute on function public.trophy_stats() to anon, authenticated;

-- 7. automatic first name (Telegram / Google / a typed nick): same per-IP limit as set_player_name
create or replace function public.set_player_auto_name(p_device uuid, p_secret text, p_raw text) returns json
language plpgsql security definer set search_path = public as $$
declare pid uuid; ip text;
begin
  ip := split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1);
  if btrim(ip) <> '' and not public.rate_hit('name:ip:' || btrim(ip), 10) then raise exception 'rate' using errcode = 'P0001'; end if;
  pid := public.device_check(p_device, p_secret);
  perform public.name_auto_set(pid, p_raw);
  return public.player_json(pid);
end $$;

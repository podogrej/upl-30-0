-- v0.53, step 1 of 2: results are written by the server; device ownership is proven by a secret (audit K5, K6, V2, V6).
-- Run on the test DB first (upl-30-0-test), then on the main DB.
-- Idempotent. Older clients (0.52) keep working:
-- the old direct-write policies (seasons/trophies/daily_results/challenges) are dropped only in step 2 (v054_close_writes.sql).
--
-- Contents:
--  1. app_marks: rollout timestamps (cut-off for "old" devices in K6; switch for step 2).
--  2. player_links.secret_set_at, player_links.claimed_from: when the device got its secret and which player it was detached from (K6).
--  3. device_check (same signature): an old secret-less device whose player has history does not take that history (K6, see below).
--  4. device_ok(p_device, p_secret) -> player_id: secret check for the server (/api/save, /api/seed); service_role only.
--  5. legacy_writes_open(): whether /api/seed still accepts requests without a secret (0.52 clients). False after step 2.
--  6. link_account: signing in with a second account on a shared device does not merge two people (V6).
--  7. Unique index "one official daily attempt per device" (V2), only if there are no duplicates; otherwise NOTICE.
--  8. player_id indexes for trophies / challenges / challenge_results.
--
-- Note on daily_results: in the MAIN DB the table is stricter than in new_db_part_A.sql
-- (w,d,l,pts,place,gf,ga are smallint NOT NULL, formation and xi NOT NULL, checks w+d+l=30, pts=3w+d, nickname 2-24 chars;
-- anon policies are named "insert today" / "read all" instead of "daily insert" / "daily read").
-- Table definition files are not changed (additive-only rule). The server (api/verify.js, syncDaily) fills all these fields from the verified season.

-- 1. rollout marks. The first run sets 'v053' and never changes it
create table if not exists public.app_marks (
  key text primary key,
  at timestamptz not null default now()
);
alter table public.app_marks enable row level security;   -- no policies: anon/authenticated can neither read nor write
insert into public.app_marks (key) values ('v053') on conflict (key) do nothing;

-- 2. new link columns
alter table public.player_links add column if not exists secret_set_at timestamptz;
alter table public.player_links add column if not exists claimed_from uuid references public.players(id);

-- 3. whether the player has history (results, name, other links) besides this device itself
create or replace function public.player_has_history(p_player uuid, p_device uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from players where id = p_player and name is not null)
      or exists (select 1 from player_links where player_id = p_player and not (kind = 'device' and key = p_device::text))
      or exists (select 1 from seasons where player_id = p_player)
      or exists (select 1 from daily_results where player_id = p_player)
      or exists (select 1 from trophies where player_id = p_player)
      or exists (select 1 from challenges where player_id = p_player)
      or exists (select 1 from challenge_results where player_id = p_player)
      or exists (select 1 from f5_players where player_id = p_player)
      or exists (select 1 from league_results where player_id = p_player)
      or exists (select 1 from league_members where player_id = p_player);
$$;
revoke execute on function public.player_has_history(uuid, uuid) from public, anon, authenticated;

-- K6. Device without a secret:
--  - link created after this file's first run (new device), or the player has no history -> the secret is simply registered;
--  - link is old (pre-0.53) and the player HAS history -> device_id is public (it is in seasons), so the first caller with a secret may
--    not be the owner. Such a device gets a NEW player; the old history stays with the old player (claimed_from allows manual
--    recovery: select merge_players(claimed_from, player_id), only on a verified request from the real owner).
--    The real owner keeps playing but the old history is not reattached automatically; an attacker
--    gets an empty profile and can neither rename nor merge someone else's history.
create or replace function public.device_check(p_device uuid, p_secret text) returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid; h text; want text; lk_at timestamptz; cut timestamptz; fresh uuid;
begin
  if p_device is null or length(coalesce(p_secret, '')) < 16 then raise exception 'device?' using errcode = '22023'; end if;
  pid := public.player_for_device(p_device);
  want := encode(sha256(convert_to(p_secret, 'UTF8')), 'hex');
  select secret_hash, created_at, player_id into h, lk_at, pid from player_links where kind = 'device' and key = p_device::text for update;
  if h is not null then
    if h <> want then raise exception 'device secret' using errcode = '28000'; end if;
    return pid;
  end if;
  select at into cut from app_marks where key = 'v053';
  if cut is not null and lk_at < cut and public.player_has_history(pid, p_device) then
    insert into players (anon_name) values (public.anon_name()) returning id into fresh;
    update player_links set player_id = fresh, secret_hash = want, secret_set_at = now(), claimed_from = pid
     where kind = 'device' and key = p_device::text;
    return fresh;
  end if;
  update player_links set secret_hash = want, secret_set_at = now() where kind = 'device' and key = p_device::text;
  return pid;
end $$;
revoke execute on function public.device_check(uuid, text) from public, anon, authenticated;

-- 4. device ownership check for the server (service key lives only in Vercel)
create or replace function public.device_ok(p_device uuid, p_secret text) returns uuid language plpgsql security definer set search_path = public as $$
begin
  return public.device_check(p_device, p_secret);
end $$;
revoke execute on function public.device_ok(uuid, text) from public, anon, authenticated;
grant execute on function public.device_ok(uuid, text) to service_role;

-- 5. transition period: /api/seed without a secret (0.52 clients) is allowed until step 2 has run
create or replace function public.legacy_writes_open() returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from app_marks where key = 'v054');
$$;
revoke execute on function public.legacy_writes_open() from public, anon, authenticated;
grant execute on function public.legacy_writes_open() to service_role;

-- 6. V6. Signing in on a device whose player already belongs to ANOTHER account (Google/Telegram): histories are not merged;
--    the device moves to this account's player (first sign-in of the account creates a new player). Nothing is deleted.
--    Device without a foreign account (played anonymously): as before, its history is attached to the account.
create or replace function public.link_account(p_device uuid, p_secret text) returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); dev uuid; acc uuid; tgid text; other boolean;
begin
  if uid is null then raise exception 'login?' using errcode = '28000'; end if;
  dev := public.device_check(p_device, p_secret);
  select substring(email from '^tg-(\d+)@users\.') into tgid from auth.users where id = uid;
  other := exists (select 1 from player_links
                    where player_id = dev and ((kind = 'auth' and key <> uid::text) or (kind = 'tg' and key is distinct from tgid)));
  acc := public.player_for_auth(uid);
  if acc is null then
    if other then insert into players (anon_name) values (public.anon_name()) returning id into acc;
    else acc := dev; end if;
    insert into player_links (kind, key, player_id) values ('auth', uid::text, acc) on conflict (kind, key) do nothing;
    acc := public.player_for_auth(uid);
  end if;
  if acc <> dev then
    if other then update player_links set player_id = acc where kind = 'device' and key = p_device::text;
    else perform public.merge_players(dev, acc); end if;
  end if;
  if tgid is not null then
    insert into player_links (kind, key, player_id) values ('tg', tgid, acc) on conflict (kind, key) do nothing;
    update league_results set player_id = acc where tg_user_id = tgid::bigint and player_id is null;
    update league_members set player_id = acc where tg_user_id = tgid::bigint and player_id is null;
  end if;
  return public.player_json(acc);
end $$;
revoke execute on function public.link_account(uuid, text) from public, anon;
grant execute on function public.link_account(uuid, text) to authenticated;

-- 7. V2. One official daily attempt per device. If duplicates already exist, the index is skipped (no failure) with a NOTICE.
--    List duplicates: select device_id, day, count(*) from season_seeds where daily and official group by 1, 2 having count(*) > 1;
do $$
declare n int;
begin
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'season_seeds_official_uq') then return; end if;
  select count(*) into n from (select 1 from public.season_seeds where daily and official group by device_id, day having count(*) > 1) x;
  if n > 0 then
    raise notice 'season_seeds: % пар (пристрій, день) з кількома офіційними спробами — унікальний індекс НЕ створено', n;
  else
    create unique index season_seeds_official_uq on public.season_seeds (device_id, day) where daily and official;
  end if;
end $$;

-- 8. player_id indexes (player page, player_has_history)
create index if not exists trophies_player_idx on public.trophies (player_id);
create index if not exists challenges_player_idx on public.challenges (player_id);
create index if not exists challenge_results_player_idx on public.challenge_results (player_id);

-- v0.60: "one player": joining two sign-ins via a prompt, merge log, reserved-name exception, newsletter email,
-- "ratings shown" flag on a season, "pick season" mode on the player page (DECISIONS items 2, 4, 12, 16).
-- Run on the test DB first (upl-30-0-test), then on the main DB.
-- Idempotent. 0.59 clients keep working (link_account and player_json only gained fields).
-- No new anon/authenticated write policies: new tables are closed (RLS without policies, no grants); writes only via RPCs
-- that check the device secret and the sign-in.
--
-- Contents:
--  1. merge_log: merge journal (what was moved); unmerge_players(id) reverts a wrong merge (server / SQL Editor only).
--     merge_players_logged(src, dst, reason, prefer_src_name): merge with a journal entry.
--  2. merge_offers + link_account: signing in another way on a device where another sign-in's player with history plays does not merge silently (V6);
--     it returns a "Is this you?" prompt (merge_offer). merge_answer(device, secret, offer, yes) answers it; yes = logged merge.
--  3. name_reserved: per-player exceptions to the name rules. set_player_name lets a player keep their own reserved name.
--  4. player_contacts: newsletter email and opt-in flag (separate closed table, because players is world-readable);
--     set_player_contact(device, secret, email, optin). player_json returns them to the device owner only; delete_player erases them.
--  5. seasons.show_r: the "show player ratings" toggle was on during the draft (tables show a marker next to the result).
--  6. player_profile: "pick season" (mode = 'pick') is a separate mode in best/worst XI.

-- 1. merge journal
create table if not exists public.merge_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  src uuid not null, dst uuid not null, reason text,
  moved jsonb not null default '{}'::jsonb,
  dst_name_before text,
  undone_at timestamptz
);
alter table public.merge_log enable row level security;
revoke all on table public.merge_log from anon, authenticated;

create or replace function public.merge_players_logged(p_src uuid, p_dst uuid, p_reason text, p_prefer_src_name boolean default false)
returns bigint language plpgsql security definer set search_path = public as $$
declare lid bigint; mv jsonb;
begin
  if p_src is null or p_dst is null or p_src = p_dst then return null; end if;
  mv := jsonb_build_object(
    'player_links',      coalesce((select jsonb_agg(jsonb_build_array(kind, key)) from player_links where player_id = p_src), '[]'),
    'seasons',           coalesce((select jsonb_agg(id) from seasons where player_id = p_src), '[]'),
    'daily_results',     coalesce((select jsonb_agg(id) from daily_results where player_id = p_src), '[]'),
    'trophies',          coalesce((select jsonb_agg(jsonb_build_array(device_id, trophy)) from trophies where player_id = p_src), '[]'),
    'challenges',        coalesce((select jsonb_agg(id) from challenges where player_id = p_src), '[]'),
    'challenge_results', coalesce((select jsonb_agg(jsonb_build_array(challenge_id, device_id)) from challenge_results where player_id = p_src), '[]'),
    'f5_players',        coalesce((select jsonb_agg(jsonb_build_array(room_id, seat)) from f5_players where player_id = p_src), '[]'),
    'league_results',    coalesce((select jsonb_agg(jsonb_build_array(chat_id, day, tg_user_id)) from league_results where player_id = p_src), '[]'),
    'league_members',    coalesce((select jsonb_agg(jsonb_build_array(chat_id, tg_user_id)) from league_members where player_id = p_src), '[]'));
  insert into merge_log (src, dst, reason, moved, dst_name_before)
    values (p_src, p_dst, left(p_reason, 200), mv, (select name from players where id = p_dst)) returning id into lid;
  -- a new account without history takes the old player's name (otherwise a name just filled from Google/Telegram would overwrite the chosen one)
  if p_prefer_src_name and exists (select 1 from players where id = p_src and name is not null) then
    update players set name = null where id = p_dst;
  end if;
  perform public.merge_players(p_src, p_dst);
  if not exists (select 1 from player_contacts where player_id = p_dst) then update player_contacts set player_id = p_dst where player_id = p_src; end if;
  return lid;
end $$;
revoke execute on function public.merge_players_logged(uuid, uuid, text, boolean) from public, anon, authenticated;

-- revert a merge from its journal entry: everything moved goes back to the old player, who becomes live again
create or replace function public.unmerge_players(p_log bigint) returns text language plpgsql security definer set search_path = public as $$
declare L merge_log%rowtype; x jsonb;
begin
  select * into L from merge_log where id = p_log for update;
  if not found then return 'немає такого запису'; end if;
  if L.undone_at is not null then return 'уже відкочено'; end if;
  update players set name = L.dst_name_before where id = L.dst;
  begin
    update players set merged_into = null where id = L.src;
  exception when unique_violation then   -- the old player's name is taken by someone else: restore them with an anonymous name
    update players set name = null, merged_into = null where id = L.src;
  end;
  for x in select * from jsonb_array_elements(L.moved -> 'player_links') loop
    update player_links set player_id = L.src where kind = x ->> 0 and key = x ->> 1 and player_id = L.dst; end loop;
  update seasons set player_id = L.src where player_id = L.dst and id in (select v::bigint from jsonb_array_elements_text(L.moved -> 'seasons') v);
  update daily_results set player_id = L.src where player_id = L.dst and id in (select v::bigint from jsonb_array_elements_text(L.moved -> 'daily_results') v);
  update challenges set player_id = L.src where player_id = L.dst and id in (select v from jsonb_array_elements_text(L.moved -> 'challenges') v);
  for x in select * from jsonb_array_elements(L.moved -> 'trophies') loop
    update trophies set player_id = L.src where device_id = (x ->> 0)::uuid and trophy = x ->> 1 and player_id = L.dst; end loop;
  for x in select * from jsonb_array_elements(L.moved -> 'challenge_results') loop
    update challenge_results set player_id = L.src where challenge_id = x ->> 0 and device_id = (x ->> 1)::uuid and player_id = L.dst; end loop;
  for x in select * from jsonb_array_elements(L.moved -> 'f5_players') loop
    update f5_players set player_id = L.src where room_id = x ->> 0 and seat = (x ->> 1)::int and player_id = L.dst; end loop;
  for x in select * from jsonb_array_elements(L.moved -> 'league_results') loop
    update league_results set player_id = L.src where chat_id = (x ->> 0)::bigint and day = (x ->> 1)::date and tg_user_id = (x ->> 2)::bigint and player_id = L.dst; end loop;
  for x in select * from jsonb_array_elements(L.moved -> 'league_members') loop
    update league_members set player_id = L.src where chat_id = (x ->> 0)::bigint and tg_user_id = (x ->> 1)::bigint and player_id = L.dst; end loop;
  update merge_log set undone_at = now() where id = p_log;
  return 'ok';
end $$;
revoke execute on function public.unmerge_players(bigint) from public, anon, authenticated;

-- 2. "Is this you?" prompt on signing in another way (never merge automatically, ask instead)
create table if not exists public.merge_offers (
  id uuid primary key default gen_random_uuid(),
  src uuid not null,            -- player who already played on this device (other sign-in)
  dst uuid not null,            -- player of the current sign-in
  uid uuid,                     -- sign-in (auth.users) that created the prompt
  created_at timestamptz not null default now(),
  answered_at timestamptz, answer text
);
alter table public.merge_offers enable row level security;
revoke all on table public.merge_offers from anon, authenticated;
create index if not exists merge_offers_dst_idx on public.merge_offers (dst, created_at desc);

-- open prompt for a player (7 days, unanswered, old player still live): {id, name, seasons}
create or replace function public.merge_offer_json(p_dst uuid) returns json language sql stable security definer set search_path = public as $$
  select json_build_object('id', o.id, 'name', public.name_key(coalesce(s.name, s.anon_name)),
                           'seasons', (select count(*) from seasons x where x.player_id = o.src and not x.practice))
    from merge_offers o join players s on s.id = o.src
   where o.dst = p_dst and o.answered_at is null and o.created_at > now() - interval '7 days' and s.merged_into is null and s.deleted_at is null
   order by o.created_at desc limit 1;
$$;
revoke execute on function public.merge_offer_json(uuid) from public, anon, authenticated;

-- link_account (0.53, V6) + prompt: a device whose player belongs to ANOTHER sign-in moves to this sign-in's player, as before;
-- if the old player has seasons, create a "Is this you?" prompt (once per player pair). Answered via merge_answer.
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
    if other then
      update player_links set player_id = acc where kind = 'device' and key = p_device::text;
      if exists (select 1 from seasons where player_id = dev and not practice)
         and not exists (select 1 from merge_offers where src = dev and dst = acc) then
        insert into merge_offers (src, dst, uid) values (dev, acc, uid);
      end if;
    else perform public.merge_players(dev, acc); end if;
  end if;
  if tgid is not null then
    insert into player_links (kind, key, player_id) values ('tg', tgid, acc) on conflict (kind, key) do nothing;
    update league_results set player_id = acc where tg_user_id = tgid::bigint and player_id is null;
    update league_members set player_id = acc where tg_user_id = tgid::bigint and player_id is null;
  end if;
  return (public.player_json(acc)::jsonb || jsonb_build_object('merge_offer', public.merge_offer_json(acc)))::json;
end $$;
revoke execute on function public.link_account(uuid, text) from public, anon;
grant execute on function public.link_account(uuid, text) to authenticated;

-- answer: only the same sign-in (prompt's player) and a device already owned by it. Yes = logged merge (revert with unmerge_players)
create or replace function public.merge_answer(p_device uuid, p_secret text, p_offer uuid, p_yes boolean) returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); dev uuid; acc uuid; o merge_offers%rowtype; fresh boolean;
begin
  if uid is null then raise exception 'login?' using errcode = '28000'; end if;
  dev := public.device_check(p_device, p_secret);
  acc := public.player_for_auth(uid);
  select * into o from merge_offers where id = p_offer for update;
  if not found or acc is null or o.dst <> acc or dev <> acc or o.answered_at is not null then
    raise exception 'offer?' using errcode = '22023';
  end if;
  update merge_offers set answered_at = now(), answer = case when p_yes then 'yes' else 'no' end where id = p_offer;
  if p_yes and exists (select 1 from players where id = o.src and merged_into is null and deleted_at is null) then
    fresh := not exists (select 1 from seasons where player_id = acc and not practice);
    perform public.merge_players_logged(o.src, acc, 'offer ' || p_offer::text, fresh);
  end if;
  return public.player_json(acc);
end $$;
revoke execute on function public.merge_answer(uuid, text, uuid, boolean) from public, anon;
grant execute on function public.merge_answer(uuid, text, uuid, boolean) to authenticated;

-- 3. reserved names: the only names allowed outside the rules, each for one player
create table if not exists public.name_reserved (
  name text primary key,
  player_id uuid not null,
  note text,
  created_at timestamptz not null default now()
);
alter table public.name_reserved enable row level security;
revoke all on table public.name_reserved from anon, authenticated;
insert into public.name_reserved (name, player_id, note)
  select 'andré', id, 'власник проєкту, 30.09.2026' from public.players where name = 'andré' and merged_into is null and deleted_at is null
  on conflict (name) do nothing;

-- player name (chosen manually): as in 0.59, plus the player's own reserved name bypasses the rules
create or replace function public.set_player_name(p_device uuid, p_secret text, p_name text) returns json language plpgsql security definer set search_path = public as $$
declare pid uuid; nm text; cur players%rowtype;
begin
  pid := public.device_check(p_device, p_secret);
  select * into cur from players where id = pid for update;
  begin
    nm := public.name_clean(p_name);
  exception when sqlstate '22023' then
    nm := nullif(regexp_replace(lower(btrim(coalesce(p_name, ''))), '\s+', '_', 'g'), '');
    if nm is not null and exists (select 1 from name_reserved r where r.name = nm and r.player_id = pid) then
      null;   -- this player's reserved name
    elsif cur.name is null then
      -- 0.58 clients send the raw Telegram first name (Cyrillic): transliterate instead of failing
      perform public.name_auto_set(pid, p_name); return public.player_json(pid);
    else
      raise;
    end if;
  end;
  -- same name with different case: just store lowercase, no 30-day timer
  if nm is not distinct from public.name_key(cur.name) then
    if nm is not null and cur.name is distinct from nm then update players set name = nm where id = pid; end if;
    return public.player_json(pid);
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
    -- first name (from anonymous, incl. automatic from Telegram/Google) does not start the timer; changing or clearing it does
    update players set name = nm, name_changed_at = case when cur.name is not null then now() else name_changed_at end where id = pid;
  exception when unique_violation then raise exception 'name_taken' using errcode = '23505';
  end;
  return public.player_json(pid);
end $$;
grant execute on function public.set_player_name(uuid, text, text) to anon, authenticated;

-- 4. newsletter email (opt-in only; visible to the device owner only). Not in players: players is world-readable (tables, player page)
create table if not exists public.player_contacts (
  player_id uuid primary key,
  email text,
  news_optin boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.player_contacts enable row level security;
revoke all on table public.player_contacts from anon, authenticated;

create or replace function public.player_json(p_id uuid) returns json language sql volatile security definer set search_path = public as $$
  select json_build_object('id', id, 'name', public.name_key(name), 'anon_name', public.name_key(anon_name), 'public_id', public_id,
                           'name_changed_at', name_changed_at,
                           'name_next', case when name_changed_at > now() - interval '30 days' then name_changed_at + interval '30 days' end,
                           'contact_email', (select c.email from player_contacts c where c.player_id = p_id),
                           'news_optin', coalesce((select c.news_optin from player_contacts c where c.player_id = p_id), false))
    from players where id = p_id;
$$;
revoke execute on function public.player_json(uuid) from public, anon, authenticated;

-- empty email = erase (and the opt-in); error email_bad (22023) = does not look like an address
create or replace function public.set_player_contact(p_device uuid, p_secret text, p_email text, p_optin boolean) returns json language plpgsql security definer set search_path = public as $$
declare pid uuid; em text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  pid := public.device_check(p_device, p_secret);
  if em is not null and (char_length(em) > 254 or em !~ '^[^@\s]{1,64}@[^@\s]+\.[^@\s.]{2,}$') then
    raise exception 'email_bad' using errcode = '22023';
  end if;
  if em is null then delete from player_contacts where player_id = pid;
  else insert into player_contacts (player_id, email, news_optin, updated_at) values (pid, em, coalesce(p_optin, false), now())
       on conflict (player_id) do update set email = excluded.email, news_optin = excluded.news_optin, updated_at = now();
  end if;
  return public.player_json(pid);
end $$;
revoke execute on function public.set_player_contact(uuid, text, text, boolean) from public;
grant execute on function public.set_player_contact(uuid, text, text, boolean) to anon, authenticated;

-- account deletion (0.59) + newsletter email and opt-in are erased
create or replace function public.delete_player(p_device uuid, p_secret text) returns json language plpgsql security definer set search_path = public as $$
declare pid uuid; acc uuid; an text; uids uuid[]; tgs bigint[];
begin
  pid := public.device_check(p_device, p_secret);
  acc := public.player_for_auth(auth.uid());
  if acc is not null and acc <> pid then raise exception 'not your player' using errcode = '28000'; end if;
  select coalesce(array_agg(key::uuid) filter (where kind = 'auth'), '{}'), coalesce(array_agg(key::bigint) filter (where kind = 'tg' and key ~ '^\d{1,18}$'), '{}')
    into uids, tgs from player_links where player_id = pid;
  select public.name_key(anon_name) into an from players where id = pid;
  update players set name = null, name_changed_at = null, deleted_at = now() where id = pid;
  update players set name = null where merged_into = pid;
  delete from player_contacts where player_id = pid or player_id in (select id from players where merged_into = pid);
  delete from name_reserved where player_id = pid;
  update seasons set nickname = null, tg_name = null, tg_user_id = null where player_id = pid;
  update daily_results set nickname = an, tg_name = null, tg_user_id = null where player_id = pid;   -- nickname is NOT NULL (2-24 chars) in the main DB
  update trophies set tg_name = null, tg_user_id = null where player_id = pid;
  update challenges set name = an where player_id = pid;
  update challenge_results set name = an where player_id = pid;
  update f5_players set name = an where player_id = pid;
  update league_results set name = an where player_id = pid or tg_user_id = any(tgs);
  delete from league_members where player_id = pid or tg_user_id = any(tgs);
  delete from player_links where player_id = pid;
  delete from user_state where user_id = any(uids);
  begin
    delete from auth.users where id = any(uids);
  exception when others then raise notice 'auth.users: %', sqlerrm;   -- no privileges: the sign-in stays but is no longer linked to anyone
  end;
  return json_build_object('ok', true);
end $$;
revoke execute on function public.delete_player(uuid, text) from public;
grant execute on function public.delete_player(uuid, text) to anon, authenticated;

-- 5. "ratings shown" during the draft: written by the server (/api/save), tables show a marker
alter table public.seasons add column if not exists show_r boolean;

-- 6. player page: "pick season" (mode = 'pick') is a separate mode in best/worst XI (rest as in 0.59)
create or replace function public.player_profile(p_player uuid) returns json language plpgsql stable security definer set search_path = public as $$
declare pid uuid := p_player; p players%rowtype; hops int := 0; res json;
begin
  loop
    select * into p from players where id = pid;
    exit when not found or p.merged_into is null or hops >= 5;
    pid := p.merged_into; hops := hops + 1;
  end loop;
  if p.id is null then return null; end if;
  if p.deleted_at is not null then
    return json_build_object('public_id', p.public_id, 'name', public.name_key(p.anon_name), 'anon', true, 'deleted', true);
  end if;
  with s as (
    select id, created_at, day, mode, format, club, formation, w, d, l, pts, place, gf, ga, xi,
           case when day is not null then 'daily' when mode = 'pick' then 'pick' else format end as b
      from seasons where player_id = pid and not practice and mode <> 'practice' and verified is not false
  ), n as (
    select count(*) seasons, count(*) filter (where place = 1 and format <> 'anti') champions,
           count(*) filter (where w = 30 and format <> 'anti') perfect,
           sum(w) filter (where format <> 'anti') wins, count(*) filter (where format <> 'anti') games,
           max(pts) filter (where format = 'classic') best_classic, min(created_at) first_at
      from s
  ), rk as (
    select s.id, s.b, s.pts, s.w, s.d, s.l, s.place, s.formation, s.mode, s.club, s.day, s.created_at,
           (select round(avg(case when coalesce(x->>'r0', x->>'r') ~ '^\d{1,3}(\.\d+)?$' then coalesce(x->>'r0', x->>'r')::numeric end), 1)
              from jsonb_array_elements(case when jsonb_typeof(s.xi) = 'array' then s.xi else '[]'::jsonb end) x) avg_r,
           row_number() over (partition by s.b order by case when s.b = 'anti' then -s.pts else s.pts end desc,
                                                        case when s.b = 'anti' then -s.place else s.place end, s.gf - s.ga desc, s.created_at) best_n,
           row_number() over (partition by s.b order by case when s.b = 'anti' then -s.pts else s.pts end,
                                                        case when s.b = 'anti' then -s.place else s.place end desc, s.gf - s.ga, s.created_at) worst_n,
           count(*) over (partition by s.b) bn
      from s
  ), xi as (
    select x from s, jsonb_array_elements(case when jsonb_typeof(s.xi) = 'array' then s.xi else '[]'::jsonb end) x
  ), fc as (
    select x->>'c' c, count(*) k from xi where coalesce(x->>'c', '') <> '' group by 1 order by 2 desc, 1 limit 1
  ), fp as (
    select x->>'id' id, max(x->>'n') n, count(*) k from xi where coalesce(x->>'id', '') <> '' group by 1 order by 3 desc, 2 limit 1
  ), tr as (
    select trophy, min(created_at) at from trophies where player_id = pid group by trophy
  ), dd as (
    select distinct day from daily_results where player_id = pid
  ), isl as (
    select max(day) z, count(*) k from (select day, day - (row_number() over (order by day))::int g from dd) q group by g
  )
  select json_build_object(
    'public_id', p.public_id,
    'name', public.name_key(coalesce(p.name, p.anon_name)),
    'anon', p.name is null,
    'since', least(p.created_at, n.first_at),
    'seasons', n.seasons, 'champions', n.champions, 'perfect', n.perfect, 'best_classic', n.best_classic,
    'win_pct', case when n.games > 0 then round(100.0 * n.wins / (30 * n.games)) end,
    'best', (select json_object_agg(b, json_build_object('id', id, 'pts', pts, 'w', w, 'd', d, 'l', l, 'place', place, 'formation', formation,
                                                          'mode', mode, 'club', club, 'day', day, 'at', created_at::date, 'avg', avg_r)) from rk where best_n = 1),
    'worst', (select json_object_agg(b, json_build_object('id', id, 'pts', pts, 'w', w, 'd', d, 'l', l, 'place', place, 'formation', formation,
                                                          'mode', mode, 'club', club, 'day', day, 'at', created_at::date, 'avg', avg_r)) from rk where worst_n = 1 and bn > 1),
    'fav_club', (select json_build_object('c', c, 'k', k, 'pct', round(100.0 * k / nullif((select count(*) from xi), 0))) from fc),
    'fav_player', (select json_build_object('id', id, 'n', n, 'k', k) from fp),
    'trophies', coalesce((select json_agg(json_build_object('id', trophy, 'at', at::date) order by at desc) from tr), '[]'::json),
    'streak_best', coalesce((select max(k) from isl), 0),
    'streak_now', coalesce((select max(k) from isl where z >= (now() at time zone 'Europe/Kyiv')::date - 1), 0)
  ) into res from n;
  return res;
end $$;
revoke execute on function public.player_profile(uuid) from public;
grant execute on function public.player_profile(uuid) to anon, authenticated;

-- run output: quick check
select 'andré зарезервовано' as "що", count(*)::text as "скільки" from public.name_reserved
union all select 'відкритих питань «Це ти?»', count(*)::text from public.merge_offers where answered_at is null
union all select 'записів у журналі злиттів', count(*)::text from public.merge_log;

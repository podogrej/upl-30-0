-- 0.89.1 audit package C: server-side only, additive (create or replace). Safe to run repeatedly; the deployed site keeps working before and after.
--  1. api_gate(...)   rate limit by IP and device + device secret check in ONE call (/api/seed, /api/save: 3 DB calls -> 1).
--  2. league_view(...) league card/standings in ONE call (title, member count, today's verified rows with names, standings
--     aggregated in the DB: the answer size no longer grows with the league history).
-- Both are callable by the server key only (service_role); no new grants for anon/authenticated, no new tables.
-- The API falls back to the previous multi-call path while these functions are missing (PGRST202).

-- 1. gate: counts the request per IP and per device (same rate_hit counters), then checks the secret only if the request is within the limit.
--    Returns {"rate": bool, "player": uuid|null, "err": null|"secret"|"device"}. p_secret null: counters only (legacy clients).
create or replace function public.api_gate(p_name text, p_ip text, p_device uuid, p_secret text, p_limit int, p_ip_limit int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ok_ip boolean; ok_dev boolean := true; pid uuid;
begin
  ok_ip := public.rate_hit(p_name || ':ip:' || coalesce(p_ip, 'unknown'), p_ip_limit);
  if p_device is not null then ok_dev := public.rate_hit(p_name || ':d:' || lower(p_device::text), p_limit); end if;
  if not (ok_ip and ok_dev) then return jsonb_build_object('rate', false, 'player', null, 'err', null); end if;
  if p_secret is null or p_device is null then return jsonb_build_object('rate', true, 'player', null, 'err', null); end if;
  begin
    pid := public.device_check(p_device, p_secret);
  exception
    when sqlstate '28000' then return jsonb_build_object('rate', true, 'player', null, 'err', 'secret');
    when sqlstate '22023' then return jsonb_build_object('rate', true, 'player', null, 'err', 'device');
  end;
  return jsonb_build_object('rate', true, 'player', pid, 'err', null);
end $$;
revoke execute on function public.api_gate(text, text, uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.api_gate(text, text, uuid, text, int, int) to service_role;

-- 2. league view. Same rules as api/_league.js onlyVerified/standingsOf: rows from 2026-10-01 count only with a verified, non-practice season
--    of the same Telegram user whose day matches (own day, or the Kyiv date of saving = row day or the day before); numbers come from the season.
--    Names come from the player profile (via the Telegram link), else from the row.
--    p_card: today's rows and counters only (no standings). Order of a day: points, goal difference, goals, earlier first.
create or replace function public.league_view(p_chat bigint, p_day date default null, p_card boolean default false, p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_title text; v_day date := coalesce(p_day, (now() at time zone 'Europe/Kyiv')::date); v_members int; v_out jsonb;
begin
  select title into v_title from leagues where chat_id = p_chat;
  if not found then return null; end if;
  select count(*) into v_members from league_members where chat_id = p_chat and left_at is null;
  with rows_ as (
    select r.day, r.tg_user_id, coalesce(nullif(p.name, ''), p.anon_name, r.name) as nm, p.public_id as pub,
           case when s.id is not null then s.w else r.w end as w, case when s.id is not null then s.d else r.d end as dr, case when s.id is not null then s.l else r.l end as l,
           case when s.id is not null then s.w * 3 + s.d else r.pts end as pts,
           case when s.id is not null then s.gf else r.gf end as gf, case when s.id is not null then s.ga else r.ga end as ga, r.created_at
      from league_results r
      left join seasons s on s.id = r.season_id and s.verified is true and s.practice = false
           and (s.tg_user_id is null or s.tg_user_id = r.tg_user_id)
           and (case when s.day is not null then s.day = r.day
                     else (s.created_at at time zone 'Europe/Kyiv')::date in (r.day, r.day + 1) end)
      left join player_links pl on pl.kind = 'tg' and pl.key = r.tg_user_id::text
      left join players p on p.id = pl.player_id
     where r.chat_id = p_chat and (not p_card or r.day = v_day)
       and (r.day < date '2026-10-01' or s.id is not null)
  ), ranked as (
    select *, row_number() over (partition by day order by pts desc, (gf - ga) desc, gf desc, created_at asc, tg_user_id asc) as rn from rows_
  ), td as (
    select coalesce(jsonb_agg(jsonb_build_object('name', nm, 'u', pub, 'w', w, 'd', dr, 'l', l, 'pts', pts, 'gf', gf, 'ga', ga, 'created_at', created_at) order by rn), '[]'::jsonb) as j
      from ranked where day = v_day
  ), agg as (
    select tg_user_id, (array_agg(nm order by day desc))[1] as nm, (array_agg(pub order by day desc))[1] as pub,
           count(*) filter (where rn = 1) as wins, count(*) as days, sum(pts) as pts
      from ranked where not p_card group by tg_user_id
  ), sd as (
    select coalesce(jsonb_agg(jsonb_build_object('name', nm, 'u', pub, 'wins', wins, 'days', days, 'pts', pts) order by wins desc, pts::numeric / days desc, tg_user_id), '[]'::jsonb) as j
      from (select * from agg order by wins desc, pts::numeric / days desc, tg_user_id limit greatest(1, least(coalesce(p_limit, 100), 500))) top
  )
  select jsonb_build_object('title', v_title, 'day', v_day, 'members', v_members, 'today', td.j)
         || case when p_card then '{}'::jsonb else jsonb_build_object('standings', sd.j) end
    into v_out from td, sd;
  return v_out;
end $$;
revoke execute on function public.league_view(bigint, date, boolean, int) from public, anon, authenticated;
grant execute on function public.league_view(bigint, date, boolean, int) to service_role;

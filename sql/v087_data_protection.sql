-- 0.87 "Data protection", step 1. Additive and idempotent; the 0.86 site keeps working (no grant or policy is removed here).
--  1. Public read paths without personal data: views seasons_pub, challenges_pub, challenge_results_pub
--     (no device_id, tg_user_id, tg_name, user_id, seed / seed_id of seasons; player name as a json column "players").
--     my_seasons(device, secret): own device seasons (trophy retro, history without a player).
--     Step 2 (sql/v088_revoke_pii_step2.sql) removes direct anon/authenticated reads of the base tables later.
--  2. 5x5 friend leagues: lineups of other members are hidden until the tournament is played (fl_get);
--     the server reads full lineups through fl_get_full (service_role only).
--  3. Telegram identity: tg id lives in auth.users.raw_app_meta_data->>'tg_id' (admin-only).
--     Backfill only for accounts created by the server (see tg_server_made); link_account reads app_metadata only;
--     tg_auth_user(tg) lets /api/auth refuse a pre-registered account with the same service email.

-- 1. public read paths -------------------------------------------------------------------------------------------
-- security_invoker = false: the view reads as its owner, so anon needs no grant on the base tables after step 2.
-- Only select is granted: simple views are auto-updatable and would otherwise write as the owner.
create or replace view public.seasons_pub with (security_invoker = false) as
select s.id, s.created_at, s.nickname, s.mode, s.format, s.club, s.formation, s.year, s.version,
       s.w, s.d, s.l, s.pts, s.place, s.gf, s.ga, s.gd, s.xp, s.xg, s.xga, s.tier, s.perfect, s.golden, s.practice, s.day,
       s.xi, s.tbl, s.verified, s.competition, s.data_version, s.era, s.show_r, s.player_id,
       s.fl_id is not null as in_fl,
       case when p.id is null then null else json_build_object('name', p.name, 'anon_name', p.anon_name, 'public_id', p.public_id) end as players
  from public.seasons s left join public.players p on p.id = s.player_id;
revoke all on public.seasons_pub from public, anon, authenticated;
grant select on public.seasons_pub to anon, authenticated;

create or replace view public.challenges_pub with (security_invoker = false) as
select c.id, c.created_at, c.name, c.seed, c.formation, c.year, c.mode, c.w, c.d, c.l, c.pts, c.place, c.gf, c.ga, c.competition, c.player_id,
       case when p.id is null then null else json_build_object('name', p.name, 'anon_name', p.anon_name, 'public_id', p.public_id) end as players
  from public.challenges c left join public.players p on p.id = c.player_id;
revoke all on public.challenges_pub from public, anon, authenticated;
grant select on public.challenges_pub to anon, authenticated;

create or replace view public.challenge_results_pub with (security_invoker = false) as
select r.challenge_id, r.created_at, r.name, r.w, r.d, r.l, r.pts, r.place, r.gf, r.ga, r.player_id,
       case when p.id is null then null else json_build_object('name', p.name, 'anon_name', p.anon_name, 'public_id', p.public_id) end as players
  from public.challenge_results r left join public.players p on p.id = r.player_id;
revoke all on public.challenge_results_pub from public, anon, authenticated;
grant select on public.challenge_results_pub to anon, authenticated;

-- own device seasons, safe columns, oldest first (volatile: device_check locks and may insert)
create or replace function public.my_seasons(p_device uuid, p_secret text) returns json language plpgsql volatile security definer set search_path = public as $$
declare res json;
begin
  perform public.device_check(p_device, p_secret);
  select coalesce(json_agg(p order by p.id), '[]'::json) into res
    from (select v.* from seasons s join seasons_pub v on v.id = s.id where s.device_id = p_device order by s.id limit 1000) p;
  return res;
end $$;
revoke execute on function public.my_seasons(uuid, text) from public;
grant execute on function public.my_seasons(uuid, text) to anon, authenticated;

-- 2. 5x5 lineups hidden until the result ---------------------------------------------------------------------------
-- fl_get_full: the 0.81 fl_get body unchanged (all lineups); server only
create or replace function public.fl_get_full(p_id text)
 returns json language sql stable security definer set search_path to 'public'
as $function$
  with L as (select * from fl_leagues where id = lower(btrim(p_id)) and deleted_at is null),
  pick as (
    select e.*, row_number() over (partition by e.player_id, e.day order by
             case when (select take from L) = 'last' then -e.try_n else 0 end,
             e.pts desc, e.gf - e.ga desc, e.gf desc, e.created_at) rn
      from fl_entries e where e.league_id = (select id from L)
  ), day_rank as (
    select p.*, rank() over (partition by p.day order by p.pts desc, p.gf - p.ga desc, p.gf desc) rk,
           count(*) over (partition by p.day) k
      from pick p where rn = 1
  ), day_pts as (
    select d.*, case when (select scoring from L) = 'sum' then d.pts else d.k - d.rk + 1 end as score from day_rank d
  ), tot as (
    select m.player_id, m.joined_at, m.left_at, coalesce(sum(dp.score), 0) total, count(*) filter (where dp.rk = 1) wins, max(dp.pts) best, count(dp.day) played
      from fl_members m left join day_pts dp on dp.player_id = m.player_id
     where m.league_id = (select id from L) group by m.player_id, m.joined_at, m.left_at
  ), today_tries as (
    select player_id, count(*) n from fl_entries where league_id = (select id from L) and day = public.fl_today() group by player_id
  )
  select json_build_object(
    'id', L.id, 'name', L.name, 'fmt', L.fmt, 'start_day', L.start_day, 'days', L.days, 'tries', L.tries, 'take', L.take, 'scoring', L.scoring,
    'rerolls', L.rerolls, 'ratings', L.ratings, 'era', L.era, 'today', public.fl_today(),
    'day_n', public.fl_today() - L.start_day + 1,
    'over', case when L.fmt = '5' then L.result is not null else public.fl_today() >= L.start_day + L.days end,
    'deadline', L.deadline, 'now', now(), 'played_at', L.played_at, 'result', L.result,
    'owner', (select public_id from players where id = L.owner),
    'owner_name', (select public.name_key(coalesce(name, anon_name)) from players where id = L.owner),
    'created_at', L.created_at,
    'members', (select count(*) from fl_members mm where mm.league_id = L.id and mm.left_at is null),
    'board', coalesce((select json_agg(json_build_object('u', pl.public_id, 'name', public.name_key(coalesce(pl.name, pl.anon_name)),
                                        'total', t.total, 'wins', t.wins, 'best', t.best, 'played', t.played, 'left', t.left_at is not null)
                               order by t.total desc, t.wins desc, t.best desc nulls last, t.joined_at, pl.public_id)
                        from tot t join players pl on pl.id = t.player_id), '[]'::json),
    'tour', coalesce((select json_agg(json_build_object('u', pl.public_id, 'name', public.name_key(coalesce(pl.name, pl.anon_name)),
                                       'pts', dp.pts, 'w', dp.w, 'd', dp.d, 'l', dp.l, 'gf', dp.gf, 'ga', dp.ga, 'score', dp.score, 'rk', dp.rk,
                                       'tries', (select n from today_tries tt where tt.player_id = dp.player_id))
                              order by dp.rk, pl.public_id)
                       from day_pts dp join players pl on pl.id = dp.player_id where dp.day = public.fl_today()), '[]'::json),
    'fives', coalesce((select json_agg(json_build_object('u', pl.public_id, 'name', public.name_key(coalesce(pl.name, pl.anon_name)),
                                        'form', f.form, 'xi', f.xi, 'at', f.created_at) order by f.created_at, pl.public_id)
                         from fl_fives f join players pl on pl.id = f.player_id
                        where f.league_id = L.id and not exists (select 1 from fl_members m where m.league_id = L.id and m.player_id = f.player_id and m.left_at is not null)), '[]'::json)
  ) from L;
$function$;
revoke execute on function public.fl_get_full(text) from public, anon, authenticated;
grant execute on function public.fl_get_full(text) to service_role;

-- fl_get: same JSON; for a 5x5 league without a result, "fives" keeps who submitted (u, name, at) and drops form/xi,
-- except the signed-in caller's own lineup; fives_n = number of submitted lineups
create or replace function public.fl_get(p_id text)
 returns json language sql stable security definer set search_path to 'public'
as $function$
  with f as (select public.fl_get_full(p_id) j),
  me as (select pl.public_id from player_links k join players pl on pl.id = k.player_id
          where k.kind = 'auth' and k.key = auth.uid()::text limit 1)
  select case
    when f.j is null or f.j->>'fmt' is distinct from '5' or coalesce(json_typeof(f.j->'result'), 'null') <> 'null' then f.j
    else (f.j::jsonb || jsonb_build_object(
            'fives_n', json_array_length(f.j->'fives'),
            'fives', coalesce((select jsonb_agg(case when x.v->>'u' = (select public_id from me) then x.v else x.v - 'xi' - 'form' end order by x.o)
                                 from jsonb_array_elements(f.j::jsonb->'fives') with ordinality x(v, o)), '[]'::jsonb)))::json
  end from f;
$function$;
revoke execute on function public.fl_get(text) from public;
grant execute on function public.fl_get(text) to anon, authenticated;

-- 3. Telegram identity -----------------------------------------------------------------------------------------------
-- An account created by /api/auth (admin API, email_confirm) has no password, a confirmed email and only the email identity.
-- A self sign-up with the same service address has a password (signUp) or an unconfirmed email (magic link it can't receive).
create or replace function public.tg_server_made(p_uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from auth.users u
                  where u.id = p_uid and u.email ~ '^tg-\d{1,20}@users\.upl-30-0\.vercel\.app$'
                    and u.email_confirmed_at is not null and u.confirmation_sent_at is null
                    and u.created_at < timestamptz '2026-10-12 00:00+00'
                    and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider <> 'email'));
$$;
revoke execute on function public.tg_server_made(uuid) from public, anon, authenticated;

-- server-made = created by the admin API before 0.87 (confirmed without a confirmation mail; the server sets a random password, so the
-- password is not a signal). Accounts created after the cutoff must already carry app_metadata.tg_id from the new /api/auth.
-- backfill: server-made accounts without app_metadata.tg_id get it from the email
update auth.users u
   set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('tg_id', substring(u.email from '^tg-(\d+)@'))
 where u.email ~ '^tg-\d{1,20}@users\.upl-30-0\.vercel\.app$'
   and coalesce(u.raw_app_meta_data->>'tg_id', '') = ''
   and public.tg_server_made(u.id);

-- /api/auth before issuing a login: 'none' (no account: create it), 'ok' (account belongs to this tg id), 'bad' (refuse).
-- A server-made account without tg_id (created by the previous server version) is claimed here.
create or replace function public.tg_auth_user(p_tg bigint) returns text language plpgsql volatile security definer set search_path = public as $$
declare uid uuid; meta text;
begin
  if p_tg is null or p_tg <= 0 then raise exception 'tg?' using errcode = '22023'; end if;
  select u.id, u.raw_app_meta_data->>'tg_id' into uid, meta from auth.users u
   where lower(u.email) = 'tg-' || p_tg::text || '@users.upl-30-0.vercel.app' for update;
  if uid is null then return 'none'; end if;
  if coalesce(meta, '') <> '' then return case when meta = p_tg::text then 'ok' else 'bad' end; end if;
  if not public.tg_server_made(uid) then return 'bad'; end if;
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('tg_id', p_tg::text) where id = uid;
  return 'ok';
end $$;
revoke execute on function public.tg_auth_user(bigint) from public, anon, authenticated;
grant execute on function public.tg_auth_user(bigint) to service_role;

-- link_account (0.60 body): tg id only from app_metadata, never from the email
create or replace function public.link_account(p_device uuid, p_secret text) returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); dev uuid; acc uuid; tgid text; other boolean;
begin
  if uid is null then raise exception 'login?' using errcode = '28000'; end if;
  dev := public.device_check(p_device, p_secret);
  select case when raw_app_meta_data->>'tg_id' ~ '^\d{1,20}$' then raw_app_meta_data->>'tg_id' end into tgid from auth.users where id = uid;
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

-- PostgREST: pick up the new views and functions at once
notify pgrst, 'reload schema';

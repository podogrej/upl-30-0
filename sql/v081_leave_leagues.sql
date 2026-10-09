-- 0.81: leave a league / delete own friends league. Additive and idempotent; rows are marked, never deleted.
-- fl_leagues.deleted_at: owner deleted it (hidden for everyone, undo clears it); fl_members.left_at and league_members.left_at: member left.
alter table public.fl_leagues add column if not exists deleted_at timestamptz;
alter table public.fl_members add column if not exists left_at timestamptz;
alter table public.league_members add column if not exists left_at timestamptz;

-- league page: deleted league reads as missing; adds owner name, creation time and active member count
create or replace function public.fl_get(p_id text)
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

-- my leagues: skip deleted leagues and leagues I left; owner flag for the page
create or replace function public.fl_mine(p_device uuid, p_secret text)
 returns json language plpgsql security definer set search_path to 'public'
as $function$
declare pid uuid; res json;
begin
  pid := public.device_check(p_device, p_secret);
  select coalesce(json_agg(x order by x.over, x.created_at desc), '[]'::json) into res from (
    select L.id, L.name, L.fmt, L.days, L.tries, L.created_at, L.deadline, public.fl_today() - L.start_day + 1 as day_n,
           case when L.fmt = '5' then L.result is not null else public.fl_today() >= L.start_day + L.days end as over,
           (select count(*) from fl_members mm where mm.league_id = L.id and mm.left_at is null) as members,
           (select count(*) from fl_fives ff join fl_members fm on fm.league_id = ff.league_id and fm.player_id = ff.player_id and fm.left_at is null where ff.league_id = L.id) as fives,
           exists (select 1 from fl_fives ff where ff.league_id = L.id and ff.player_id = pid) as my_five,
           (select count(*) from fl_entries e where e.league_id = L.id and e.player_id = pid and e.day = public.fl_today()) as tries_today,
           L.owner = pid as mine,
           case when L.fmt = '5' then null else (select b.o from json_array_elements(public.fl_get(L.id)->'board') with ordinality b(v, o)
             where b.v->>'u' = (select public_id from players where id = pid)) end as place
      from fl_leagues L join fl_members m on m.league_id = L.id and m.player_id = pid and m.left_at is null
     where L.deleted_at is null
  ) x;
  return res;
end $function$;

-- join by link: a deleted league is missing; joining again after leaving clears left_at
create or replace function public.fl_join(p_device uuid, p_secret text, p_id text)
 returns json language plpgsql security definer set search_path to 'public'
as $function$
declare pid uuid; acc uuid; L fl_leagues%rowtype;
begin
  if auth.uid() is null then raise exception 'login?' using errcode = '28000'; end if;
  pid := public.device_check(p_device, p_secret);
  acc := public.player_for_auth(auth.uid());
  if acc is null or acc <> pid then raise exception 'login?' using errcode = '28000'; end if;
  select * into L from fl_leagues where id = lower(btrim(p_id)) and deleted_at is null;
  if not found then raise exception 'fl_none' using errcode = '22023'; end if;
  if L.fmt = '5' then
    if L.result is not null or L.deadline <= now() then raise exception 'fl_over' using errcode = '22023'; end if;
    if not exists (select 1 from fl_members where league_id = L.id and player_id = pid and left_at is null)
       and (select count(*) from fl_members where league_id = L.id and left_at is null) >= 10 then raise exception 'fl_full' using errcode = '22023'; end if;
  elsif public.fl_today() >= L.start_day + L.days then raise exception 'fl_over' using errcode = '22023'; end if;
  insert into fl_members (league_id, player_id) values (L.id, pid)
    on conflict (league_id, player_id) do update set left_at = null;
  return public.fl_get(L.id);
end $function$;

-- leave a friends league (not the owner: the owner deletes it); p_undo returns
create or replace function public.fl_leave(p_device uuid, p_secret text, p_id text, p_undo boolean default false)
 returns json language plpgsql security definer set search_path to 'public'
as $function$
declare pid uuid; L fl_leagues%rowtype;
begin
  if auth.uid() is null then raise exception 'login?' using errcode = '28000'; end if;
  pid := public.device_check(p_device, p_secret);
  if public.player_for_auth(auth.uid()) is distinct from pid then raise exception 'login?' using errcode = '28000'; end if;
  select * into L from fl_leagues where id = lower(btrim(p_id)) and deleted_at is null;
  if not found then raise exception 'fl_none' using errcode = '22023'; end if;
  if L.owner = pid then raise exception 'fl_owner' using errcode = '22023'; end if;
  update fl_members set left_at = case when p_undo then null else now() end where league_id = L.id and player_id = pid;
  if not found then raise exception 'fl_none' using errcode = '22023'; end if;
  return json_build_object('id', L.id, 'left', not p_undo);
end $function$;

-- delete own friends league for everyone (marked, not removed); p_undo restores it
create or replace function public.fl_delete(p_device uuid, p_secret text, p_id text, p_undo boolean default false)
 returns json language plpgsql security definer set search_path to 'public'
as $function$
declare pid uuid; n int;
begin
  if auth.uid() is null then raise exception 'login?' using errcode = '28000'; end if;
  pid := public.device_check(p_device, p_secret);
  if public.player_for_auth(auth.uid()) is distinct from pid then raise exception 'login?' using errcode = '28000'; end if;
  update fl_leagues set deleted_at = case when p_undo then null else now() end
   where id = lower(btrim(p_id)) and owner = pid and (deleted_at is null) = (not p_undo);
  get diagnostics n = row_count;
  if n = 0 then raise exception 'fl_none' using errcode = '22023'; end if;
  return json_build_object('id', lower(btrim(p_id)), 'deleted', not p_undo);
end $function$;

-- chat leagues: skip the ones I left
create or replace function public.tg_leagues_mine(p_device uuid, p_secret text)
 returns json language plpgsql security definer set search_path to 'public'
as $function$
declare pid uuid; res json;
begin
  pid := public.device_check(p_device, p_secret);
  select coalesce(json_agg(x order by x.played_today desc, x.title), '[]'::json) into res from (
    select g.chat_id, g.title,
           (select count(*) from league_members mm where mm.chat_id = g.chat_id and mm.left_at is null) as members,
           (select count(*) from league_results r where r.chat_id = g.chat_id and r.day = (now() at time zone 'Europe/Kyiv')::date) as played_today
      from leagues g
     where exists (select 1 from league_members m where m.chat_id = g.chat_id and m.left_at is null
                     and (m.player_id = pid or m.tg_user_id::text in (select key from player_links where kind = 'tg' and player_id = pid)))
  ) x;
  return res;
end $function$;

-- leave a chat league (it belongs to the group, so no delete); opening the game from the group again rejoins; p_undo returns
create or replace function public.tg_league_leave(p_device uuid, p_secret text, p_chat bigint, p_undo boolean default false)
 returns json language plpgsql security definer set search_path to 'public'
as $function$
declare pid uuid; n int;
begin
  pid := public.device_check(p_device, p_secret);
  update league_members set left_at = case when p_undo then null else now() end
   where chat_id = p_chat and (player_id = pid or tg_user_id::text in (select key from player_links where kind = 'tg' and player_id = pid));
  get diagnostics n = row_count;
  if n = 0 then raise exception 'lg_none' using errcode = '22023'; end if;
  return json_build_object('chat_id', p_chat, 'left', not p_undo);
end $function$;

-- a member who left no longer scores (11×11) or submits a squad (5×5); a deleted league takes neither
create or replace function public.fl_record(p_season bigint)
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare s seasons%rowtype; L fl_leagues%rowtype; v_day date; n int;
begin
  select * into s from seasons where id = p_season;
  if not found or s.fl_id is null or s.verified is not true or s.practice or s.day is not null then return null; end if;
  if exists (select 1 from fl_entries where season_id = p_season) then return (select try_n from fl_entries where season_id = p_season); end if;
  select * into L from fl_leagues where id = s.fl_id and deleted_at is null;
  if not found or L.fmt <> '11' then return null; end if;
  v_day := (s.created_at at time zone 'Europe/Kyiv')::date;
  if v_day < L.start_day or v_day >= L.start_day + L.days then raise notice 'fl_record: out of tours'; return null; end if;
  if s.format <> 'classic' or s.mode <> 'normal' or coalesce(s.era, 'all') <> L.era then raise notice 'fl_record: other rules'; return null; end if;
  if not exists (select 1 from fl_members where league_id = L.id and player_id = s.player_id and left_at is null) then raise notice 'fl_record: not a member'; return null; end if;
  select count(*) into n from fl_entries where league_id = L.id and player_id = s.player_id and day = v_day;
  if n >= L.tries then raise notice 'fl_record: no tries left'; return null; end if;
  insert into fl_entries (league_id, player_id, day, try_n, season_id, pts, w, d, l, gf, ga, place)
    values (L.id, s.player_id, v_day, n + 1, s.id, s.pts, s.w, s.d, s.l, s.gf, s.ga, s.place);
  return n + 1;
end $function$;

create or replace function public.fl5_submit(p_device uuid, p_secret text, p_id text, p_form text, p_xi jsonb)
 returns json language plpgsql security definer set search_path to 'public'
as $function$
declare pid uuid; acc uuid; L fl_leagues%rowtype;
begin
  if auth.uid() is null then raise exception 'login?' using errcode = '28000'; end if;
  pid := public.device_check(p_device, p_secret);
  acc := public.player_for_auth(auth.uid());
  if acc is null or acc <> pid then raise exception 'login?' using errcode = '28000'; end if;
  select * into L from fl_leagues where id = lower(btrim(p_id)) and deleted_at is null;
  if not found or L.fmt <> '5' then raise exception 'fl_none' using errcode = '22023'; end if;
  if L.result is not null or L.deadline <= now() then raise exception 'fl_over' using errcode = '22023'; end if;
  if not exists (select 1 from fl_members where league_id = L.id and player_id = pid and left_at is null) then raise exception 'fl_member' using errcode = '22023'; end if;
  if p_form not in ('1-2-1', '2-2', '2-1-1', '1-1-2') or jsonb_typeof(p_xi) <> 'array' or jsonb_array_length(p_xi) <> 5 or octet_length(p_xi::text) > 4000 then
    raise exception 'fl_bad' using errcode = '22023';
  end if;
  insert into fl_fives (league_id, player_id, form, xi) values (L.id, pid, p_form, p_xi) on conflict do nothing;
  return public.fl_get(L.id);
end $function$;

revoke all on function public.fl_leave(uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.fl_delete(uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.tg_league_leave(uuid, text, bigint, boolean) from public, anon, authenticated;
grant execute on function public.fl_leave(uuid, text, text, boolean) to authenticated;   -- friends leagues need sign-in, as fl_join
grant execute on function public.fl_delete(uuid, text, text, boolean) to authenticated;
grant execute on function public.tg_league_leave(uuid, text, bigint, boolean) to anon, authenticated;

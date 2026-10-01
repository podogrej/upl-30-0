-- 30-0 УПЛ · v0.63 · «5×5 онлайн»: ліга-турнір 5×5 з друзями (docs/leagues_online.md, «5×5: сценарій по кроках»; макети docs/mockups/lg_4_lobby5, lg_5_result5, lg_6_match5).
-- Запускати: спершу тестова база (upl-30-0-test), потім основна. Supabase → SQL Editor → вставити цілком → Run.
-- Повторний запуск нічого не ламає. Сайт 0.62, ще відкритий у гравців, працює як раніше (ліги 11×11 не змінились, нові функції йому не потрібні).
-- Нова таблиця fl_fives — RLS без політик, прав anon/authenticated немає; склад надсилає RPC з перевіркою входу; турнір пише лише сервер (api/fl5.js).
--
-- Що тут:
--  1. fl_leagues: deadline (кінець збору складів), result (турнір, JSON від сервера), played_at; fl_fives — склад учасника (схема + 5 гравців).
--  2. fl_create5 — створити лігу 5×5 (збір 1 / 3 / 24 год; перекрути, рейтинги, епоха). fl_join — ще й ліміт 10 у 5×5 і не після кінця збору.
--  3. fl5_submit — надіслати свою п'ятірку (лише учасник, до кінця збору, один раз). fl5_start — «Почати зараз» (лише творець, від 2 складів).
--  4. fl5_store — зберегти зіграний турнір (лише сервер, один раз). fl_get — ще й deadline, result, склади (відкриті, рішення власника 30.09).
--  5. fl_record — зараховує сезон лише в ліги 11×11.

-- 1. таблиці
alter table public.fl_leagues add column if not exists deadline timestamptz;
alter table public.fl_leagues add column if not exists result jsonb;
alter table public.fl_leagues add column if not exists played_at timestamptz;
create table if not exists public.fl_fives (
  league_id text not null,
  player_id uuid not null,
  form text not null,                                    -- '1-2-1' / '2-2' / '2-1-1' / '1-1-2'
  xi jsonb not null,                                     -- [{id, name, slot, c, y}] × 5; сервер перевіряє за пулом гри
  created_at timestamptz not null default now(),
  primary key (league_id, player_id)
);
alter table public.fl_fives enable row level security;
revoke all on table public.fl_fives from anon, authenticated;

-- 2. створити лігу 5×5: лише з входом, пристрій — свого гравця. Творець одразу учасник
create or replace function public.fl_create5(p_device uuid, p_secret text, p_name text, p_hours int, p_rerolls int, p_ratings text, p_era text) returns json
language plpgsql security definer set search_path = public as $$
declare pid uuid; acc uuid; nm text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')); code text; k int := 0;
begin
  if auth.uid() is null then raise exception 'login?' using errcode = '28000'; end if;
  pid := public.device_check(p_device, p_secret);
  acc := public.player_for_auth(auth.uid());
  if acc is null or acc <> pid then raise exception 'login?' using errcode = '28000'; end if;
  if char_length(nm) not between 2 and 40 or p_hours not in (1, 3, 24) or p_rerolls not in (0, 1, 3) or p_ratings not in ('show', 'memory')
     or p_era not in ('all', 'y2000', 'y2010', 'y2015') then
    raise exception 'fl_bad' using errcode = '22023';
  end if;
  if (select count(*) from fl_leagues where owner = pid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'fl_many' using errcode = '22023';
  end if;
  loop
    code := (select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + floor(random() * 31)::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from fl_leagues where id = code);
    k := k + 1; if k > 20 then raise exception 'fl_code'; end if;
  end loop;
  -- days/tries/take/scoring у 5×5 не діють — лише заповнюємо обов'язкові колонки
  insert into fl_leagues (id, owner, name, fmt, start_day, days, tries, take, scoring, rerolls, ratings, era, deadline)
    values (code, pid, nm, '5', public.fl_today(), 1, 1, 'best', 'place', p_rerolls, p_ratings, p_era, now() + make_interval(hours => p_hours));
  insert into fl_members (league_id, player_id) values (code, pid);
  return public.fl_get(code);
end $$;
revoke execute on function public.fl_create5(uuid, text, text, int, int, text, text) from public, anon;
grant execute on function public.fl_create5(uuid, text, text, int, int, text, text) to authenticated;

-- вступити: 11×11 — як у 0.61; 5×5 — до кінця збору й не більше 10 учасників
create or replace function public.fl_join(p_device uuid, p_secret text, p_id text) returns json
language plpgsql security definer set search_path = public as $$
declare pid uuid; acc uuid; L fl_leagues%rowtype;
begin
  if auth.uid() is null then raise exception 'login?' using errcode = '28000'; end if;
  pid := public.device_check(p_device, p_secret);
  acc := public.player_for_auth(auth.uid());
  if acc is null or acc <> pid then raise exception 'login?' using errcode = '28000'; end if;
  select * into L from fl_leagues where id = lower(btrim(p_id));
  if not found then raise exception 'fl_none' using errcode = '22023'; end if;
  if L.fmt = '5' then
    if L.result is not null or L.deadline <= now() then raise exception 'fl_over' using errcode = '22023'; end if;
    if not exists (select 1 from fl_members where league_id = L.id and player_id = pid)
       and (select count(*) from fl_members where league_id = L.id) >= 10 then raise exception 'fl_full' using errcode = '22023'; end if;
  elsif public.fl_today() >= L.start_day + L.days then raise exception 'fl_over' using errcode = '22023'; end if;
  insert into fl_members (league_id, player_id) values (L.id, pid) on conflict do nothing;
  return public.fl_get(L.id);
end $$;
revoke execute on function public.fl_join(uuid, text, text) from public, anon;
grant execute on function public.fl_join(uuid, text, text) to authenticated;

-- 3. своя п'ятірка: учасник, до кінця збору, один раз («Відправив — змінити не можна»). Склад перевіряє сервер перед турніром
create or replace function public.fl5_submit(p_device uuid, p_secret text, p_id text, p_form text, p_xi jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare pid uuid; acc uuid; L fl_leagues%rowtype;
begin
  if auth.uid() is null then raise exception 'login?' using errcode = '28000'; end if;
  pid := public.device_check(p_device, p_secret);
  acc := public.player_for_auth(auth.uid());
  if acc is null or acc <> pid then raise exception 'login?' using errcode = '28000'; end if;
  select * into L from fl_leagues where id = lower(btrim(p_id));
  if not found or L.fmt <> '5' then raise exception 'fl_none' using errcode = '22023'; end if;
  if L.result is not null or L.deadline <= now() then raise exception 'fl_over' using errcode = '22023'; end if;
  if not exists (select 1 from fl_members where league_id = L.id and player_id = pid) then raise exception 'fl_member' using errcode = '22023'; end if;
  if p_form not in ('1-2-1', '2-2', '2-1-1', '1-1-2') or jsonb_typeof(p_xi) <> 'array' or jsonb_array_length(p_xi) <> 5 or octet_length(p_xi::text) > 4000 then
    raise exception 'fl_bad' using errcode = '22023';
  end if;
  insert into fl_fives (league_id, player_id, form, xi) values (L.id, pid, p_form, p_xi) on conflict do nothing;
  return public.fl_get(L.id);
end $$;
revoke execute on function public.fl5_submit(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.fl5_submit(uuid, text, text, text, jsonb) to authenticated;

-- «Почати зараз»: лише творець, коли зібрано щонайменше 2 склади — кінець збору переноситься на зараз (турнір грає сервер)
create or replace function public.fl5_start(p_device uuid, p_secret text, p_id text) returns json
language plpgsql security definer set search_path = public as $$
declare pid uuid; acc uuid; L fl_leagues%rowtype;
begin
  if auth.uid() is null then raise exception 'login?' using errcode = '28000'; end if;
  pid := public.device_check(p_device, p_secret);
  acc := public.player_for_auth(auth.uid());
  if acc is null or acc <> pid then raise exception 'login?' using errcode = '28000'; end if;
  select * into L from fl_leagues where id = lower(btrim(p_id)) for update;
  if not found or L.fmt <> '5' then raise exception 'fl_none' using errcode = '22023'; end if;
  if L.owner <> pid then raise exception 'fl_owner' using errcode = '22023'; end if;
  if (select count(*) from fl_fives where league_id = L.id) < 2 then raise exception 'fl_few' using errcode = '22023'; end if;
  if L.result is null and L.deadline > now() then update fl_leagues set deadline = now() where id = L.id; end if;
  return public.fl_get(L.id);
end $$;
revoke execute on function public.fl5_start(uuid, text, text) from public, anon;
grant execute on function public.fl5_start(uuid, text, text) to authenticated;

-- 4. зіграний турнір — лише сервер (api/fl5.js після кінця збору), один раз
create or replace function public.fl5_store(p_id text, p_result jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update fl_leagues set result = p_result, played_at = now() where id = p_id and fmt = '5' and result is null and deadline <= now();
  return found;
end $$;
revoke execute on function public.fl5_store(text, jsonb) from public, anon, authenticated;
grant execute on function public.fl5_store(text, jsonb) to service_role;

-- ліга за кодом — для всіх. 0.63: ще й deadline, result, played_at і склади 5×5 (відкриті), players_n — скільки зібрало
create or replace function public.fl_get(p_id text) returns json language sql stable security definer set search_path = public as $$
  with L as (select * from fl_leagues where id = lower(btrim(p_id))),
  pick as (   -- спроба, що йде в залік дня
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
    select m.player_id, m.joined_at, coalesce(sum(dp.score), 0) total, count(*) filter (where dp.rk = 1) wins, max(dp.pts) best, count(dp.day) played
      from fl_members m left join day_pts dp on dp.player_id = m.player_id
     where m.league_id = (select id from L) group by m.player_id, m.joined_at
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
    'board', coalesce((select json_agg(json_build_object('u', pl.public_id, 'name', public.name_key(coalesce(pl.name, pl.anon_name)),
                                        'total', t.total, 'wins', t.wins, 'best', t.best, 'played', t.played)
                               order by t.total desc, t.wins desc, t.best desc nulls last, t.joined_at, pl.public_id)
                        from tot t join players pl on pl.id = t.player_id), '[]'::json),
    'tour', coalesce((select json_agg(json_build_object('u', pl.public_id, 'name', public.name_key(coalesce(pl.name, pl.anon_name)),
                                       'pts', dp.pts, 'w', dp.w, 'd', dp.d, 'l', dp.l, 'gf', dp.gf, 'ga', dp.ga, 'score', dp.score, 'rk', dp.rk,
                                       'tries', (select n from today_tries tt where tt.player_id = dp.player_id))
                              order by dp.rk, pl.public_id)
                       from day_pts dp join players pl on pl.id = dp.player_id where dp.day = public.fl_today()), '[]'::json),
    'fives', coalesce((select json_agg(json_build_object('u', pl.public_id, 'name', public.name_key(coalesce(pl.name, pl.anon_name)),
                                        'form', f.form, 'xi', f.xi, 'at', f.created_at) order by f.created_at, pl.public_id)
                         from fl_fives f join players pl on pl.id = f.player_id where f.league_id = L.id), '[]'::json)
  ) from L;
$$;
revoke execute on function public.fl_get(text) from public;
grant execute on function public.fl_get(text) to anon, authenticated;

-- мої ліги: 0.63 — ще й 5×5 (завершена = турнір зіграно; deadline; чи я вже надіслав склад)
create or replace function public.fl_mine(p_device uuid, p_secret text) returns json language plpgsql stable security definer set search_path = public as $$
declare pid uuid; res json;
begin
  pid := public.device_check(p_device, p_secret);
  select coalesce(json_agg(x order by x.over, x.created_at desc), '[]'::json) into res from (
    select L.id, L.name, L.fmt, L.days, L.tries, L.created_at, L.deadline, public.fl_today() - L.start_day + 1 as day_n,
           case when L.fmt = '5' then L.result is not null else public.fl_today() >= L.start_day + L.days end as over,
           (select count(*) from fl_members mm where mm.league_id = L.id) as members,
           (select count(*) from fl_fives ff where ff.league_id = L.id) as fives,
           exists (select 1 from fl_fives ff where ff.league_id = L.id and ff.player_id = pid) as my_five,
           (select count(*) from fl_entries e where e.league_id = L.id and e.player_id = pid and e.day = public.fl_today()) as tries_today,
           case when L.fmt = '5' then null else (select b.o from json_array_elements(public.fl_get(L.id)->'board') with ordinality b(v, o)
             where b.v->>'u' = (select public_id from players where id = pid)) end as place
      from fl_leagues L join fl_members m on m.league_id = L.id and m.player_id = pid
  ) x;
  return res;
end $$;
revoke execute on function public.fl_mine(uuid, text) from public;
grant execute on function public.fl_mine(uuid, text) to anon, authenticated;

-- 5. сезон — лише в ліги 11×11 (у 5×5 спроб-сезонів немає)
create or replace function public.fl_record(p_season bigint) returns int language plpgsql security definer set search_path = public as $$
declare s seasons%rowtype; L fl_leagues%rowtype; v_day date; n int;
begin
  select * into s from seasons where id = p_season;
  if not found or s.fl_id is null or s.verified is not true or s.practice or s.day is not null then return null; end if;
  if exists (select 1 from fl_entries where season_id = p_season) then return (select try_n from fl_entries where season_id = p_season); end if;
  select * into L from fl_leagues where id = s.fl_id;
  if not found or L.fmt <> '11' then return null; end if;
  v_day := (s.created_at at time zone 'Europe/Kyiv')::date;
  if v_day < L.start_day or v_day >= L.start_day + L.days then raise notice 'fl_record: поза турами'; return null; end if;
  if s.format <> 'classic' or s.mode <> 'normal' or coalesce(s.era, 'all') <> L.era then raise notice 'fl_record: не ті правила'; return null; end if;
  if not exists (select 1 from fl_members where league_id = L.id and player_id = s.player_id) then raise notice 'fl_record: не учасник'; return null; end if;
  select count(*) into n from fl_entries where league_id = L.id and player_id = s.player_id and day = v_day;
  if n >= L.tries then raise notice 'fl_record: спроби дня вичерпано'; return null; end if;
  insert into fl_entries (league_id, player_id, day, try_n, season_id, pts, w, d, l, gf, ga, place)
    values (L.id, s.player_id, v_day, n + 1, s.id, s.pts, s.w, s.d, s.l, s.gf, s.ga, s.place);
  return n + 1;
end $$;
revoke execute on function public.fl_record(bigint) from public, anon, authenticated;
grant execute on function public.fl_record(bigint) to service_role;

-- результат запуску
select 'ліг 11×11' as "що", count(*) filter (where fmt = '11')::text as "скільки" from public.fl_leagues
union all select 'ліг 5×5', count(*) filter (where fmt = '5')::text from public.fl_leagues
union all select 'складів 5×5', count(*)::text from public.fl_fives;

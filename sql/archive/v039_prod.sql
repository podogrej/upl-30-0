-- НЕ ЗАПУСКАТИ (архів, 0.67). Старий SQL: відкриває пряму запис для anon і зламає крок 2 (v054_close_writes). Для нової бази — README, розділ sql/.
-- 30-0 УПЛ · v0.39 · ОСНОВНА БАЗА: 5×5 онлайн (якщо ще не запускав five.sql) + єдиний гравець
-- Supabase → SQL Editor → вставити цілком → Run. Можна запускати повторно.

-- ===================== five.sql =====================
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

-- ===================== players.sql =====================
-- 30-0 УПЛ · v0.39 · єдиний гравець: одна людина — один запис «гравець»; пристрої та входи (Google, Telegram) прив'язуються до нього
-- Вставити цілком у Supabase → SQL Editor → Run. Можна запускати повторно — нічого не зламається.

create extension if not exists pgcrypto;

-- ---------- гравці (публічне: номер та імена) ----------
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

-- ---------- прив'язки (приватне: лише сервер і функції нижче) ----------
-- kind: device — пристрій (key = device_id), auth — акаунт Google/Telegram (key = auth user id), tg — Telegram id
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

-- ---------- анонімне ім'я: «Silent Owl» ----------
create or replace function public.anon_name() returns text language sql volatile as $$
  select (array['Silent','Swift','Clever','Brave','Lucky','Sneaky','Calm','Bold','Quiet','Wild','Sharp','Happy',
                'Mighty','Rapid','Hidden','Golden','Cosmic','Stormy','Sunny','Frosty','Nimble','Fearless','Curious','Steady'])[1 + floor(random() * 24)::int]
      || ' ' ||
         (array['Owl','Fox','Wolf','Bear','Lynx','Hawk','Otter','Badger','Eagle','Stork','Heron','Beaver',
                'Falcon','Raven','Bison','Hare','Moose','Panther','Tiger','Dolphin','Hedgehog','Squirrel','Marten','Crane'])[1 + floor(random() * 24)::int];
$$;

-- гравець цього пристрою; якщо пристрій новий — створюємо гравця
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

-- ---------- player_id у всіх таблицях з результатами (ставить база, не браузер) ----------
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

-- чемпіонат (на майбутнє — інші ліги), версія даних, різниця м'ячів для сортування таблиці
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

-- ---------- злиття двох гравців в одного (коли людина увійшла в акаунт з нового пристрою) ----------
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

-- перевірка секрету пристрою: device_id видно в таблицях, тому діяти від імені пристрою можна лише з його секретом.
-- Перший, хто прийшов із секретом, його й закріплює (пристрої, що грали до 0.39).
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

-- volatile, не stable: інакше в тому самому запиті не видно щойно створеного гравця
create or replace function public.player_json(p_id uuid) returns json language sql volatile security definer set search_path = public as $$
  select json_build_object('id', id, 'name', name, 'anon_name', anon_name) from players where id = p_id;
$$;

-- ---------- те, що викликає гра ----------
-- «привіт»: хто я на цьому пристрої
create or replace function public.player_hello(p_device uuid, p_secret text) returns json language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  pid := public.device_check(p_device, p_secret);
  return public.player_json(pid);
end $$;

-- змінити ім'я (порожнє — повернутися до анонімного)
create or replace function public.set_player_name(p_device uuid, p_secret text, p_name text) returns json language plpgsql security definer set search_path = public as $$
declare pid uuid; nm text := nullif(btrim(coalesce(p_name, '')), '');
begin
  pid := public.device_check(p_device, p_secret);
  if nm is not null and length(nm) not between 2 and 24 then raise exception 'name length' using errcode = '22023'; end if;
  update players set name = nm where id = pid;
  return public.player_json(pid);
end $$;

-- після входу в акаунт: пристрій і акаунт — один гравець; якщо акаунт уже мав гравця — зливаємо
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

-- ---------- перенесення того, що вже зіграно ----------
-- кожен пристрій, що вже грав, отримує гравця
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

-- ім'я: останній нік, яким гравець підписувався
update players p set name = x.nick
from (select distinct on (device_id) device_id, btrim(nickname) nick from seasons
      where nickname is not null and length(btrim(nickname)) between 2 and 24 order by device_id, created_at desc) x
join player_links l on l.kind = 'device' and l.key = x.device_id::text
where p.id = l.player_id and p.name is null;

-- один акаунт грав з кількох пристроїв — зливаємо в одного гравця
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

-- Telegram-акаунти: прив'язка Telegram id → гравець, щоб ліги груп теж знали гравця
insert into player_links (kind, key, player_id)
select 'tg', substring(u.email from '^tg-(\d+)@users\.'), l.player_id
from auth.users u join player_links l on l.kind = 'auth' and l.key = u.id::text
where u.email ~ '^tg-\d+@users\.'
on conflict (kind, key) do nothing;
update league_results t set player_id = l.player_id from player_links l where l.kind = 'tg' and l.key = t.tg_user_id::text and t.player_id is null;
update league_members t set player_id = l.player_id from player_links l where l.kind = 'tg' and l.key = t.tg_user_id::text and t.player_id is null;

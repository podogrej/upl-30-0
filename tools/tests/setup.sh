#!/bin/bash
# Builds a DB from scratch in local Postgres (Supabase stub: stub.sql) and checks the SQL:
#  - new_db_part_A.sql + v039_part_B.sql + cards_bucket.sql apply, and a REPEATED run breaks nothing;
#  - v0.39 player: player_hello, set_player_name, device secret (another device can't rename), player_id trigger, strip_verified;
#  - v053_writes.sql (twice): device_ok server-only, an old device without a secret can't take over someone else's history (K6),
#    a shared device doesn't merge two accounts (V6), one official daily attempt (V2), duplicates → NOTICE without failing;
#  - v054_close_writes.sql (twice): direct anon/authenticated writes closed, reads and server still work;
#  - v055_backups.sql (twice): backups bucket private, anon/authenticated can't read or list files; rate_hit server-only.
#  - v059_player_page.sql (twice): Latin-only names (rules, transliteration, migration of old names and its rerun), case-insensitive uniqueness, 30 days, public_id, player page, account deletion,
#    per-player counters, no new direct anon writes; a DB with name collisions and a DB with the old v059 are brought to the rules.
#  - v060_one_player.sql (twice): "is this you?" prompt on second sign-in, answer only from the same sign-in, merge with log and rollback (unmerge_players),
#    "andré" reserved for the admin (rerun of v059 leaves it alone), news email (rules, private, erased with the account), show_r, season pick on the player page.
#  - v085_player_numbers.sql (twice): player_numbers own seasons only, offers closed for anon, "rejected" from 10 seasons, erased on delete_player.
#  - v087_data_protection.sql (twice): PII-free views and my_seasons, 5×5 lineups hidden until the result, tg id from app_metadata only (pre-registered accounts refused).
#  - v061_leagues.sql (twice): 11×11 leagues: create/join only when signed in, codes, attempt scoring (verified season, league rules and era, attempt limit), "by place" and "sum" tables, best/last attempt, my leagues.
#  DB is UTF8 with locale C (lower() leaves Cyrillic alone, the worst case; the name key does its own transliteration).
# Needs Postgres binaries (/usr/lib/postgresql/*/bin). Run from repo root: bash tools/tests/setup.sh   (KEEP=1: keep the DB running)
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1); [ -x "$BIN/initdb" ] || { echo "SQL: немає Postgres — пропускаю"; exit 2; }
D=$(mktemp -d /tmp/upl-pg.XXXXXX); PORT=${PGPORT_TEST:-5439}
AS=""; [ "$(id -u)" = 0 ] && { chown postgres "$D"; AS="su postgres -s /bin/bash -c"; }
run(){ if [ -n "$AS" ]; then $AS "$*"; else bash -c "$*"; fi; }
run "$BIN/initdb -D $D/data -A trust -U postgres -E UTF8 --locale=C >/dev/null" || { echo "SQL: initdb не вдався"; exit 2; }
run "$BIN/pg_ctl -D $D/data -o '-k $D -p $PORT -c listen_addresses=' -l $D/log -w start >/dev/null" || { cat "$D/log"; exit 2; }
[ -z "$KEEP" ] && trap 'run "$BIN/pg_ctl -D $D/data -m fast stop >/dev/null"; rm -rf "$D"' EXIT
P="$BIN/psql -h $D -p $PORT -U postgres -q -X -v ON_ERROR_STOP=1"
FAIL=0; N=0
ok(){ N=$((N+1)); echo "✓ $1"; }; bad(){ N=$((N+1)); FAIL=$((FAIL+1)); echo "✗ $1"; }
$P -c "create database t1" >/dev/null
$P -d t1 -f "$ROOT/tools/tests/stub.sql" >/dev/null 2>"$D/err" || { cat "$D/err"; exit 1; }
for pass in 1 2; do for f in new_db_part_A v039_part_B cards_bucket; do
  if $P -d t1 -f "$ROOT/sql/$f.sql" >/dev/null 2>"$D/err"; then ok "запуск $pass: $f.sql"; else bad "запуск $pass: $f.sql — $(grep -v NOTICE "$D/err" | head -3)"; fi
done; done
# check = plpgsql block run as a role; a failing assert fails the check
chk(){ local name="$1" role="$2" sql="$3"
  if $P -d t1 >/dev/null 2>"$D/err" <<SQL
begin; set local role $role; select set_config('request.jwt.claims', '{"role":"$role"$4}', true);
do \$\$ declare j json; k json; pid uuid; begin $sql end \$\$;
commit;
SQL
  then ok "$name"; else bad "$name — $(grep -v NOTICE "$D/err" | grep -m1 -E 'ERROR|assert' )"; fi; }
DEV=aaaaaaaa-0000-4000-a000-000000000001; SEC=0123456789abcdef0123456789abcdef
chk "player_hello: новий гравець з анонімним ім'ям, той самий при повторі" anon "
  j := player_hello('$DEV', '$SEC'); k := player_hello('$DEV', '$SEC');
  assert j->>'id' is not null and j->>'anon_name' <> '' and j->>'name' is null, 'hello ' || j::text;
  assert j->>'id' = k->>'id', 'різні гравці';"
chk "set_player_name: своїм секретом" anon "
  j := set_player_name('$DEV', '$SEC', '  Андрій '); assert j->>'name' = 'Андрій', j::text;"
chk "set_player_name: чужий секрет — відмова" anon "
  begin j := set_player_name('$DEV', 'attacker-attacker-attacker', 'Hacked'); assert false, 'перейменував без секрету';
  exception when sqlstate '28000' then null; end;
  assert (player_hello('$DEV', '$SEC'))->>'name' = 'Андрій', 'ім''я змінилось';"
chk "set_player_name: ім'я з 1 літери — відмова" anon "
  begin j := set_player_name('$DEV', '$SEC', 'A'); assert false, 'прийняв 1 літеру'; exception when sqlstate '22023' then null; end;"
chk "anon не викликає службові функції (device_check)" anon "
  begin pid := device_check('$DEV', '$SEC'); assert false, 'викликав'; exception when insufficient_privilege then null; end;"
chk "сезон від anon: player_id ставить база, verified зі сторони гравця — скидається, gd рахується" anon "
  insert into seasons(device_id, mode, format, formation, w, d, l, pts, place, gf, ga, verified) values ('$DEV', 'normal', 'classic', '4-4-2', 20, 5, 5, 65, 2, 60, 30, true);
  assert (select player_id::text from seasons where device_id = '$DEV' order by id desc limit 1) = (player_hello('$DEV', '$SEC'))->>'id', 'player_id';
  assert (select verified is null and gd = 30 and competition = 'upl' from seasons where device_id = '$DEV' order by id desc limit 1), 'verified/gd/competition';"
chk "сезон з неможливим рахунком — відмова (RLS)" anon "
  begin insert into seasons(device_id, mode, format, formation, w, d, l, pts, place, gf, ga) values ('$DEV', 'normal', 'classic', '4-4-2', 30, 0, 0, 99, 1, 90, 0); assert false, 'прийняв 99 очок';
  exception when insufficient_privilege then null; end;"
chk "порожнє ім'я — знову анонімний" anon "
  j := set_player_name('$DEV', '$SEC', ''); assert j->>'name' is null and j->>'anon_name' <> '', j::text;"
$P -d t1 -c "insert into auth.users(id,email) values ('11111111-1111-4111-a111-111111111111','tg-555@users.upl-30-0.vercel.app')" >/dev/null
chk "link_account: вхід прив'язує пристрій і Telegram до того ж гравця" authenticated "
  j := player_hello('$DEV', '$SEC'); k := link_account('$DEV', '$SEC');
  assert j->>'id' = k->>'id', 'інший гравець ' || k::text;" ',"sub":"11111111-1111-4111-a111-111111111111"'
chk "link_account: у player_links є device, auth і tg одного гравця" postgres "
  assert (select count(distinct kind) = 3 and count(distinct player_id) = 1 from player_links where key in ('$DEV', '11111111-1111-4111-a111-111111111111', '555')), 'звʼязки';"
# ===== 0.53 =====
LDEV=bbbbbbbb-0000-4000-a000-000000000002; EDEV=bbbbbbbb-0000-4000-a000-000000000003; NDEV=bbbbbbbb-0000-4000-a000-000000000004
SEC2=fedcba9876543210fedcba9876543210; U2=22222222-2222-4222-a222-222222222222
# legacy device (pre-0.39: has a season, no secret) and a legacy device without history; production names of the daily policies
$P -d t1 >/dev/null 2>"$D/err" <<SQL || { cat "$D/err"; exit 1; }
begin; set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into seasons(device_id, mode, format, formation, w, d, l, pts, place, gf, ga, nickname) values ('$LDEV', 'normal', 'classic', '4-4-2', 10, 10, 10, 40, 8, 30, 30, 'Власник');
commit;
select player_for_device('$EDEV');
update players set name = 'Власник' where id = (select player_id from player_links where key = '$LDEV');
create policy "insert today" on daily_results for insert to anon with check (day between (now() at time zone 'Europe/Kyiv')::date - 1 and (now() at time zone 'Europe/Kyiv')::date);
create policy "read all" on daily_results for select to anon using (true);
-- test only: let anon/authenticated checks read player_links (RLS)
create function t_link(p_kind text, p_key text) returns uuid language sql security definer as \$\$ select player_id from player_links where kind = p_kind and key = p_key \$\$;
create function t_row(p_key text) returns player_links language sql security definer as \$\$ select * from player_links where kind = 'device' and key = p_key \$\$;
SQL
for pass in 1 2; do
  if $P -d t1 -f "$ROOT/sql/v053_writes.sql" >/dev/null 2>"$D/err"; then ok "запуск $pass: v053_writes.sql"; else bad "запуск $pass: v053_writes.sql — $(grep -v NOTICE "$D/err" | head -3)"; fi
done
chk "device_ok: anon і authenticated не викликають" anon "
  begin pid := device_ok('$DEV', '$SEC'); assert false, 'anon викликав'; exception when insufficient_privilege then null; end;"
chk "device_ok: authenticated не викликає" authenticated "
  begin pid := device_ok('$DEV', '$SEC'); assert false, 'authenticated викликав'; exception when insufficient_privilege then null; end;"
chk "device_ok (сервер): свій секрет — гравець пристрою, чужий — 28000" service_role "
  pid := device_ok('$DEV', '$SEC'); assert pid = t_link('device', '$DEV'), 'не той гравець';
  begin pid := device_ok('$DEV', 'wrong-wrong-wrong-wrong'); assert false, 'прийняв чужий секрет'; exception when sqlstate '28000' then null; end;
  begin pid := device_ok('$DEV', 'short'); assert false, 'прийняв короткий секрет'; exception when sqlstate '22023' then null; end;"
chk "legacy_writes_open() до кроку 2 — true" service_role "assert legacy_writes_open(), 'закрито зарано';"
chk "К6: старий пристрій з історією — новий порожній гравець, стара історія й ім'я не чіпаються" anon "
  declare old uuid := (select player_id from seasons where device_id = '$LDEV' limit 1); begin
  j := player_hello('$LDEV', '$SEC2');
  assert (j->>'id')::uuid <> old and j->>'name' is null, 'забрав старого гравця ' || j::text;
  j := set_player_name('$LDEV', '$SEC2', 'Зловмисник');
  assert (select name from players where id = old) = 'Власник', 'перейменував старого гравця';
  assert (select count(*) from seasons where player_id = old) = 1, 'історію перенесено';
  assert (t_row('$LDEV')).claimed_from = old, 'claimed_from';
  begin j := player_hello('$LDEV', '$SEC'); assert false, 'другий секрет прийнято'; exception when sqlstate '28000' then null; end;
  end;"
chk "К6: старий пристрій без історії і новий пристрій — секрет реєструється на того ж гравця" anon "
  declare old uuid := t_link('device', '$EDEV'); begin
  j := player_hello('$EDEV', '$SEC2'); assert (j->>'id')::uuid = old, 'новий гравець для порожнього пристрою';
  j := player_hello('$NDEV', '$SEC2'); k := player_hello('$NDEV', '$SEC2'); assert j->>'id' = k->>'id', 'різні гравці';
  assert ((t_row('$NDEV')).secret_set_at is not null and (t_row('$NDEV')).claimed_from is null), 'secret_set_at';
  end;"
chk "К6: пристрій із секретом до 0.53 — той самий гравець" anon "
  j := player_hello('$DEV', '$SEC'); assert (j->>'id')::uuid = t_link('auth', '11111111-1111-4111-a111-111111111111'), 'не той гравець';"
$P -d t1 -c "insert into auth.users(id,email) values ('$U2','second@gmail.com')" >/dev/null
$P -d t1 -c "insert into seasons(device_id, mode, format, formation, w, d, l, pts, place, gf, ga) values ('$DEV', 'normal', 'classic', '4-4-2', 10, 10, 10, 40, 8, 30, 30)" >/dev/null
chk "В6: другий акаунт на спільному пристрої — свій гравець, історії не зливаються" authenticated "
  declare a uuid := t_link('auth', '11111111-1111-4111-a111-111111111111'); n int := (select count(*) from seasons where player_id = a); begin
  j := link_account('$DEV', '$SEC');
  assert (j->>'id')::uuid <> a, 'злив із першим акаунтом';
  assert t_link('device', '$DEV') = (j->>'id')::uuid, 'пристрій не перейшов';
  assert t_link('auth', '11111111-1111-4111-a111-111111111111') = a, 'перший акаунт зачеплено';
  assert (select count(*) from seasons where player_id = a) = n and (select merged_into is null from players where id = a), 'історію першого перенесено';
  end;" ',"sub":"'$U2'"'
chk "В6: перший акаунт знову входить — пристрій повертається до нього, без злиття" authenticated "
  declare a uuid := t_link('auth', '11111111-1111-4111-a111-111111111111'); b uuid := t_link('auth', '$U2'); begin
  j := link_account('$DEV', '$SEC');
  assert (j->>'id')::uuid = a and t_link('device', '$DEV') = a, 'не повернувся';
  assert (select merged_into is null from players where id = b), 'другого злито';
  end;" ',"sub":"11111111-1111-4111-a111-111111111111"'
chk "В6: анонімна історія пристрою без акаунта — як раніше приєднується до акаунта" authenticated "
  declare d uuid := t_link('device', '$NDEV'); begin
  j := link_account('$NDEV', '$SEC2');
  assert (select merged_into from players where id = d) = (j->>'id')::uuid, 'не приєднано';
  end;" ',"sub":"'$U2'"'
chk "В2: друга офіційна спроба дня того ж пристрою — відмова (унікальний індекс)" service_role "
  insert into season_seeds(device_id, xi_hash, seed, day, daily, official) values ('$DEV', 'x', 1, '2026-10-01', true, true);
  insert into season_seeds(device_id, xi_hash, seed, day, daily, official) values ('$DEV', 'x', 2, '2026-10-01', true, false);
  begin insert into season_seeds(device_id, xi_hash, seed, day, daily, official) values ('$DEV', 'x', 3, '2026-10-01', true, true); assert false, 'дві офіційні';
  exception when unique_violation then null; end;"
chk "сайт 0.52 у кроці 1: anon ще пише сезон напряму" anon "
  insert into seasons(device_id, mode, format, formation, w, d, l, pts, place, gf, ga) values ('$NDEV', 'normal', 'classic', '4-4-2', 10, 10, 10, 40, 8, 30, 30);"
# V2 on a DB that already has duplicates: file doesn't fail, index is not created
$P -c "create database t2" >/dev/null
if { $P -d t2 -f "$ROOT/tools/tests/stub.sql" && $P -d t2 -f "$ROOT/sql/new_db_part_A.sql" && $P -d t2 -f "$ROOT/sql/v039_part_B.sql" \
     && $P -d t2 -c "insert into season_seeds(device_id, xi_hash, seed, day, daily, official) select '$DEV', 'x', g, '2026-10-01', true, true from generate_series(1,2) g" \
     && $P -d t2 -f "$ROOT/sql/v053_writes.sql"; } >/dev/null 2>"$D/err" && grep -q "НЕ створено" "$D/err" \
   && [ "$($P -d t2 -tAc "select count(*) from pg_indexes where indexname = 'season_seeds_official_uq'")" = 0 ]
then ok "В2: дублі вже є — NOTICE, індекс не створено, файл не падає"; else bad "В2: база з дублями — $(grep -v NOTICE "$D/err" | head -2)"; fi
# ===== v054: close direct writes =====
for pass in 1 2; do
  if $P -d t1 -f "$ROOT/sql/v054_close_writes.sql" >/dev/null 2>"$D/err"; then ok "запуск $pass: v054_close_writes.sql"; else bad "запуск $pass: v054_close_writes.sql — $(grep -v NOTICE "$D/err" | head -3)"; fi
done
if $P -d t1 -f "$ROOT/sql/v053_writes.sql" >/dev/null 2>"$D/err"; then ok "v053 після v054 — без помилок"; else bad "v053 після v054 — $(grep -v NOTICE "$D/err" | head -3)"; fi
for role in anon authenticated; do
chk "крок 2: $role не пише напряму в seasons / trophies / daily_results / challenges / challenge_results" $role "
  begin insert into seasons(device_id, mode, format, formation, w, d, l, pts, place, gf, ga) values ('$NDEV', 'normal', 'classic', '4-4-2', 10, 10, 10, 40, 8, 30, 30); assert false, 'seasons'; exception when insufficient_privilege then null; end;
  begin insert into trophies(device_id, trophy) values ('$NDEV', 'hack'); assert false, 'trophies'; exception when insufficient_privilege then null; end;
  begin insert into daily_results(day, device_id, nickname, w, d, l, pts) values ((now() at time zone 'Europe/Kyiv')::date, '$NDEV', 'hack', 30, 0, 0, 90); assert false, 'daily_results'; exception when insufficient_privilege then null; end;
  begin insert into challenges(id, seed, formation, year, mode, w, d, l, pts, place) values ('hackhack', 1, '4-4-2', 9001, 'normal', 30, 0, 0, 90, 1); assert false, 'challenges'; exception when insufficient_privilege then null; end;
  begin insert into challenge_results(challenge_id, device_id, w, d, l, pts, place) values ('hackhack', '$NDEV', 30, 0, 0, 90, 1); assert false, 'challenge_results'; exception when insufficient_privilege then null; end;
  begin update seasons set nickname = 'hack' where device_id = '$LDEV'; assert false, 'nickname'; exception when insufficient_privilege then null; end;
  assert (select count(*) from seasons) > 0 and (select count(*) >= 0 from daily_results), 'читання';"
done
chk "крок 2: claim_device закрито" authenticated "
  begin perform claim_device('$DEV'); assert false, 'викликав'; exception when insufficient_privilege then null; end;" ',"sub":"'$U2'"'
chk "крок 2: політики читання лишились, «insert today»/«daily insert» прибрано" postgres "
  assert (select count(*) from pg_policies where tablename = 'daily_results' and policyname in ('insert today', 'daily insert', 'daily insert auth')) = 0, 'insert-політики';
  assert (select count(*) from pg_policies where tablename = 'daily_results' and policyname in ('read all', 'daily read', 'daily read auth')) = 3, 'read-політики';
  assert (select count(*) from pg_policies where tablename = 'seasons' and cmd <> 'SELECT') = 0, 'seasons не лише читання';"
chk "крок 2: сервер пише (player_id — з пристрою), device_ok працює, /api/seed без секрету закрито" service_role "
  pid := device_ok('$LDEV', '$SEC2');
  insert into seasons(device_id, mode, format, formation, w, d, l, pts, place, gf, ga, verified) values ('$LDEV', 'normal', 'classic', '4-4-2', 10, 10, 10, 40, 8, 30, 30, true);
  assert (select player_id = pid and verified from seasons where device_id = '$LDEV' order by id desc limit 1), 'сезон сервера';
  insert into trophies(device_id, trophy) values ('$LDEV', 'srv') on conflict do nothing;
  insert into daily_results(day, device_id, nickname, w, d, l, pts, place, gf, ga, formation, xi, verified) values ((now() at time zone 'Europe/Kyiv')::date, '$LDEV', 'Сервер', 10, 10, 10, 40, 8, 30, 30, '4-4-2', '[]', true);
  assert not legacy_writes_open(), 'legacy ще відкрито';"
# ===== v055: backups and rate limiting =====
$P -d t1 -c "update storage.buckets set public = true where id = 'backups'" >/dev/null
for pass in 1 2; do
  if $P -d t1 -f "$ROOT/sql/v055_backups.sql" >/dev/null 2>"$D/err"; then ok "запуск $pass: v055_backups.sql"; else bad "запуск $pass: v055_backups.sql — $(grep -v NOTICE "$D/err" | head -3)"; fi
done
$P -d t1 -c "update storage.buckets set public = true where id = 'backups'" -f "$ROOT/sql/v055_backups.sql" >/dev/null 2>"$D/err"
$P -d t1 -c "insert into storage.objects(bucket_id, name) values ('backups', '2026-09-30.json.gz'), ('cards', '2026-09-30/x.jpg')" >/dev/null
chk "v055: сховище backups приватне (навіть якщо хтось увімкнув public — повторний запуск вимикає), cards — як було" postgres "
  assert (select not public and file_size_limit > 0 from storage.buckets where id = 'backups'), 'backups public';
  assert (select public from storage.buckets where id = 'cards'), 'cards зачеплено';
  assert (select count(*) from pg_policies where schemaname = 'storage') = 0, 'є політики на storage';"
for role in anon authenticated; do
chk "v055: $role не читає й не бачить файлів резервних копій, не пише туди" $role "
  assert (select count(*) from storage.objects where bucket_id = 'backups') = 0, 'бачить файли';
  begin insert into storage.objects(bucket_id, name) values ('backups', 'hack.json.gz'); assert false, 'записав'; exception when insufficient_privilege then null; end;"
chk "v055: $role не викликає rate_hit і не читає rate_hits" $role "
  declare b boolean; begin
  begin b := rate_hit('x', 5); assert false, 'викликав'; exception when insufficient_privilege then null; end;
  begin perform count(*) from rate_hits; assert false, 'читає'; exception when insufficient_privilege then null; end;
  end;"
done
chk "v055: rate_hit (сервер) — ліміт за хвилину на ключ, інші ключі окремо" service_role "
  assert rate_hit('seed:d:1', 3) and rate_hit('seed:d:1', 3) and rate_hit('seed:d:1', 3), 'в межах ліміту';
  assert not rate_hit('seed:d:1', 3), 'четвертий пропущено';
  assert rate_hit('seed:d:2', 3), 'інший ключ';
  assert rate_hit(null, 3) and rate_hit(repeat('x', 200), 3), 'дивний ключ — пропускаємо';"
$P -d t1 -c "insert into rate_hits(key, minute, n) select 'old'||g, now() - interval '1 hour', 1 from generate_series(1,50) g" >/dev/null
chk "v055: старі хвилини прибираються" service_role "
  declare i int; begin for i in 1..400 loop perform rate_hit('clean', 1000); end loop;
  assert (select count(*) from rate_hits where key like 'old%') = 0, 'не прибрано'; end;"
# ===== v059: player page and names (Latin only) =====
$P -d t1 -c "select count(*) from pg_policies" -tA > "$D/pol_before" 2>/dev/null
$P -d t1 -c "insert into players(anon_name, name) values ('Brave Fox', 'Вітя'), ('Calm Owl', 'andré'), ('Bold Hawk', 'Anna Maria'), ('Quiet Lynx', 'Щербак')" >/dev/null   # legacy names: Cyrillic, "é", space and uppercase
snap(){ $P -d t1 -tAc "select string_agg(id || ':' || coalesce(name, '-') || ':' || anon_name || ':' || coalesce(name_changed_at::text, '-'), ',' order by id) from players"; }
if $P -d t1 -f "$ROOT/sql/v059_player_page.sql" -tA >"$D/ren1" 2>"$D/err"; then ok "запуск 1: v059_player_page.sql"; else bad "запуск 1: v059_player_page.sql — $(grep -v NOTICE "$D/err" | head -3)"; fi
S1=$(snap)
if $P -d t1 -f "$ROOT/sql/v059_player_page.sql" -tA >"$D/ren2" 2>"$D/err"; then ok "запуск 2: v059_player_page.sql"; else bad "запуск 2: v059_player_page.sql — $(grep -v NOTICE "$D/err" | head -3)"; fi
if grep -qx "Вітя|vitia" "$D/ren1" && grep -qx "andré|andre" "$D/ren1" && grep -qx "Anna Maria|anna_maria" "$D/ren1" && grep -qx "Щербак|shcherbak" "$D/ren1" && [ ! -s "$D/ren2" ] && [ "$S1" = "$(snap)" ]
then ok "міграція імен: «було → стало» (Вітя → vitia, andré → andre, Anna Maria → anna_maria, Щербак → shcherbak); повторний запуск нічого не змінює"
else bad "міграція імен — 1: $(tr '\n' ' ' < "$D/ren1") · 2: $(tr '\n' ' ' < "$D/ren2")"; fi
if $P -d t1 -f "$ROOT/sql/v059_name_conflicts.sql" -tA >"$D/conf" 2>"$D/err" && [ ! -s "$D/conf" ]; then ok "v059_name_conflicts.sql читається; після міграції — порожньо"; else bad "v059_name_conflicts.sql — $(head -3 "$D/err") $(head -3 "$D/conf")"; fi
if $P -d t1 -f "$ROOT/sql/v053_writes.sql" >/dev/null 2>"$D/err" && $P -d t1 -f "$ROOT/sql/v055_backups.sql" >/dev/null 2>>"$D/err"; then ok "v053/v055 після v059 — без помилок"; else bad "v053/v055 після v059 — $(grep -v NOTICE "$D/err" | head -3)"; fi
chk "v059: нових політик немає, anon/authenticated не пишуть у players і player_links" postgres "
  assert (select count(*) from pg_policies)::text = '$(cat "$D/pol_before")', 'кількість політик змінилась';
  assert not has_table_privilege('anon', 'players', 'insert') or not exists (select 1 from pg_policies where tablename = 'players' and cmd <> 'SELECT'), 'players: політика запису';
  assert not exists (select 1 from pg_policies where tablename in ('players','player_links') and cmd <> 'SELECT'), 'запис у players/player_links';
  assert (select count(*) from pg_indexes where indexname in ('players_name_uq', 'players_public_id_uq')) = 2, 'індекси';"
chk "v059: після міграції всі живі імена за правилами, унікальні; анонімні — «silent_owl»; переписаним — одна зміна без очікування" postgres "
  assert (select count(*) from players where name is not null and merged_into is null and deleted_at is null and name_problem(name) is not null) = 0, 'імена не за правилами';
  assert (select count(*) from players where anon_name !~ '^[a-z0-9_]+\$') = 0, (select string_agg(anon_name, ',') from players where anon_name !~ '^[a-z0-9_]+\$');
  assert (select name_changed_at is null from players where name = 'vitia'), 'name_changed_at';"
chk "v059: public_id у всіх гравців, унікальний, 8 символів; новий гравець теж отримує" postgres "
  assert (select count(*) from players where public_id is null or public_id !~ '^[a-z2-9]{8}\$') = 0, 'public_id';
  pid := player_for_device('cccccccc-0000-4000-a000-000000000009'); assert (select public_id is not null from players where id = pid), 'новий без public_id';"
chk "v059: нове анонімне ім'я — латиниця, нижній регістр, «_» замість пробілу" postgres "
  declare a text := anon_name(); begin assert a ~ '^[a-z]+_[a-z]+\$', a; end;"
chk "name_translit: офіційна транслітерація (КМУ 2010) і чистка" postgres "
  declare t text[][] := array[['Андрій','andrii'],['Вітя','vitia'],['Щербак','shcherbak'],['Юлія','yuliia'],['Євген','yevhen'],['Андрій Шевченко','andrii_shevchenko'],
    ['Олексій','oleksii'],['Костянтин','kostiantyn'],['Згорани','zghorany'],['В’ячеслав','viacheslav'],['Їжак','yizhak'],['Юрій Йосипенко','yurii_yosypenko'],
    ['Ярослав Ґонта','yaroslav_gonta'],['Сергій','serhii'],['ЩУКА','shchuka'],['Эдуард Ёлкин','eduard_yolkyn'],['Подъезд Ы','podezd_y'],['André','andre'],
    ['Anna-Maria','anna_maria'],['🔥 Max 🔥','max'],['  __Vitya..7__ ','vitya.7'],['Олександра Костянтинівна','oleksandra_kostianty']]; i int; begin
  for i in 1 .. array_length(t, 1) loop assert name_translit(t[i][1]) = t[i][2], t[i][1] || ' → ' || name_translit(t[i][1]) || ' (треба ' || t[i][2] || ')'; end loop; end;"
chk "name_problem: довжина, лише a-z 0-9 _ ., літера, краї, мат (корені латиницею; «^hui» — лише з початку слова)" postgres "
  declare t text[][] := array[['ab','name_len'],['andrii.s',''],['vitya_7',''],['12345','name_chars'],['Andrii','name_chars'],['андрій','name_chars'],['andrii sh','name_chars'],
    ['_andrii','name_edge'],['andrii.','name_edge'],['super_hui','name_bad'],['hui123','name_bad'],['chuiko',''],['pizdets','name_bad'],['blyad.x','name_bad'],['m_u_d_a_k','name_bad'],
    ['FUCK','name_chars'],['xfuckx','name_bad'],[repeat('a', 21),'name_len']]; i int; begin
  for i in 1 .. array_length(t, 1) loop assert coalesce(name_problem(t[i][1]), '') = t[i][2], t[i][1] || ' → ' || coalesce(name_problem(t[i][1]), 'ok'); end loop; end;"
chk "set_player_name: нижній регістр, пробіл → «_»; той самий ключ — без відліку 30 днів" anon "
  j := set_player_name('$DEV', '$SEC', 'Andrii Sh'); assert j->>'name' = 'andrii_sh' and j->>'public_id' is not null, j::text;
  j := set_player_name('$DEV', '$SEC', 'ANDRII_SH'); assert j->>'name' = 'andrii_sh', 'другий раз ' || j::text;"
chk "set_player_name: правила — 2 символи, кирилиця, лише цифри, краї, мат, 21 символ" anon "
  begin j := set_player_name('$DEV', '$SEC', 'ab'); assert false, '2 символи'; exception when sqlstate '22023' then assert sqlerrm = 'name_len', sqlerrm; end;
  begin j := set_player_name('$DEV', '$SEC', 'андрій'); assert false, 'кирилиця'; exception when sqlstate '22023' then assert sqlerrm = 'name_chars', sqlerrm; end;
  begin j := set_player_name('$DEV', '$SEC', '12345'); assert false, 'цифри'; exception when sqlstate '22023' then assert sqlerrm = 'name_chars', sqlerrm; end;
  begin j := set_player_name('$DEV', '$SEC', 'andrii_'); assert false, 'краї'; exception when sqlstate '22023' then assert sqlerrm = 'name_edge', sqlerrm; end;
  begin j := set_player_name('$DEV', '$SEC', 'Super_HUI'); assert false, 'мат'; exception when sqlstate '22023' then assert sqlerrm = 'name_bad', sqlerrm; end;
  begin j := set_player_name('$DEV', '$SEC', repeat('a', 21)); assert false, '21'; exception when sqlstate '22023' then assert sqlerrm = 'name_len', sqlerrm; end;
  assert (player_hello('$DEV', '$SEC'))->>'name' = 'andrii_sh', 'ім''я змінилось';"
chk "set_player_name: зайняте без урахування регістру (у базі «vitia» з «Вітя») — name_taken" anon "
  begin j := set_player_name('$NDEV', '$SEC2', 'VITIA'); assert false, 'взяв зайняте'; exception when sqlstate '23505' then assert sqlerrm = 'name_taken', sqlerrm; end;"
chk "set_player_name: сайт 0.58 шле перше ім'я кирилицею — сервер переписує латиницею; друга зміна — лише через 30 днів (name_wait:дата)" anon "
  j := set_player_name('$EDEV', '$SEC2', 'Сергій'); assert j->>'name' = 'serhii' and j->>'name_next' is null, j::text;
  j := set_player_name('$EDEV', '$SEC2', 'serhii.2'); assert j->>'name' = 'serhii.2' and j->>'name_next' is not null, j::text;
  begin j := set_player_name('$EDEV', '$SEC2', 'serhii3'); assert false, 'друга зміна'; exception when sqlstate '22023' then assert sqlerrm like 'name_wait:____-__-__', sqlerrm; end;
  begin j := set_player_name('$EDEV', '$SEC2', ''); assert false, 'скинув'; exception when sqlstate '22023' then assert sqlerrm like 'name_wait:%', sqlerrm; end;
  begin j := set_player_name('$EDEV', '$SEC2', 'Сергій'); assert false, 'кирилиця з іменем'; exception when sqlstate '22023' then assert sqlerrm = 'name_chars', sqlerrm; end;"
chk "set_player_name: чужий секрет — відмова (як раніше)" anon "
  begin j := set_player_name('$DEV', 'attacker-attacker-attacker', 'hacked'); assert false, 'перейменував'; exception when sqlstate '28000' then null; end;"
chk "set_player_auto_name: з Telegram/Google — транслітерація, зайняте — з номером, коротке — анонімний, є ім'я — не чіпає" anon "
  j := set_player_auto_name('dddddddd-0000-4000-a000-000000000001', '$SEC', 'Андрій'); assert j->>'name' = 'andrii', j::text;
  j := set_player_auto_name('dddddddd-0000-4000-a000-000000000002', '$SEC', 'АНДРІЙ'); assert j->>'name' = 'andrii2' and j->>'name_next' is null, j::text;
  j := set_player_auto_name('dddddddd-0000-4000-a000-000000000003', '$SEC', 'Ю'); assert j->>'name' is null and j->>'anon_name' ~ '^[a-z]+_[a-z]+\$', j::text;
  j := set_player_auto_name('dddddddd-0000-4000-a000-000000000004', '$SEC', 'Олександра Костянтинівна'); assert j->>'name' = 'oleksandra_kostianty', j::text;
  j := set_player_auto_name('dddddddd-0000-4000-a000-000000000005', '$SEC', 'Oleksandra Kostiantynivna'); assert j->>'name' = 'oleksandra_kostiant2', j::text;
  j := set_player_auto_name('dddddddd-0000-4000-a000-000000000001', '$SEC', 'Петро'); assert j->>'name' = 'andrii', 'перейменував ' || j::text;
  begin j := set_player_auto_name('dddddddd-0000-4000-a000-000000000001', 'attacker-attacker-attacker', 'x'); assert false, 'чужий секрет'; exception when sqlstate '28000' then null; end;
  begin perform name_free('abc', null); assert false, 'name_free для anon'; exception when insufficient_privilege then null; end;"
chk "унікальний індекс: навіть сервер не запише друге «SERHII.2»" service_role "
  begin update players set name = 'SERHII.2', merged_into = null where id = t_link('device', '$NDEV'); assert false, 'дубль'; exception when unique_violation then null; end;"
chk "merge_players з однаковими іменами не падає на унікальному індексі" postgres "
  declare a uuid; b uuid; begin
  insert into players(anon_name) values ('m1') returning id into a; insert into players(anon_name) values ('m2') returning id into b;
  update players set name = 'merge_me' where id = a; perform merge_players(a, b);
  assert (select name from players where id = b) = 'merge_me' and (select merged_into from players where id = a) = b, 'злиття';
  end;"
chk "player_profile_pub (anon): ім'я, цифри, трофеї; без device_id" anon "
  j := player_profile_pub((player_hello('$DEV', '$SEC'))->>'public_id');
  assert j->>'name' = 'andrii_sh' and (j->>'seasons')::int >= 1 and j->'best' is not null and json_typeof(j->'trophies') = 'array', j::text;
  assert j::text !~ '$DEV' and j::text !~ 'device', 'є device_id';
  assert player_profile_pub('nosuchid') is null, 'невідомий';"
chk "game_stats / trophy_stats: «гравців» за player_id" anon "
  assert (game_stats()->>'players')::int = (select count(distinct coalesce(player_id::text, device_id::text)) from seasons), 'game_stats';
  assert (trophy_stats()->>'players')::int >= 1, 'trophy_stats';"
chk "delete_player: чужий секрет — відмова" anon "
  begin j := delete_player('$DEV', 'attacker-attacker-attacker'); assert false, 'видалив'; exception when sqlstate '28000' then null; end;"
chk "delete_player: ім'я й прив'язки стерто, результати лишились під анонімним іменем, пристрій — новий гравець" authenticated "
  declare old uuid := t_link('device', '$LDEV'); pub text := (select public_id from players where id = t_link('device', '$LDEV')); n int := (select count(*) from seasons where player_id = t_link('device', '$LDEV')); begin
  update players set name = 'на видалення' where id = old;
  j := delete_player('$LDEV', '$SEC2'); assert (j->>'ok')::boolean, j::text;
  assert (select name is null and deleted_at is not null from players where id = old), 'гравець';
  assert (select count(*) from player_links where player_id = old) = 0, 'прив''язки';
  assert (select count(*) from seasons where player_id = old) = n and (select count(*) from seasons where player_id = old and (nickname is not null or tg_name is not null)) = 0, 'сезони';
  assert (player_profile_pub(pub))->>'deleted' = 'true', 'профіль';
  j := player_hello('$LDEV', '$SEC2'); assert (j->>'id')::uuid <> old and j->>'name' is null, 'пристрій не новий';
  end;"
chk "delete_player: вхід іншого гравця — відмова" authenticated "
  begin j := delete_player('$DEV', '$SEC'); assert false, 'видалив чужого'; exception when sqlstate '28000' then null; end;" ',"sub":"'$U2'"'
# ===== v060: one player per person: "is this you?" prompt, merge log, "andré", email, show_r, season pick on the page =====
$P -d t1 -c "select count(*) from pg_policies" -tA > "$D/pol_before60" 2>/dev/null
for pass in 1 2; do
  if $P -d t1 -f "$ROOT/sql/v060_one_player.sql" >/dev/null 2>"$D/err"; then ok "запуск $pass: v060_one_player.sql"; else bad "запуск $pass: v060_one_player.sql — $(grep -v NOTICE "$D/err" | head -3)"; fi
done
chk "v060: нових політик немає; нові таблиці закриті для anon/authenticated" postgres "
  assert (select count(*) from pg_policies)::text = '$(cat "$D/pol_before60")', 'кількість політик змінилась';
  assert not has_table_privilege('anon', 'merge_log', 'select') and not has_table_privilege('authenticated', 'merge_offers', 'insert')
     and not has_table_privilege('anon', 'name_reserved', 'select') and not has_table_privilege('authenticated', 'name_reserved', 'update'), 'права на нові таблиці';
  assert (select relrowsecurity from pg_class where relname = 'merge_offers') and (select relrowsecurity from pg_class where relname = 'merge_log'), 'RLS';
  assert exists (select 1 from information_schema.columns where table_name = 'seasons' and column_name = 'show_r'), 'show_r';"
MX=eeeeeeee-0000-4000-a000-000000000001; UT=33333333-3333-4333-a333-333333333333; UG=44444444-4444-4444-a444-444444444444
$P -d t1 >/dev/null 2>"$D/err" <<SQL || { cat "$D/err"; exit 1; }
insert into auth.users(id,email) values ('$UT','tg-777@users.upl-30-0.vercel.app'), ('$UG','g60@example.com');
-- test only: let authenticated checks read the closed v060 tables
create function t_offers() returns bigint language sql security definer as \$\$ select count(*) from merge_offers \$\$;
create function t_offer() returns uuid language sql security definer as \$\$ select id from merge_offers order by created_at limit 1 \$\$;
create function t_new_offer(s uuid, d uuid) returns uuid language sql security definer as \$\$ insert into merge_offers(src, dst) values (s, d) returning id \$\$;
create function t_answer(o uuid) returns text language sql security definer as \$\$ select answer from merge_offers where id = o \$\$;
create function t_contacts(p uuid) returns bigint language sql security definer as \$\$ select count(*) from player_contacts where player_id = p \$\$;
create function t_logged(s uuid, d uuid) returns bigint language sql security definer as \$\$ select count(*) from merge_log where src = s and dst = d and jsonb_array_length(moved->'seasons') = 1 \$\$;
select player_hello('$MX', '$SEC');
insert into seasons(device_id, mode, format, formation, w, d, l, pts, place, gf, ga) values ('$MX', 'normal', 'classic', '4-4-2', 20, 5, 5, 65, 2, 60, 30);
update players set name = 'tester60' where id = (select player_id from player_links where kind = 'device' and key = '$MX');
SQL
chk "v060: перший вхід (Telegram) на пристрої без чужого входу — як раніше, без питання" authenticated "
  j := link_account('$MX', '$SEC'); assert j->>'name' = 'tester60' and j->'merge_offer' is null or json_typeof(j->'merge_offer') = 'null', j::text;" ',"sub":"'$UT'"'
chk "v060: другий вхід (Google) на тому ж пристрої — новий гравець і питання «Це ти?» з ім'ям і кількістю сезонів; повтор — те саме питання" authenticated "
  j := link_account('$MX', '$SEC'); assert j->>'name' is null and j->'merge_offer'->>'name' = 'tester60' and (j->'merge_offer'->>'seasons')::int = 1, j::text;
  k := link_account('$MX', '$SEC'); assert k->'merge_offer'->>'id' = j->'merge_offer'->>'id', 'друге питання ' || k::text;
  assert t_offers() = 1, 'кількість питань';" ',"sub":"'$UG'"'
chk "v060: відповісти може лише той самий вхід; anon — ні" authenticated "
  begin j := merge_answer('$MX', '$SEC', t_offer(), true); assert false, 'чужий вхід відповів';
  exception when sqlstate '22023' then null; end;" ',"sub":"'$UT'"'
chk "v060: anon не викликає merge_answer / unmerge_players / merge_players_logged" anon "
  begin j := merge_answer('$MX', '$SEC', (gen_random_uuid()), true); assert false, 'anon'; exception when insufficient_privilege then null; end;
  begin perform unmerge_players(1); assert false, 'unmerge'; exception when insufficient_privilege then null; end;
  begin perform merge_players_logged(gen_random_uuid(), gen_random_uuid(), 'x'); assert false, 'logged'; exception when insufficient_privilege then null; end;"
chk "v060: «Так» — історія й вхід старого гравця переходять до нового, ім'я — старе (новий без історії), запис у журналі; вдруге — відмова" authenticated "
  declare old uuid := t_link('auth', '$UT'); o uuid := t_offer(); begin
  j := merge_answer('$MX', '$SEC', o, true);
  assert j->>'name' = 'tester60', 'ім''я ' || j::text;
  assert (select merged_into::text from players where id = old) = j->>'id', 'не злито';
  assert (select count(*) from seasons where player_id = (j->>'id')::uuid) = 1 and t_link('auth', '$UT')::text = j->>'id', 'сезони/вхід';
  assert t_logged(old, (j->>'id')::uuid) = 1, 'журнал';
  begin j := merge_answer('$MX', '$SEC', o, true); assert false, 'вдруге'; exception when sqlstate '22023' then null; end;
  end;" ',"sub":"'$UG'"'
chk "v060: unmerge_players — усе повертається старому гравцю, новий — без імені" postgres "
  declare L merge_log; begin select * into L from merge_log order by id desc limit 1;
  assert unmerge_players(L.id) = 'ok', 'unmerge';
  assert (select merged_into is null and name = 'tester60' from players where id = L.src), 'старий гравець';
  assert (select name is null from players where id = L.dst), 'ім''я нового';
  assert (select count(*) from seasons where player_id = L.src) = 1 and t_link('auth', '$UT') = L.src, 'сезони/вхід назад';
  assert unmerge_players(L.id) = 'уже відкочено', 'двічі';
  end;"
chk "v060: «Ні» — питання закрите, нічого не злито" authenticated "
  declare o uuid; src uuid := t_link('auth', '$UT'); begin
  o := t_new_offer(src, t_link('auth', '$UG'));
  j := merge_answer('$MX', '$SEC', o, false);
  assert (select merged_into is null from players where id = src) and t_answer(o) = 'no', 'злито після «ні»';
  j := link_account('$MX', '$SEC'); assert j->'merge_offer' is null or json_typeof(j->'merge_offer') = 'null', 'питання знову ' || j::text;
  end;" ',"sub":"'$UG'"'
$P -d t1 -c "insert into name_reserved(name, player_id, note) select 'andré', t_link('device', '$DEV'), 'тест' on conflict do nothing" >/dev/null
chk "v060: зарезервоване «andré» — лише своєму гравцю; решта правил без змін" anon "
  begin j := set_player_name('$DEV', '$SEC', 'andré'); exception when sqlstate '22023' then null; end;
  j := player_hello('$DEV', '$SEC');
  begin j := set_player_name('$EDEV', '$SEC2', 'andré'); assert false, 'чужий взяв andré'; exception when sqlstate '22023' then assert sqlerrm = 'name_chars', sqlerrm; end;
  begin j := set_player_name('$EDEV', '$SEC2', 'andré2'); assert false, 'andré2'; exception when sqlstate '22023' then null; end;"
$P -d t1 -c "update players set name = 'andré', name_changed_at = null where id = t_link('device', '$DEV')" >/dev/null
chk "v060: власник «andré» зберігає ім'я кнопкою без помилки (те саме ім'я)" anon "
  j := set_player_name('$DEV', '$SEC', 'andré'); assert j->>'name' = 'andré', j::text;"
if $P -d t1 -f "$ROOT/sql/v059_player_page.sql" -tA >"$D/ren3" 2>"$D/err" && $P -d t1 -f "$ROOT/sql/v060_one_player.sql" >/dev/null 2>>"$D/err" \
   && [ "$($P -d t1 -tAc "select name from players where id = t_link('device', '$DEV')")" = "andré" ] && ! grep -q "andré" "$D/ren3"
then ok "v060: повторний запуск v059 (+ v060) не переписує зарезервоване «andré»"; else bad "v059 після v060 переписав andré — $(cat "$D/ren3") $(grep -v NOTICE "$D/err" | head -2)"; fi
chk "v060: пошта — нижній регістр; погана — email_bad; порожня — стерто разом із галочкою; галочка без пошти не ставиться" anon "
  j := set_player_contact('$EDEV', '$SEC2', ' Oleh@Example.COM ', true); assert j->>'contact_email' = 'oleh@example.com' and (j->>'news_optin')::boolean, j::text;
  begin j := set_player_contact('$EDEV', '$SEC2', 'not-an-email', true); assert false, 'погана'; exception when sqlstate '22023' then assert sqlerrm = 'email_bad', sqlerrm; end;
  j := set_player_contact('$EDEV', '$SEC2', '', true); assert j->>'contact_email' is null and not (j->>'news_optin')::boolean, j::text;
  begin j := set_player_contact('$EDEV', 'attacker-attacker-attacker', 'x@y.zz', true); assert false, 'чужий секрет'; exception when sqlstate '28000' then null; end;
  j := set_player_contact('$EDEV', '$SEC2', 'oleh@example.com', false); assert not (j->>'news_optin')::boolean, 'галочка';"
chk "v060: пошта не видна на публічній сторінці й anon не читає її з players напряму" anon "
  j := player_profile_pub((player_hello('$EDEV', '$SEC2'))->>'public_id'); assert j::text !~ 'example', 'пошта на сторінці';
  begin perform 1 from player_contacts limit 1; assert false, 'anon читає player_contacts'; exception when insufficient_privilege then null; end;
  assert not exists (select 1 from information_schema.columns where table_name = 'players' and column_name like '%mail%'), 'пошта в players';"
chk "v060: «Видалити акаунт» стирає пошту" anon "
  declare old uuid := t_link('device', '$EDEV'); begin j := delete_player('$EDEV', '$SEC2');
  assert t_contacts(old) = 0, 'пошта лишилась'; end;"
chk "v060: player_profile — «Вибір сезону» окремим режимом" postgres "
  insert into seasons(device_id, mode, format, formation, w, d, l, pts, place, gf, ga) values ('$DEV', 'pick', 'classic', '4-4-2', 25, 3, 2, 78, 1, 70, 20);
  j := player_profile(t_link('device', '$DEV')); assert j->'best'->'pick' is not null and (j->'best'->'pick'->>'pts')::int = 78, j::text;"
# ===== v061: 11×11 leagues on the site (fl_*) =====
$P -d t1 -c "select count(*) from pg_policies" -tA > "$D/pol_before61" 2>/dev/null
for pass in 1 2; do
  if $P -d t1 -f "$ROOT/sql/v061_leagues.sql" >/dev/null 2>"$D/err"; then ok "запуск $pass: v061_leagues.sql"; else bad "запуск $pass: v061_leagues.sql — $(grep -v NOTICE "$D/err" | head -3)"; fi
done
LD=ffffffff-0000-4000-a000-000000000061
$P -d t1 >/dev/null 2>"$D/err" <<SQL || { cat "$D/err"; exit 1; }
create function t_fl_season(p_dev uuid, p_fl text, p_pts int, p_mode text default 'normal') returns bigint language plpgsql security definer as \$\$
declare i bigint; vw int := p_pts / 3; vd int := p_pts % 3; begin
  insert into seasons(device_id, mode, format, formation, w, d, l, pts, place, gf, ga, fl_id) values (p_dev, p_mode, 'classic', '4-4-2', vw, vd, 30 - vw - vd, p_pts, 3, 50, 30, p_fl) returning id into i;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true); update seasons set verified = true where id = i; return i; end \$\$;
create function t_fl_entries() returns bigint language sql security definer as \$\$ select count(*) from fl_entries \$\$;
SQL
chk "v061: нових політик немає; таблиці ліг закриті для anon/authenticated; seasons.fl_id" postgres "
  assert (select count(*) from pg_policies)::text = '$(cat "$D/pol_before61")', 'кількість політик';
  assert not has_table_privilege('anon', 'fl_leagues', 'select') and not has_table_privilege('authenticated', 'fl_entries', 'insert') and not has_table_privilege('authenticated', 'fl_members', 'insert'), 'права';
  assert exists (select 1 from information_schema.columns where table_name = 'seasons' and column_name = 'fl_id'), 'fl_id';"
chk "v061: anon не створює й не вступає; fl_record — лише сервер" anon "
  begin j := fl_create('$MX', '$SEC', 'Тест', 3, 3, 'best', 'place', 1, 'show', 'all'); assert false, 'anon створив'; exception when insufficient_privilege then null; end;
  begin j := fl_join('$MX', '$SEC', 'abcdef'); assert false, 'anon вступив'; exception when insufficient_privilege then null; end;
  begin perform fl_record(1); assert false, 'anon fl_record'; exception when insufficient_privilege then null; end;"
chk "v061: створити лігу — лише свій пристрій; неправильні правила — fl_bad" authenticated "
  begin j := fl_create('$NDEV', '$SEC2', 'Тест', 3, 3, 'best', 'place', 1, 'show', 'all'); assert false, 'чужий пристрій'; exception when sqlstate '28000' then null; end;
  begin j := fl_create('$MX', '$SEC', 'Тест', 5, 3, 'best', 'place', 1, 'show', 'all'); assert false, '5 днів'; exception when sqlstate '22023' then assert sqlerrm = 'fl_bad', sqlerrm; end;
  begin j := fl_create('$MX', '$SEC', 'x', 3, 3, 'best', 'place', 1, 'show', 'all'); assert false, 'коротка назва'; exception when sqlstate '22023' then null; end;" ',"sub":"'$UG'"'
chk "v061: створити лігу — код 6 символів, творець — учасник, тур 1 з 3" authenticated "
  j := fl_create('$MX', '$SEC', '  Банка   на воротах ', 3, 1, 'best', 'place', 1, 'memory', 'y2010');
  assert j->>'id' ~ '^[a-z2-9]{6}\$' and j->>'name' = 'Банка на воротах' and (j->>'day_n')::int = 1 and json_array_length(j->'board') = 1 and j->>'ratings' = 'memory', j::text;" ',"sub":"'$UG'"'
FLID=$($P -d t1 -tAc "select id from fl_leagues order by created_at limit 1")
$P -d t1 >/dev/null 2>"$D/err" <<SQL || { cat "$D/err"; exit 1; }
select player_hello('$LD', '$SEC');
SQL
chk "v061: друг вступає за кодом (з входом на своєму пристрої); повторно — без змін" authenticated "
  k := link_account('$LD', '$SEC');
  j := fl_join('$LD', '$SEC', upper('$FLID')); assert json_array_length(j->'board') = 2, j::text;
  j := fl_join('$LD', '$SEC', '$FLID'); assert json_array_length(j->'board') = 2, 'двічі ' || j::text;
  begin j := fl_join('$LD', '$SEC', 'nonexi'); assert false, 'неіснуюча'; exception when sqlstate '22023' then assert sqlerrm = 'fl_none', sqlerrm; end;" ',"sub":"'$UT'"'
chk "v061: зарахування — лише перевірений сезон «Звичайний» з епохою ліги; 1 спроба на день; не учасник — ні" postgres "
  declare a bigint; b bigint; c bigint; x bigint; y bigint; z bigint; begin
  a := t_fl_season('$MX', '$FLID', 70); update seasons set era = 'y2010' where id = a;
  b := t_fl_season('$LD', '$FLID', 60); update seasons set era = 'y2010' where id = b;
  assert fl_record(a) = 1 and fl_record(b) = 1, 'перші спроби';
  assert fl_record(a) = 1, 'повтор того самого сезону';
  c := t_fl_season('$MX', '$FLID', 80); update seasons set era = 'y2010' where id = c; assert fl_record(c) is null, 'друга спроба при tries=1';
  x := t_fl_season('$MX', '$FLID', 80, 'hard'); update seasons set era = 'y2010' where id = x; assert fl_record(x) is null, 'режим hard';
  y := t_fl_season('$MX', '$FLID', 80); assert fl_record(y) is null, 'епоха all замість y2010';
  z := t_fl_season('$NDEV', '$FLID', 90); update seasons set era = 'y2010' where id = z; assert fl_record(z) is null, 'не учасник';
  assert t_fl_entries() = 2, 'записів ' || t_fl_entries();
  end;"
chk "v061: таблиці — «за місце»: 1-й отримує K=2, 2-й — 1; тур сьогодні; без device_id" anon "
  j := fl_get('$FLID');
  assert (j->'board'->0->>'total')::int = 2 and (j->'board'->1->>'total')::int = 1 and (j->'board'->0->>'wins')::int = 1, j::text;
  assert json_array_length(j->'tour') = 2 and (j->'tour'->0->>'pts')::int = 70 and (j->'tour'->0->>'tries')::int = 1, 'тур ' || (j->'tour')::text;
  assert j::text !~ '$MX' and j::text !~ 'device', 'є device_id';
  assert fl_get('nonexi') is null, 'неіснуюча';"
chk "v061: «Мої ліги» — назва, учасники, моє місце, спроби сьогодні" anon "
  j := fl_mine('$LD', '$SEC'); assert json_array_length(j) = 1 and (j->0->>'members')::int = 2 and (j->0->>'place')::int = 2 and (j->0->>'tries_today')::int = 1 and j->0->>'name' = 'Банка на воротах', j::text;
  begin j := fl_mine('$LD', 'attacker-attacker-attacker'); assert false, 'чужий секрет'; exception when sqlstate '28000' then null; end;"
chk "v061: створити лігу «сума», 3 спроби, у залік остання" authenticated "
  j := fl_create('$MX', '$SEC', 'Сума', 1, 3, 'last', 'sum', 3, 'show', 'all'); assert j->>'take' = 'last', j::text;" ',"sub":"'$UG'"'
chk "v061: «сума» і «остання спроба»: у залік остання, очки сезону" postgres "
  declare id text := (select id from fl_leagues where name = 'Сума'); a bigint; b bigint; begin
  a := t_fl_season('$MX', id, 75); b := t_fl_season('$MX', id, 41);
  assert fl_record(a) = 1 and fl_record(b) = 2, 'спроби';
  j := fl_get(id); assert (j->'board'->0->>'total')::int = 41, 'остання ' || j::text;
  end;"
$P -d t1 -c "insert into user_state(user_id, data) values ('$UT', '{\"upl30_tr\":{\"t\":{\"champ\":{\"n\":2,\"at\":\"2026-09-01\"}},\"seasons\":5}}') on conflict (user_id) do update set data = excluded.data" >/dev/null
chk "v061: «Це ти?» → «так» повертає локальний прогрес старого входу (prev_state) для злиття на сайті" authenticated "
  declare o uuid := t_new_offer(t_link('auth', '$UT'), t_link('auth', '$UG')); begin
  j := merge_answer('$MX', '$SEC', o, true);
  assert (j->'prev_state'->'upl30_tr'->>'seasons')::int = 5, j::text;
  end;" ',"sub":"'$UG'"'
# ===== v063: 5×5 leagues (fl_create5, fl5_submit, fl5_start, fl5_store) =====
for pass in 1 2; do
  if $P -d t1 -f "$ROOT/sql/v063_fives.sql" >/dev/null 2>"$D/err"; then ok "запуск $pass: v063_fives.sql"; else bad "запуск $pass: v063_fives.sql — $(grep -v NOTICE "$D/err" | head -3)"; fi
done
chk "v063: fl_fives закрита; нових політик немає; ліга 11×11 після v063 — ті самі таблиці" postgres "
  assert (select count(*) from pg_policies)::text = '$(cat "$D/pol_before61")', 'кількість політик';
  assert not has_table_privilege('anon', 'fl_fives', 'select') and not has_table_privilege('authenticated', 'fl_fives', 'insert'), 'права';
  j := fl_get('$FLID'); assert (j->'board'->0->>'total')::int = 2 and (j->'board'->1->>'total')::int = 1 and j->>'fmt' = '11' and json_array_length(j->'fives') = 0, j::text;"
chk "v063: anon не створює 5×5, не надсилає склад, не стартує й не пише турнір" anon "
  begin j := fl_create5('$MX', '$SEC', 'П''ятірки', 3, 1, 'show', 'all'); assert false, 'anon створив'; exception when insufficient_privilege then null; end;
  begin j := fl5_submit('$MX', '$SEC', 'abcdef', '1-2-1', '[]'); assert false, 'anon склад'; exception when insufficient_privilege then null; end;
  begin j := fl5_start('$MX', '$SEC', 'abcdef'); assert false, 'anon старт'; exception when insufficient_privilege then null; end;
  begin perform fl5_store('abcdef', '{}'); assert false, 'anon турнір'; exception when insufficient_privilege then null; end;"
chk "v063: створити 5×5 — збір 3 год; неправильний час — fl_bad" authenticated "
  begin j := fl_create5('$MX', '$SEC', 'Тест', 2, 1, 'show', 'all'); assert false, '2 год'; exception when sqlstate '22023' then assert sqlerrm = 'fl_bad', sqlerrm; end;
  j := fl_create5('$MX', '$SEC', 'Кубок кума', 3, 1, 'memory', 'all');
  assert j->>'fmt' = '5' and (j->>'over')::boolean = false and json_array_length(j->'fives') = 0 and (j->>'deadline')::timestamptz between now() + interval '2 hours 59 minutes' and now() + interval '3 hours 1 minute', j::text;" ',"sub":"'$UG'"'
F5ID=$($P -d t1 -tAc "select id from fl_leagues where fmt = '5' order by created_at desc limit 1")
# the v061 section merged player LD into MX, so 5×5 needs a separate friend: new device and new sign-in
L3=ffffffff-0000-4000-a000-000000000063; U3=33333333-0000-4000-a000-000000000063
$P -d t1 -c "select player_hello('$L3', '$SEC')" >/dev/null
chk "v063: друг — новий вхід на своєму пристрої" authenticated "k := link_account('$L3', '$SEC');" ',"sub":"'$U3'"'
XI='[{"id":"a","slot":"GK"},{"id":"b","slot":"DF"},{"id":"c","slot":"MF"},{"id":"d","slot":"MF"},{"id":"e","slot":"FW"}]'
chk "v063: склад — лише учасник; 5 гравців і відома схема; вдруге — без змін" authenticated "
  begin j := fl5_submit('$L3', '$SEC', '$F5ID', '1-2-1', '$XI'); assert false, 'не учасник'; exception when sqlstate '22023' then assert sqlerrm = 'fl_member', sqlerrm; end;
  j := fl_join('$L3', '$SEC', '$F5ID');
  begin j := fl5_submit('$L3', '$SEC', '$F5ID', '3-3', '$XI'); assert false, 'схема'; exception when sqlstate '22023' then assert sqlerrm = 'fl_bad', sqlerrm; end;
  begin j := fl5_submit('$L3', '$SEC', '$F5ID', '1-2-1', '[1,2,3,4]'); assert false, '4 гравці'; exception when sqlstate '22023' then assert sqlerrm = 'fl_bad', sqlerrm; end;
  j := fl5_submit('$L3', '$SEC', '$F5ID', '1-2-1', '$XI'); assert json_array_length(j->'fives') = 1 and j->'fives'->0->>'form' = '1-2-1', j::text;
  j := fl5_submit('$L3', '$SEC', '$F5ID', '2-2', '$XI'); assert j->'fives'->0->>'form' = '1-2-1', 'змінив склад ' || j::text;" ',"sub":"'$U3'"'
chk "v063: «Почати зараз» — лише творець і від 2 складів" authenticated "
  begin j := fl5_start('$L3', '$SEC', '$F5ID'); assert false, 'не творець'; exception when sqlstate '22023' then assert sqlerrm = 'fl_owner', sqlerrm; end;" ',"sub":"'$U3'"'
chk "v063: творець — спершу 1 склад (fl_few), потім свій склад і старт: збір закрито" authenticated "
  begin j := fl5_start('$MX', '$SEC', '$F5ID'); assert false, '1 склад'; exception when sqlstate '22023' then assert sqlerrm = 'fl_few', sqlerrm; end;
  j := fl5_submit('$MX', '$SEC', '$F5ID', '2-2', '$XI');
  j := fl5_start('$MX', '$SEC', '$F5ID'); assert (j->>'deadline')::timestamptz <= now() and json_array_length(j->'fives') = 2, j::text;" ',"sub":"'$UG'"'
chk "v063: після кінця збору — не вступити й не надіслати склад" authenticated "
  begin j := fl_join('$NDEV', '$SEC2', '$F5ID'); assert false, 'вступив'; exception when sqlstate '22023' then assert sqlerrm in ('fl_over', 'login?'), sqlerrm; when sqlstate '28000' then null; end;
  begin j := fl5_submit('$L3', '$SEC', '$F5ID', '1-2-1', '$XI'); assert false, 'склад після'; exception when sqlstate '22023' then assert sqlerrm = 'fl_over', sqlerrm; end;" ',"sub":"'$U3'"'
chk "v063: турнір пише лише сервер, один раз; ліга завершена; у «Моїх лігах» — 5×5 з моїм складом" postgres "
  assert fl5_store('$F5ID', '{\"v\":1,\"champ\":0}') = true, 'перший запис';
  assert fl5_store('$F5ID', '{\"v\":1,\"champ\":1}') = false, 'другий запис';
  j := fl_get('$F5ID'); assert (j->>'over')::boolean and (j->'result'->>'champ')::int = 0 and j->>'played_at' is not null, j::text;
  j := fl_mine('$L3', '$SEC'); assert exists (select 1 from json_array_elements(j) x where x->>'fmt' = '5' and (x->>'my_five')::boolean and (x->>'over')::boolean and (x->>'fives')::int = 2), j::text;"
chk "v063: сезон з кодом ліги 5×5 не зараховується" postgres "
  declare a bigint; begin a := t_fl_season('$MX', '$F5ID', 70); assert fl_record(a) is null, 'зараховано'; end;"
# DB with existing name collisions: v059_name_conflicts.sql lists them; v059 suffixes the newer one and creates the index
$P -c "create database t3" >/dev/null
if { $P -d t3 -f "$ROOT/tools/tests/stub.sql" && $P -d t3 -f "$ROOT/sql/new_db_part_A.sql" && $P -d t3 -f "$ROOT/sql/v039_part_B.sql" \
     && $P -d t3 -c "insert into players(anon_name, name, created_at) values ('a', 'Вітя', now() - interval '2 days'), ('b', 'вітя ', now() - interval '1 day'), ('c', 'Oleg', now()), ('d', 'vitia', now())" \
     && $P -d t3 -f "$ROOT/sql/v053_writes.sql"; } >/dev/null 2>"$D/err" \
   && [ "$($P -d t3 -f "$ROOT/sql/v059_name_conflicts.sql" -tA 2>>"$D/err" | grep -c "^збіг")" = 2 ] \
   && $P -d t3 -f "$ROOT/sql/v059_player_page.sql" >/dev/null 2>>"$D/err" \
   && [ "$($P -d t3 -tAc "select count(*) from pg_indexes where indexname = 'players_name_uq'")" = 1 ] \
   && [ "$($P -d t3 -tAc "select string_agg(anon_name || '=' || name, ',' order by anon_name) from players")" = "a=vitia2,b=vitia3,c=oleg,d=vitia" ]
then ok "збіги імен: v059_name_conflicts.sql показує; v059 — ім'я за правилами лишається (vitia), переписані — з номером (vitia2, vitia3), індекс створено"
else bad "база зі збігами імен — $(grep -v NOTICE "$D/err" | head -2) $($P -d t3 -tAc "select string_agg(anon_name || '=' || name, ',' order by anon_name) from players")"; fi
# test DB where the PREVIOUS v059 was already applied (lowercase Cyrillic names, index on name_key): the new version converts to Latin
OLD059=$(git -C "$ROOT" show 8765782:sql/v059_player_page.sql 2>/dev/null)
if [ -z "$OLD059" ]; then echo "(стара v059 недоступна в git — пропускаю)"; else
$P -c "create database t4" >/dev/null
if { $P -d t4 -f "$ROOT/tools/tests/stub.sql" && $P -d t4 -f "$ROOT/sql/new_db_part_A.sql" && $P -d t4 -f "$ROOT/sql/v039_part_B.sql" && $P -d t4 -f "$ROOT/sql/v053_writes.sql" \
     && $P -d t4 -c "insert into players(anon_name, name) values ('Silent Owl', 'Вітя'), ('Brave Fox', 'Андрій Ш')" && echo "$OLD059" | $P -d t4 \
     && [ "$($P -d t4 -tAc "select count(*) from pg_indexes where indexname = 'players_name_uq'")" = 1 ] \
     && $P -d t4 -f "$ROOT/sql/v059_player_page.sql" && $P -d t4 -f "$ROOT/sql/v059_player_page.sql"; } >/dev/null 2>"$D/err" \
   && [ "$($P -d t4 -tAc "select string_agg(name || '/' || anon_name || '/' || coalesce(name_changed_at::text, '-'), ',' order by name) from players where name is not null")" = "andrii_sh/brave_fox/-,vitia/silent_owl/-" ] \
   && [ "$($P -d t4 -tAc "select count(*) from pg_indexes where indexname = 'players_name_uq'")" = 1 ]
then ok "база зі старою v059: нова версія переписує імена латиницею (вітя → vitia, андрій ш → andrii_sh), анонімні — silent_owl, двічі без помилок"
else bad "база зі старою v059 — $(grep -v NOTICE "$D/err" | head -2) $($P -d t4 -tAc "select string_agg(name, ',') from players where name is not null")"; fi
fi
# ===== v068: fl_mine volatile; client_errors server-only =====
for pass in 1 2; do for f in v068_fl_mine_volatile v068_client_errors; do
  if $P -d t1 -f "$ROOT/sql/$f.sql" >/dev/null 2>"$D/err"; then ok "запуск $pass: $f.sql"; else bad "запуск $pass: $f.sql — $(grep -v NOTICE "$D/err" | head -3)"; fi
done; done
chk "v068: fl_mine — volatile (PostgREST не кличе її в транзакції лише для читання); client_errors закрита для anon/authenticated" postgres "
  assert (select provolatile from pg_proc where proname = 'fl_mine') = 'v', 'fl_mine не volatile';
  assert not has_table_privilege('anon', 'client_errors', 'insert') and not has_table_privilege('anon', 'client_errors', 'select')
     and not has_table_privilege('authenticated', 'client_errors', 'insert'), 'права client_errors';
  insert into client_errors(version, msg) values ('0.68', 'x'); assert (select count(*) from client_errors) >= 1, 'сервер пише';"
# ===== feedback and channel_posts (channel queue): server-only =====
for pass in 1 2; do for f in v0695_feedback v06969_feedback_site v06997_channel_posts v070; do
  if $P -d t1 -f "$ROOT/sql/$f.sql" >/dev/null 2>"$D/err"; then ok "запуск $pass: $f.sql"; else bad "запуск $pass: $f.sql — $(grep -v NOTICE "$D/err" | head -3)"; fi
done; done
chk "v0695/v06969: feedback закрита для anon/authenticated, нові колонки є" postgres "
  assert not has_table_privilege('anon', 'feedback', 'select') and not has_table_privilege('anon', 'feedback', 'insert') and not has_table_privilege('authenticated', 'feedback', 'insert'), 'права feedback';
  insert into feedback(kind, text, source, contact, version) values ('text', 'x', 'site', 'a@b.c', '0.69.97');"
chk "v06997: channel_posts закрита для anon/authenticated; статуси, джерела й довжина перевіряються" postgres "
  assert not has_table_privilege('anon', 'channel_posts', 'select') and not has_table_privilege('anon', 'channel_posts', 'insert')
     and not has_table_privilege('authenticated', 'channel_posts', 'select') and not has_table_privilege('authenticated', 'channel_posts', 'update'), 'права channel_posts';
  insert into channel_posts(text, publish_at) values ('<b>Привіт</b>', now());
  assert (select status from channel_posts order by id desc limit 1) = 'draft' and (select source from channel_posts order by id desc limit 1) = 'chat', 'типові значення';
  insert into channel_posts(text, image_url, publish_at) values ('<b>' || repeat('x', 1024) || '</b>', 'file', now());
  begin insert into channel_posts(text, image_url, publish_at) values (repeat('x', 1025), 'file', now()); assert false, 'довгий підпис прийнято'; exception when check_violation then null; end;
  begin insert into channel_posts(text, publish_at) values (repeat('x', 4097), now()); assert false, 'довгий текст прийнято'; exception when check_violation then null; end;
  begin insert into channel_posts(text, publish_at, status) values ('x', now(), 'weird'); assert false, 'чужий статус прийнято'; exception when check_violation then null; end;
  begin insert into channel_posts(text, publish_at, source) values ('x', now(), 'bot'); assert false, 'чуже джерело прийнято'; exception when check_violation then null; end;"
chk "v070: tg_notify закрита для anon/authenticated, за замовчуванням вимкнено" postgres "
  assert not has_table_privilege('anon', 'tg_notify', 'select') and not has_table_privilege('anon', 'tg_notify', 'insert') and not has_table_privilege('authenticated', 'tg_notify', 'update'), 'права tg_notify';
  insert into tg_notify(tg_user_id) values (777); assert (select enabled from tg_notify where tg_user_id = 777) = false, 'типово вимкнено';
  assert has_function_privilege('anon', 'tg_leagues_mine(uuid,text)', 'execute') and (select prosecdef from pg_proc where proname = 'tg_leagues_mine'), 'tg_leagues_mine: anon викликає, security definer';"
# ===== v0711: decade eras in friend leagues =====
for pass in 1 2; do
  if $P -d t1 -f "$ROOT/sql/v0711_decades.sql" >/dev/null 2>"$D/err"; then ok "запуск $pass: v0711_decades.sql"; else bad "запуск $pass: v0711_decades.sql — $(grep -v NOTICE "$D/err" | head -3)"; fi
done
chk "v0711: ліги з десятиліттям (11×11 і 5×5) створюються; невідома епоха — fl_bad; старі епохи ще приймаються" authenticated "
  j := fl_create('$MX', '$SEC', 'Дев''яності', 3, 1, 'best', 'place', 1, 'show', 'd1990'); assert j->>'era' = 'd1990', j::text;
  j := fl_create5('$MX', '$SEC', 'Двадцяті', 3, 1, 'show', 'd2020'); assert j->>'era' = 'd2020', j::text;
  j := fl_create('$MX', '$SEC', 'Стара епоха', 3, 1, 'best', 'place', 1, 'show', 'y2015'); assert j->>'era' = 'y2015', j::text;
  begin j := fl_create('$MX', '$SEC', 'Вісімдесяті', 3, 1, 'best', 'place', 1, 'show', 'd1980'); assert false, 'd1980'; exception when sqlstate '22023' then assert sqlerrm = 'fl_bad', sqlerrm; end;" ',"sub":"'$UG'"'
chk "v0711: anon не створює лігу" anon "
  begin j := fl_create5('$MX', '$SEC', 'Анон', 3, 1, 'show', 'd2000'); assert false, 'anon створив'; exception when insufficient_privilege then null; end;"
# ===== v079: chat-league attempt flag on season seeds =====
for pass in 1 2; do
  if $P -d t1 -f "$ROOT/sql/v079_league_seeds.sql" >/dev/null 2>"$D/err"; then ok "запуск $pass: v079_league_seeds.sql"; else bad "запуск $pass: v079_league_seeds.sql — $(grep -v NOTICE "$D/err" | head -3)"; fi
done
chk "v079: season_seeds.league типово false, індекс спроб є" postgres "
  assert (select column_default from information_schema.columns where table_name = 'season_seeds' and column_name = 'league') = 'false', 'league default';
  assert exists (select 1 from pg_indexes where indexname = 'season_seeds_league_day_idx'), 'індекс';"
# ===== v080: daily challenge attempts (vd_results, season_seeds.vd_day / vd_attempt, vd_mine) =====
for pass in 1 2; do
  if $P -d t1 -f "$ROOT/sql/v080_vyklyk_dnia.sql" >/dev/null 2>"$D/err"; then ok "запуск $pass: v080_vyklyk_dnia.sql"; else bad "запуск $pass: v080_vyklyk_dnia.sql — $(grep -v NOTICE "$D/err" | head -3)"; fi
done
VDEV=dddddddd-0000-4000-a000-000000000080
chk "v080: vd_results закрита для anon/authenticated, vd_mine — лише сервер" postgres "
  assert not has_table_privilege('anon', 'vd_results', 'select') and not has_table_privilege('authenticated', 'vd_results', 'insert'), 'права таблиці';
  assert not has_function_privilege('anon', 'vd_mine(uuid, date)', 'execute') and not has_function_privilege('authenticated', 'vd_mine(uuid, date)', 'execute'), 'права vd_mine';"
chk "v080: спроби 1..5, одна на номер; спроба seed — одна на пристрій, день і номер; vd_mine — краща із зарахованих" postgres "
  insert into vd_results(day, device_id, attempt, gate_ok, score) values ('2026-10-12', '$VDEV', 1, false, 9), ('2026-10-12', '$VDEV', 2, true, 6), ('2026-10-12', '$VDEV', 3, true, 4);
  begin insert into vd_results(day, device_id, attempt, gate_ok, score) values ('2026-10-12', '$VDEV', 6, true, 1); assert false, 'спроба 6'; exception when check_violation then null; end;
  begin insert into vd_results(day, device_id, attempt, gate_ok, score) values ('2026-10-12', '$VDEV', 2, true, 1); assert false, 'двічі спроба 2'; exception when unique_violation then null; end;
  insert into season_seeds(device_id, xi_hash, seed, day, vd_day, vd_attempt) values ('$VDEV', '', 1, '2026-10-12', '2026-10-12', 1);
  begin insert into season_seeds(device_id, xi_hash, seed, day, vd_day, vd_attempt) values ('$VDEV', '', 2, '2026-10-12', '2026-10-12', 1); assert false, 'двічі seed спроби'; exception when unique_violation then null; end;
  assert (select best from vd_mine('$VDEV', null) where c_day = '2026-10-12') = 6 and (select attempts from vd_mine('$VDEV', null) where c_day = '2026-10-12') = 3, 'vd_mine';"
# ===== v089: challenge attempts per player (season_seeds.player_id, one attempt number per player and day) =====
for pass in 1 2; do
  if $P -d t1 -f "$ROOT/sql/v089_vd_per_player.sql" >/dev/null 2>"$D/err"; then ok "запуск $pass: v089_vd_per_player.sql"; else bad "запуск $pass: v089_vd_per_player.sql — $(grep -v NOTICE "$D/err" | head -3)"; fi
done
chk "v089: номер спроби — один на гравця й день (два пристрої не беруть той самий); старі рядки без player_id не заважають" postgres "
  insert into season_seeds(device_id, player_id, xi_hash, seed, day, vd_day, vd_attempt) values ('$VDEV', 'dddddddd-0000-4000-a000-000000000089', '', 11, '2026-10-13', '2026-10-13', 1);
  begin insert into season_seeds(device_id, player_id, xi_hash, seed, day, vd_day, vd_attempt) values ('dddddddd-0000-4000-a000-000000000090', 'dddddddd-0000-4000-a000-000000000089', '', 12, '2026-10-13', '2026-10-13', 1); assert false, 'той самий номер у гравця'; exception when unique_violation then null; end;
  insert into season_seeds(device_id, player_id, xi_hash, seed, day, vd_day, vd_attempt) values ('dddddddd-0000-4000-a000-000000000090', 'dddddddd-0000-4000-a000-000000000089', '', 13, '2026-10-13', '2026-10-13', 2);
  insert into season_seeds(device_id, xi_hash, seed, day, vd_day, vd_attempt) values ('dddddddd-0000-4000-a000-000000000091', '', 14, '2026-10-13', '2026-10-13', 1), ('dddddddd-0000-4000-a000-000000000092', '', 15, '2026-10-13', '2026-10-13', 1);"
# ===== v081: leave a league / delete own friends league (marked, never removed) =====
for pass in 1 2; do
  if $P -d t1 -f "$ROOT/sql/v081_leave_leagues.sql" >/dev/null 2>"$D/err"; then ok "запуск $pass: v081_leave_leagues.sql"; else bad "запуск $pass: v081_leave_leagues.sql — $(grep -v NOTICE "$D/err" | head -3)"; fi
done
chk "v081: власник створює лігу" authenticated "
  j := fl_create('$MX', '$SEC', 'Ліга на вихід', 3, 1, 'best', 'place', 1, 'show', 'all');" ',"sub":"'$UG'"'
V81=$($P -d t1 -tAc "select id from fl_leagues where name = 'Ліга на вихід' order by created_at desc limit 1")
chk "v081: друг вступає" authenticated "
  j := fl_join('$L3', '$SEC', '$V81'); assert json_array_length(j->'board') = 2, 'учасників ' || j::text;" ',"sub":"'$U3'"'
chk "v081: anon не виходить і не видаляє лігу друзів" anon "
  begin j := fl_leave('$L3', '$SEC', '$V81'); assert false, 'anon вийшов'; exception when insufficient_privilege then null; end;
  begin j := fl_delete('$MX', '$SEC', '$V81'); assert false, 'anon видалив'; exception when insufficient_privilege then null; end;"
chk "v081: учасник виходить — ліга зникає з його списку, але не в інших; повернення; вступ за кодом знову" authenticated "
  j := fl_leave('$L3', '$SEC', '$V81'); assert (j->>'left')::boolean, j::text;
  assert not exists (select 1 from json_array_elements(fl_mine('$L3', '$SEC')) x where x->>'id' = '$V81'), 'у списку після виходу';
  assert (fl_get('$V81')->>'members')::int = 1 and json_array_length(fl_get('$V81')->'board') = 2, 'members 1, таблиця зберегла обох';
  assert (select count(*) from json_array_elements(fl_get('$V81')->'board') x where (x->>'left')::boolean) = 1, 'у таблиці позначено, хто вийшов';
  j := fl_leave('$L3', '$SEC', '$V81', true); assert exists (select 1 from json_array_elements(fl_mine('$L3', '$SEC')) x where x->>'id' = '$V81'), 'повернення';
  j := fl_leave('$L3', '$SEC', '$V81');
  j := fl_join('$L3', '$SEC', '$V81'); assert exists (select 1 from json_array_elements(fl_mine('$L3', '$SEC')) x where x->>'id' = '$V81'), 'вступ знову';
  begin j := fl_delete('$L3', '$SEC', '$V81'); assert false, 'учасник видалив'; exception when sqlstate '22023' then assert sqlerrm = 'fl_none', sqlerrm; end;" ',"sub":"'$U3'"'
chk "v081: хто вийшов, не здає п'ятірку і не отримує залік (fl5_submit, fl_record перевіряють left_at)" postgres "
  perform 1; assert (select bool_and(prosrc ~ 'left_at is null') from pg_proc where proname in ('fl_record', 'fl5_submit')), 'fl_record / fl5_submit';"
chk "v081: власник не виходить, а видаляє — ліга зникає для всіх і за посиланням; відновлення" authenticated "
  begin j := fl_leave('$MX', '$SEC', '$V81'); assert false, 'власник вийшов'; exception when sqlstate '22023' then assert sqlerrm = 'fl_owner', sqlerrm; end;
  assert (select x->>'mine' from json_array_elements(fl_mine('$MX', '$SEC')) x where x->>'id' = '$V81') = 'true', 'mine';
  assert fl_get('$V81')->>'owner_name' is not null and fl_get('$V81')->>'created_at' is not null, 'owner_name, created_at';
  j := fl_delete('$MX', '$SEC', '$V81'); assert (j->>'deleted')::boolean, j::text;
  assert fl_get('$V81') is null, 'fl_get видаленої';
  assert not exists (select 1 from json_array_elements(fl_mine('$MX', '$SEC')) x where x->>'id' = '$V81'), 'у списку власника';
  begin j := fl_delete('$MX', '$SEC', '$V81'); assert false, 'двічі'; exception when sqlstate '22023' then null; end;
  j := fl_delete('$MX', '$SEC', '$V81', true); assert fl_get('$V81') is not null, 'відновлення';" ',"sub":"'$UG'"'
chk "v081: видалення лише позначає рядок" postgres "
  perform 1; assert exists (select 1 from fl_leagues where id = '$V81' and deleted_at is null), 'рядок';"
$P -d t1 -q -c "update fl_leagues set deleted_at = now() where id = '$V81'"
chk "v081: видалену лігу не відкрити за посиланням" authenticated "
  begin j := fl_join('$L3', '$SEC', '$V81'); assert false, 'вступив у видалену'; exception when sqlstate '22023' then assert sqlerrm = 'fl_none', sqlerrm; end;" ',"sub":"'$U3'"'
$P -d t1 -q -c "update fl_leagues set deleted_at = null where id = '$V81'"
# ===== v085: "Your numbers" (player_numbers) and wheel offers (season_offers) =====
for pass in 1 2; do
  if $P -d t1 -f "$ROOT/sql/v085_player_numbers.sql" >/dev/null 2>"$D/err"; then ok "запуск $pass: v085_player_numbers.sql"; else bad "запуск $pass: v085_player_numbers.sql — $(grep -v NOTICE "$D/err" | head -3)"; fi
done
NDEV=aaaaaaaa-0000-4000-a000-000000000085
chk "v085: season_offers закрита для anon (читання й запис)" anon "
  begin perform 1 from season_offers; assert false, 'читає'; exception when insufficient_privilege then null; end;
  begin insert into season_offers(season_id, off) values (1, '[]'); assert false, 'пише'; exception when insufficient_privilege then null; end;"
$P -d t1 -q >/dev/null 2>"$D/err" <<SQL || bad "v085: тестові сезони — $(head -3 "$D/err")"
select player_hello('$NDEV', '$SEC');
insert into seasons(device_id, mode, format, formation, w, d, l, pts, place, gf, ga, xi)
select '$NDEV', 'normal', case when k = 6 then 'anti' else 'classic' end, '4-4-2', 20, 5, 5, 65, 2, 60, 30,
       (select jsonb_agg(jsonb_build_object('id', case when i = 0 and k = 1 then 'solo' else 'p' || i end, 'n', 'Гравець ' || i, 'slot', 'CB',
                                            'c', case when i < 6 then 'Динамо (Київ)' else 'Дніпро' end, 'r0', 70 + i * 2, 'g', i % 3) order by i)
          from generate_series(0, 10) i)
  from generate_series(1, 6) k;
insert into seasons(device_id, mode, format, formation, w, d, l, pts, place, gf, ga, practice, xi)
values ('$NDEV', 'practice', 'classic', '4-4-2', 30, 0, 0, 90, 1, 90, 0, true, '[{"id":"prac"}]');
SQL
chk "v085: player_numbers — лише свої сезони, без тренувань, 11-ка, ключові гравці, «один раз»" anon "
  j := player_numbers('$NDEV', '$SEC');
  assert (j->>'n')::int = 6 and (j->>'na')::int = 5 and (j->>'w')::int = 100 and (j->>'best')::int = 65, 'record ' || j::text;
  assert (j->'fm'->>'f') = '4-4-2' and (j->'fm'->>'k')::int = 6, 'fm';
  assert (select count(*) from json_array_elements(j->'xi') x where (x->>'i')::int = 0) = 2, 'xi candidates';
  assert (j->>'uniq')::int = 12 and (j->>'once')::int = 1 and j->'once_n'->>0 = 'Гравець 0', 'once';
  assert (j->'pl'->'p1'->>'k')::int = 6 and (j->'pl'->'p1'->>'wa')::int = 100 and (j->'pl'->'p1'->>'ka')::int = 5, 'pl';
  assert j->'top'->>'k' is not null and j->'top'->>'dog' = 'p2' and (j->>'cl_n')::int = 2, 'top ' || (j->'top')::text;
  assert not exists (select 1 from json_array_elements(j->'xi') x where x->>'id' = 'prac'), 'тренування';
  assert (j->>'off_n')::int = 0 and j->>'rej' is null, 'rej без даних';"
chk "v085: player_numbers з чужим секретом — відмова" anon "
  begin j := player_numbers('$NDEV', 'attacker-attacker-attacker'); assert false, 'віддав'; exception when sqlstate '28000' then null; end;"
$P -d t1 -q -c "insert into season_offers(season_id, player_id, off) select id, player_id, jsonb_build_array(jsonb_build_array('p0', 'never'), '[\"p1\"]') from seasons where device_id = '$NDEV' and not practice limit 5 on conflict do nothing" >/dev/null 2>"$D/err" || bad "v085: offers — $(head -2 "$D/err")"
chk "v085: «Відхилені» — порожньо, поки менше 10 сезонів з пропозиціями" anon "
  j := player_numbers('$NDEV', '$SEC'); assert (j->>'off_n')::int = 5 and j->>'rej' is null, j::text;"
$P -d t1 -q >/dev/null 2>"$D/err" <<SQL || bad "v085: ще сезони — $(head -3 "$D/err")"
insert into seasons(device_id, mode, format, formation, w, d, l, pts, place, gf, ga, xi)
select '$NDEV', 'normal', 'classic', '4-3-3', 10, 10, 10, 40, 8, 30, 30, '[{"id":"p1","n":"Гравець 1"}]' from generate_series(1, 6);
insert into season_offers(season_id, player_id, off) select id, player_id, jsonb_build_array(jsonb_build_array('p1', 'never')) from seasons s
 where device_id = '$NDEV' and not practice and not exists (select 1 from season_offers o where o.season_id = s.id);
SQL
chk "v085: «Відхилені» — кого пропонували й ніколи не взяв" anon "
  j := player_numbers('$NDEV', '$SEC');
  assert (j->>'off_n')::int = 12 and j->'rej'->0->>'id' = 'never' and (j->'rej'->0->>'k')::int = 12 and json_array_length(j->'rej') = 1, (j->'rej')::text;"
chk "v085: delete_player стирає пропозиції" anon "
  j := delete_player('$NDEV', '$SEC'); assert (j->>'ok')::boolean, j::text;"
chk "v085: після видалення пропозицій немає" postgres "
  perform 1; assert not exists (select 1 from season_offers o join seasons s on s.id = o.season_id where s.device_id = '$NDEV'), 'лишились';"
# upgrade from the earlier test-DB version: rows with old statuses must not break the re-run
$P -d t1 -q -c "alter table channel_posts drop constraint channel_posts_status_chk; insert into channel_posts(text, publish_at, status) values ('old-a', now(), 'approved'), ('old-s', now(), 'skipped');" >/dev/null 2>&1
if $P -d t1 -f "$ROOT/sql/v06997_channel_posts.sql" >/dev/null 2>"$D/err"; then ok "v06997 поверх старої версії (approved/skipped)"; else bad "v06997 поверх старої версії — $(grep -v NOTICE "$D/err" | head -3)"; fi
chk "v06997: старі статуси approved → pending_approval, skipped → rejected" postgres "
  assert (select status from channel_posts where text = 'old-a') = 'pending_approval' and (select status from channel_posts where text = 'old-s') = 'rejected', 'старі статуси';
  assert exists (select 1 from pg_constraint where conname = 'channel_posts_status_chk'), 'перевірка статусу є';"
# ===== v087: PII-free read paths, 5×5 lineups hidden until the result, Telegram identity in app_metadata =====
# auth users before the backfill: server-made (random password, confirmed, no confirmation mail, before the cutoff), self sign-ups with the same service email
T1=87000000-0000-4000-a000-000000000901; T2=87000000-0000-4000-a000-000000000902; T3=87000000-0000-4000-a000-000000000903; T4=87000000-0000-4000-a000-000000000904
$P -d t1 -q >/dev/null 2>"$D/err" <<SQL || bad "v087: тестові акаунти — $(head -3 "$D/err")"
insert into auth.users(id, email, encrypted_password, email_confirmed_at, confirmation_sent_at, created_at, raw_app_meta_data) values
  ('$T1', 'tg-901@users.upl-30-0.vercel.app', '\$2a\$10\$serverrandom', now(), null, '2026-10-01', '{"provider":"email","providers":["email"]}'),
  ('$T2', 'tg-902@users.upl-30-0.vercel.app', '\$2a\$10\$attackerhash', now(), now(), '2026-10-01', '{"provider":"email","providers":["email"]}'),
  ('$T3', 'tg-903@users.upl-30-0.vercel.app', '', null, null, '2026-10-01', '{"provider":"email","providers":["email"]}'),
  ('$T4', 'tg-904@users.upl-30-0.vercel.app', null, now(), null, '2026-10-01', '{"provider":"email","providers":["email"]}');
insert into auth.identities(user_id, provider) values ('$T1', 'email'), ('$T2', 'email'), ('$T3', 'email'), ('$T4', 'email'), ('$T4', 'google');
SQL
for pass in 1 2; do
  if $P -d t1 -f "$ROOT/sql/v087_data_protection.sql" >/dev/null 2>"$D/err"; then ok "запуск $pass: v087_data_protection.sql"; else bad "запуск $pass: v087_data_protection.sql — $(grep -v NOTICE "$D/err" | head -3)"; fi
done
chk "v087: у seasons_pub, challenges_pub, challenge_results_pub немає особистих колонок" postgres "
  assert not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name in ('seasons_pub', 'challenges_pub', 'challenge_results_pub')
    and column_name in ('device_id', 'tg_user_id', 'tg_name', 'user_id', 'seed_id', 'chat_id', 'created_by', 'email', 'secret_hash', 'verify_note', 'fl_id')), 'особисті колонки';
  assert not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'seasons_pub' and column_name = 'seed'), 'seed сезону';
  assert (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'seasons_pub' and column_name in ('xi', 'tbl', 'players', 'player_id', 'in_fl', 'show_r')) = 6, 'потрібні колонки';"
chk "v087: anon читає seasons_pub (усі сезони, ім'я гравця), старий шлях 0.86 (seasons) ще працює" anon "
  assert (select count(*) from seasons_pub) > 0 and (select count(*) from seasons_pub) = (select count(*) from seasons), 'кількість';
  assert exists (select 1 from seasons_pub where players->>'anon_name' is not null), 'players';
  assert exists (select 1 from seasons_pub where in_fl) and exists (select 1 from seasons_pub where not in_fl), 'in_fl';
  assert (select count(*) from challenges_pub) = (select count(*) from challenges) and (select count(*) from challenge_results_pub) = (select count(*) from challenge_results), 'виклики';"
chk "v087: представлення лише для читання (anon/authenticated не пишуть через них)" anon "
  assert (select bool_and(not has_table_privilege(r, v, p)) from unnest(array['anon', 'authenticated']) r, unnest(array['seasons_pub', 'challenges_pub', 'challenge_results_pub']) v,
          unnest(array['insert', 'update', 'delete', 'truncate']) p), 'права на запис';
  assert has_table_privilege('authenticated', 'seasons_pub', 'select'), 'читання';"
chk "v087: my_seasons — лише сезони свого пристрою, без device_id; чужий секрет — відмова" anon "
  j := my_seasons('$DEV', '$SEC');
  assert json_array_length(j) = (select count(*) from seasons where device_id = '$DEV') and json_array_length(j) > 0, 'кількість ' || json_array_length(j);
  assert j->0->>'device_id' is null and j->0->>'tg_user_id' is null and j->0->>'seed' is null and (j->0)::jsonb ? 'w', 'колонки';
  begin j := my_seasons('$DEV', 'attacker-attacker-attacker'); assert false, 'віддав чужі'; exception when sqlstate '28000' then null; end;"
chk "v087: 5×5 — нова ліга, обидва склади" authenticated "
  j := fl_create5('$MX', '$SEC', 'Кубок 087', 3, 1, 'show', 'all');" ',"sub":"'$UG'"'
F87=$($P -d t1 -tAc "select id from fl_leagues where name = 'Кубок 087' order by created_at desc limit 1")
chk "v087: друг вступає й надсилає склад — бачить свій склад" authenticated "
  j := fl_join('$L3', '$SEC', '$F87'); j := fl5_submit('$L3', '$SEC', '$F87', '1-2-1', '$XI');
  assert json_array_length(j->'fives') = 1 and j->'fives'->0->>'form' = '1-2-1' and json_array_length(j->'fives'->0->'xi') = 5, j::text;" ',"sub":"'$U3'"'
chk "v087: творець надсилає свій — бачить лише свій склад і кількість (чужий без xi/form)" authenticated "
  j := fl5_submit('$MX', '$SEC', '$F87', '2-2', '$XI');
  assert (j->>'fives_n')::int = 2 and json_array_length(j->'fives') = 2, j::text;
  assert (select count(*) from jsonb_array_elements(j::jsonb->'fives') f where f ? 'xi') = 1 and (select f->>'form' from jsonb_array_elements(j::jsonb->'fives') f where f ? 'xi') = '2-2', 'лише свій ' || j::text;
  assert (select count(*) from json_array_elements(j->'fives') f where f->>'name' is not null and f->>'u' is not null) = 2, 'хто надіслав';" ',"sub":"'$UG'"'
chk "v087: anon до турніру не бачить жодного складу; fl_get_full закрита для anon/authenticated" anon "
  j := fl_get('$F87'); assert (j->>'fives_n')::int = 2 and not exists (select 1 from jsonb_array_elements(j::jsonb->'fives') f where f ? 'xi'), j::text;
  assert (select count(*) from jsonb_array_elements(j::jsonb->'fives') f where f ? 'form') = 2, 'схема видна (0.86 не покаже undefined)';
  begin j := fl_get_full('$F87'); assert false, 'anon fl_get_full'; exception when insufficient_privilege then null; end;
  assert not has_function_privilege('authenticated', 'fl_get_full(text)', 'execute'), 'authenticated fl_get_full';"
chk "v087: сервер 0.86 (service_role, fl_get) під час викладки бачить усі склади" service_role "
  j := fl_get('$F87'); assert (select count(*) from jsonb_array_elements(j::jsonb->'fives') f where f ? 'xi') = 2, j::text;"
chk "v087: сервер бачить усі склади (fl_get_full); після турніру — усі склади відкриті для всіх" postgres "
  assert (select count(*) from jsonb_array_elements(fl_get_full('$F87')::jsonb->'fives') f where f ? 'xi') = 2, 'full';
  update fl_leagues set deadline = now() - interval '1 minute' where id = '$F87';
  assert fl5_store('$F87', '{\"v\":1,\"champ\":0}'), 'store';
  perform 1;"
chk "v087: після турніру anon бачить усі склади" anon "
  j := fl_get('$F87'); assert (select count(*) from jsonb_array_elements(j::jsonb->'fives') f where f ? 'xi') = 2 and j->'fives_n' is null, j::text;"
chk "v087: ліга 11×11 — fl_get без змін" anon "
  j := fl_get('$FLID'); assert j->>'fmt' = '11' and json_array_length(j->'fives') = 0 and j->'fives_n' is null, j::text;"
chk "v087: tg id у app_metadata — лише для акаунтів сервера (без пароля, пошта підтверджена, лише вхід поштою)" postgres "
  assert (select raw_app_meta_data->>'tg_id' from auth.users where id = '$T1') = '901', 'сервер: 901';
  assert (select raw_app_meta_data->>'tg_id' from auth.users where id = '$T2') is null, 'з паролем (signUp) — без tg_id';
  assert (select raw_app_meta_data->>'tg_id' from auth.users where id = '$T3') is null, 'непідтверджена пошта — без tg_id';
  assert (select raw_app_meta_data->>'tg_id' from auth.users where id = '$T4') is null, 'з Google — без tg_id';
  assert (select raw_app_meta_data->>'provider' from auth.users where id = '$T1') = 'email', 'інші поля app_metadata лишились';"
chk "v087: tg_auth_user — лише сервер; ok / bad / none" postgres "
  assert tg_auth_user(901) = 'ok' and tg_auth_user(902) = 'bad' and tg_auth_user(903) = 'bad' and tg_auth_user(904) = 'bad' and tg_auth_user(905) = 'none', 'статуси';
  assert not has_function_privilege('anon', 'tg_auth_user(bigint)', 'execute') and not has_function_privilege('authenticated', 'tg_auth_user(bigint)', 'execute'), 'права';
  assert not has_function_privilege('anon', 'tg_server_made(uuid)', 'execute'), 'tg_server_made';
  insert into auth.users(id, email, encrypted_password, email_confirmed_at, confirmation_sent_at, created_at, raw_app_meta_data) values ('87000000-0000-4000-a000-000000000906', 'tg-906@users.upl-30-0.vercel.app', 'x', now(), null, '2026-10-11', '{}');
  assert tg_auth_user(906) = 'ok', 'акаунт від попереднього сервера';
  insert into auth.users(id, email, encrypted_password, email_confirmed_at, confirmation_sent_at, created_at, raw_app_meta_data) values ('87000000-0000-4000-a000-000000000907', 'tg-907@users.upl-30-0.vercel.app', 'x', now(), null, '2026-10-13', '{}');
  assert tg_auth_user(907) = 'bad', 'після виходу 0.87 акаунт без tg_id — чужий';
  assert (select raw_app_meta_data->>'tg_id' from auth.users where email like 'tg-906@%') = '906', 'акаунт від попереднього сервера — отримав tg_id';
  update auth.users set raw_app_meta_data = '{\"tg_id\":\"999\"}' where id = '$T4';
  assert tg_auth_user(904) = 'bad', 'tg_id іншого користувача';"
A87=aaaaaaaa-0000-4000-a000-000000000902; G87=aaaaaaaa-0000-4000-a000-000000000901
$P -d t1 -c "select player_hello('$A87', '$SEC'), player_hello('$G87', '$SEC')" >/dev/null
chk "v087: заздалегідь зареєстрований акаунт (tg-902 з паролем) не отримує Telegram-привʼязку" authenticated "
  k := link_account('$A87', '$SEC');" ',"sub":"'$T2'"'
chk "v087: справжній акаунт Telegram (tg-901) отримує привʼязку" authenticated "
  k := link_account('$G87', '$SEC');" ',"sub":"'$T1'"'
chk "v087: link_account бере tg лише з app_metadata" postgres "
  assert not exists (select 1 from player_links where kind = 'tg' and key = '902'), 'tg 902 привʼязано за email';
  assert exists (select 1 from player_links where kind = 'tg' and key = '901' and player_id = (select player_id from player_links where kind = 'auth' and key = '$T1')), 'tg 901';"
# step 2 (sql/v088_revoke_pii_step2.sql, run in prod later): checked here so it never breaks the 0.87 read paths
for pass in 1 2; do
  if $P -d t1 -tA -f "$ROOT/sql/v088_revoke_pii_step2.sql" >"$D/out" 2>"$D/err" && [ ! -s "$D/out" ]; then ok "запуск $pass: v088_revoke_pii_step2.sql (крок 2)"; else bad "запуск $pass: v088_revoke_pii_step2.sql — $(grep -v NOTICE "$D/err" | head -3) $(head -3 "$D/out")"; fi
done
chk "крок 2: anon не читає seasons, players, league_results; seasons_pub, виклики, my_seasons, fl_get і профіль працюють" anon "
  begin perform 1 from seasons limit 1; assert false, 'seasons'; exception when insufficient_privilege then null; end;
  begin perform 1 from players limit 1; assert false, 'players'; exception when insufficient_privilege then null; end;
  begin perform 1 from league_results limit 1; assert false, 'league_results'; exception when insufficient_privilege then null; end;
  assert (select count(*) from seasons_pub) > 0 and exists (select 1 from seasons_pub where players is not null), 'seasons_pub';
  perform 1 from challenges_pub; perform 1 from challenge_results_pub;
  assert json_array_length(my_seasons('$DEV', '$SEC')) > 0, 'my_seasons';
  assert fl_get('$F87') is not null and (trophy_stats())::text is not null and (game_stats())::text is not null, 'RPC';"
# audit package C (sql/v0891_audit_c.sql): api_gate and league_view, server only
for pass in 1 2; do
  if $P -d t1 -f "$ROOT/sql/v0891_audit_c.sql" >/dev/null 2>"$D/err"; then ok "запуск $pass: v0891_audit_c.sql"; else bad "запуск $pass: v0891_audit_c.sql — $(grep -v NOTICE "$D/err" | head -3)"; fi
done
GDEV=eeeeeeee-0000-4000-a000-000000000891; GSEC=0123456789abcdef0123456789abcdef
chk "api_gate і league_view: anon та authenticated не викликають" anon "
  begin perform api_gate('t', '1.1.1.1', '$GDEV', null, 5, 20); assert false, 'api_gate'; exception when insufficient_privilege then null; end;
  begin perform league_view(-9001); assert false, 'league_view'; exception when insufficient_privilege then null; end;"
chk "api_gate (v0891, до v090): ліміт пристрою й IP, секрет перевіряється лише в межах ліміту" service_role "
  j := api_gate('gt', '9.9.9.9', '$GDEV', '$GSEC', 3, 12);
  assert (j->>'rate')::boolean and j->>'err' is null and (j->>'player') is not null, 'перший виклик ' || j::text;
  assert (api_gate('gt', '9.9.9.9', '$GDEV', '$GSEC', 3, 12)->>'player') = (j->>'player'), 'той самий гравець';
  k := api_gate('gt', '9.9.9.9', '$GDEV', 'attacker-attacker-attacker', 3, 12);
  assert (k->>'rate')::boolean and k->>'err' = 'secret' and (k->>'player') is null, 'чужий секрет ' || k::text;
  k := api_gate('gt', '9.9.9.9', '$GDEV', '$GSEC', 3, 12);
  assert not (k->>'rate')::boolean and k->>'err' is null, 'четвертий виклик за хвилину — ліміт ' || k::text;
  k := api_gate('gt2', '9.9.9.8', null, null, 3, 2);
  k := api_gate('gt2', '9.9.9.8', null, null, 3, 2); k := api_gate('gt2', '9.9.9.8', null, null, 3, 2);
  assert not (k->>'rate')::boolean, 'ліміт IP без пристрою';
  k := api_gate('gt3', '9.9.9.7', '$GDEV', null, 5, 20);
  assert (k->>'rate')::boolean and (k->>'player') is null, 'без секрету — лише лічильники';"
$P -d t1 >/dev/null 2>"$D/err" <<SQL && ok "league_view: дані для перевірки" || bad "league_view: дані — $(grep -v NOTICE "$D/err" | head -2)"
do \$\$ declare d0 date := (now() at time zone 'Europe/Kyiv')::date; pa uuid; s1 bigint; s2 bigint; s3 bigint; s4 bigint; s5 bigint; begin
  insert into leagues(chat_id, title) values (-9001, 'Тест') on conflict do nothing;
  insert into league_members(chat_id, tg_user_id, name) values (-9001, 7001, 'A'), (-9001, 7002, 'B') on conflict do nothing;
  insert into league_members(chat_id, tg_user_id, name, left_at) values (-9001, 7009, 'gone', now()) on conflict do nothing;
  insert into players(anon_name) values ('silent_owl') returning id into pa;
  insert into player_links(kind, key, player_id) values ('tg', '7001', pa);
  insert into seasons(device_id, mode, format, formation, w, d, l, pts, place, gf, ga, tg_user_id, day) values ('$GDEV', 'normal', 'classic', '4-4-2', 20, 5, 5, 65, 2, 50, 20, 7001, d0) returning id into s1;
  insert into seasons(device_id, mode, format, formation, w, d, l, pts, place, gf, ga, tg_user_id, day) values ('$GDEV', 'normal', 'classic', '4-4-2', 18, 6, 6, 60, 3, 40, 25, 7002, d0) returning id into s2;
  insert into seasons(device_id, mode, format, formation, w, d, l, pts, place, gf, ga, tg_user_id, day) values ('$GDEV', 'normal', 'classic', '4-4-2', 30, 0, 0, 90, 1, 90, 0, 7003, d0) returning id into s3;
  insert into seasons(device_id, mode, format, formation, w, d, l, pts, place, gf, ga, tg_user_id, day) values ('$GDEV', 'normal', 'classic', '4-4-2', 22, 4, 4, 70, 1, 55, 20, 7002, d0 - 1) returning id into s4;
  insert into seasons(device_id, mode, format, formation, w, d, l, pts, place, gf, ga, tg_user_id, day) values ('$GDEV', 'normal', 'classic', '4-4-2', 10, 5, 15, 35, 9, 30, 40, 7001, d0 - 1) returning id into s5;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  update seasons set verified = true where id in (s1, s2, s4, s5);   -- s3 stays unverified
  insert into league_results(chat_id, day, tg_user_id, name, w, d, l, pts, gf, ga, season_id) values
    (-9001, d0, 7001, 'a-row', 1, 1, 1, 99, 1, 1, s1), (-9001, d0, 7002, 'Bob', 18, 6, 6, 60, 40, 25, s2), (-9001, d0, 7003, 'Cheat', 30, 0, 0, 90, 90, 0, s3),
    (-9001, d0 - 1, 7002, 'Bob', 22, 4, 4, 70, 55, 20, s4), (-9001, d0 - 1, 7001, 'a-row', 10, 5, 15, 35, 30, 40, s5),
    (-9001, d0, 7002, 'x', 0, 0, 0, 0, 0, 0, null) on conflict do nothing;
end \$\$;
SQL
chk "league_view: непідтверджені рядки відкинуто, цифри з сезону, імена з профілю, порядок дня" service_role "
  j := league_view(-9001)::json;
  assert j->>'title' = 'Тест' and (j->>'members')::int = 2, 'шапка ' || j::text;
  assert json_array_length(j->'today') = 2, 'сьогодні 2 рядки, є ' || (j->'today')::text;
  assert j->'today'->0->>'name' = 'silent_owl' and (j->'today'->0->>'pts')::int = 65 and (j->'today'->0->>'w')::int = 20 and j->'today'->0->>'u' is not null, 'перший ' || (j->'today'->0)::text;
  assert j->'today'->1->>'name' = 'Bob' and (j->'today'->1->>'pts')::int = 60, 'другий';
  assert json_array_length(j->'standings') = 2 and (select sum((x->>'wins')::int) from json_array_elements(j->'standings') x) = 2, 'підсумки ' || (j->'standings')::text;
  assert j->'standings'->0->>'name' = 'Bob' and (j->'standings'->0->>'wins')::int = 1 and (j->'standings'->0->>'days')::int = 2 and (j->'standings'->0->>'pts')::int = 130, 'Bob: 1 перемога, 2 дні, 130 очок, а є ' || (j->'standings'->0)::text;
  assert (league_view(-9001, null, true)::jsonb) ? 'standings' is false and jsonb_array_length((league_view(-9001, null, true))->'today') = 2, 'картка без підсумків';
  assert league_view(-1234) is null, 'невідома ліга';"
# ===== v090: f5 writes closed, api_gate order, cleanup =====
chk "v090 до: старі правила f5 дозволяють anon писати й змінювати чужу кімнату (дірка, яку закриває файл)" anon "
  insert into f5_rooms(id, seed, mode) values ('ROOM1', 1, 'turns');
  update f5_rooms set status = 'done' where id = 'ROOM1';
  assert (select status from f5_rooms where id = 'ROOM1') = 'done', 'update не спрацював (дірки вже немає?)';"
for pass in 1 2; do for f in v090_f5_close_writes v090_gate_order v090_seed_cleanup; do
  if $P -d t1 -f "$ROOT/sql/$f.sql" >/dev/null 2>"$D/err"; then ok "запуск $pass: $f.sql"; else bad "запуск $pass: $f.sql — $(grep -v NOTICE "$D/err" | head -3)"; fi
done; done
chk "v090 f5: anon і authenticated не пишуть у f5_* (insert, update, delete), читання лишилось" anon "
  begin insert into f5_rooms(id, seed, mode) values ('ROOM2', 1, 'turns'); assert false, 'insert room'; exception when insufficient_privilege then null; end;
  begin update f5_rooms set status = 'lobby' where id = 'ROOM1'; assert false, 'update room'; exception when insufficient_privilege then null; end;
  begin delete from f5_rooms where id = 'ROOM1'; assert false, 'delete room'; exception when insufficient_privilege then null; end;
  begin insert into f5_players(room_id, seat, device_id, name, form) values ('ROOM1', 0, 'aaaaaaaa-0000-4000-a000-0000000000f5', 'x', '1-2-1'); assert false, 'insert player'; exception when insufficient_privilege then null; end;
  begin insert into f5_picks(room_id, seat, k, n, club_idx, person_id, slot_idx) values ('ROOM1', 0, 0, 0, 0, 'p', 0); assert false, 'insert pick'; exception when insufficient_privilege then null; end;
  assert (select count(*) from f5_rooms where id = 'ROOM1') = 1, 'читання кімнат';"
chk "v090 f5: політик запису не лишилось, політики читання є, service_role пише" service_role "
  assert (select count(*) from pg_policies where tablename in ('f5_rooms', 'f5_players', 'f5_picks') and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')) = 0, 'політики запису';
  assert (select count(*) from pg_policies where tablename in ('f5_rooms', 'f5_players', 'f5_picks') and cmd = 'SELECT') = 3, 'політики читання';
  update f5_rooms set status = 'lobby' where id = 'ROOM1';
  assert (select status from f5_rooms where id = 'ROOM1') = 'lobby', 'service_role update';"
chk "v090 api_gate: чужий секрет не накручує лічильник пристрою (власник не потрапляє в 429)" service_role "
  j := api_gate('gx', '8.8.8.8', '$GDEV', '$GSEC', 2, 50);
  for i in 1..10 loop k := api_gate('gx', '8.8.8.8', '$GDEV', 'attacker-attacker-attacker', 2, 50); assert (k->>'rate')::boolean and k->>'err' = 'secret', 'чужий секрет ' || k::text; end loop;
  k := api_gate('gx', '8.8.8.8', '$GDEV', '$GSEC', 2, 50);
  assert (k->>'rate')::boolean and (k->>'player') = (j->>'player'), 'власник після 10 чужих спроб ' || k::text;
  k := api_gate('gx', '8.8.8.8', '$GDEV', '$GSEC', 2, 50);
  assert not (k->>'rate')::boolean, 'свій ліміт пристрою діє';
  for i in 1..6 loop k := api_gate('gy', '8.8.8.7', '$GDEV', 'attacker-attacker-attacker', 100, 5); end loop;
  assert not (k->>'rate')::boolean, 'підбір секрету обмежений за IP';
  k := api_gate('gz', '8.8.8.6', '$GDEV', 'short', 5, 50);
  assert (k->>'rate')::boolean and k->>'err' = 'device', 'короткий секрет — err device ' || k::text;"
chk "v090 cleanup_old_rows: anon не викликає" anon "
  begin perform cleanup_old_rows(); assert false, 'cleanup'; exception when insufficient_privilege then null; end;"
chk "v090 cleanup_old_rows: тільки невикористані й не виклик дня, старші 2 діб; tg_logins старші 2 діб; повтор нічого не псує" postgres "
  insert into season_seeds(device_id, xi_hash, seed, day, created_at, used_by) values
    ('aaaaaaaa-0000-4000-a000-0000000c1e01', 'old-free', 1, '2026-09-01', now() - interval '3 days', null),
    ('aaaaaaaa-0000-4000-a000-0000000c1e01', 'old-used', 2, '2026-09-01', now() - interval '3 days', 77),
    ('aaaaaaaa-0000-4000-a000-0000000c1e01', 'fresh-free', 3, '2026-09-01', now() - interval '1 day', null);
  insert into season_seeds(device_id, xi_hash, seed, day, created_at, vd_day, vd_attempt) values
    ('aaaaaaaa-0000-4000-a000-0000000c1e01', 'old-vd', 4, '2026-09-01', now() - interval '5 days', '2026-09-01', 1);
  insert into tg_logins(token, tg_id, created_at) values ('t-old', 1, now() - interval '3 days'), ('t-new', 2, now());
  perform set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true);
  set local role service_role;
  j := cleanup_old_rows()::json;
  assert (j->>'season_seeds')::int >= 1 and (j->>'tg_logins')::int = 1, 'підсумок ' || j::text;
  reset role;
  assert not exists (select 1 from season_seeds where xi_hash = 'old-free'), 'старий невикористаний лишився';
  assert exists (select 1 from season_seeds where xi_hash = 'old-used'), 'використаний видалено';
  assert exists (select 1 from season_seeds where xi_hash = 'fresh-free'), 'свіжий видалено';
  assert exists (select 1 from season_seeds where xi_hash = 'old-vd'), 'спробу виклику дня видалено';
  assert exists (select 1 from tg_logins where token = 't-new') and not exists (select 1 from tg_logins where token = 't-old'), 'tg_logins';
  set local role service_role;
  j := cleanup_old_rows()::json;
  assert (j->>'season_seeds')::int = 0 and (j->>'tg_logins')::int = 0, 'повторний запуск ' || j::text;"
# ===== v090: public profile counts only verified seasons =====
PDEV=aaaaaaaa-0000-4000-a000-0000000000c2
$P -d t1 -q >/dev/null 2>"$D/err" <<SQL || bad "v090 профіль: тестові сезони — $(head -3 "$D/err")"
select player_hello('$PDEV', '$SEC');
select set_config('request.jwt.claims', '{"role":"service_role"}', false);   -- the server writes verified
insert into seasons(device_id, mode, format, formation, w, d, l, pts, place, gf, ga, xi)
select '$PDEV', 'normal', 'classic', '4-4-2', 20, 5, 5, 65, 2, 60, 30, '[{"id":"pv1","n":"Тест","c":"Динамо (Київ)","r0":80}]' from generate_series(1, 4);
update seasons s set verified = case q.rn when 1 then true when 2 then false when 3 then null else true end from (select id, row_number() over (order by id) rn from seasons where device_id = '$PDEV') q where s.id = q.id;
SQL
chk "v090 профіль до: непідтверджені (null) сезони ще рахуються (стара поведінка)" postgres "
  assert (select count(*) from seasons where device_id = '$PDEV' and verified is not false) = 3, 'підготовка';
  j := player_profile(t_link('device', '$PDEV')); assert (j->>'seasons')::int = 3, j::text;"
for pass in 1 2; do
  if $P -d t1 -f "$ROOT/sql/v090_profile_verified.sql" >/dev/null 2>"$D/err"; then ok "запуск $pass: v090_profile_verified.sql"; else bad "запуск $pass: v090_profile_verified.sql — $(grep -v NOTICE "$D/err" | head -3)"; fi
done
chk "v090 профіль: рахуються лише verified = true; player_profile_pub так само; форма відповіді та права ті самі" anon "
  j := player_profile_pub((player_hello('$PDEV', '$SEC'))->>'public_id');
  assert (j->>'seasons')::int = 2, 'сезонів ' || (j->>'seasons');
  assert j->'best' is not null and json_typeof(j->'trophies') = 'array' and j->>'champions' is not null and j->'fav_player' is not null, j::text;
  assert j::text !~ '$PDEV', 'device_id у профілі';"
chk "v090 профіль: execute лише в anon і authenticated, не в public; сигнатура не змінилась" postgres "
  assert has_function_privilege('anon', 'public.player_profile(uuid)', 'execute') and has_function_privilege('authenticated', 'public.player_profile(uuid)', 'execute'), 'anon';
  assert not exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.proname = 'player_profile' and a.grantee = 0), 'public має execute';
  assert (select count(*) from pg_proc where proname = 'player_profile') = 1, 'перевантаження';"
# channel tick from pg_cron (sql/v0912_channel_cron.sql, part 1): token kept on a rerun, only the service role checks it
for pass in 1 2; do
  if $P -d t1 -tA -f "$ROOT/sql/v0912_channel_cron.sql" >"$D/out$pass" 2>"$D/err"; then ok "запуск $pass: v0912_channel_cron.sql"; else bad "запуск $pass: v0912_channel_cron.sql — $(grep -v NOTICE "$D/err" | head -3)"; fi
done
if [ "$(cat "$D/out1")" = "1|t|f" ] && [ "$(cat "$D/out2")" = "1|t|f" ]; then ok "v0912: один ключ, перевірка проходить, anon не читає app_secrets"; else bad "v0912: перевірка — $(cat "$D/out1") / $(cat "$D/out2")"; fi
chk "v0912: ключ — 64 hex, чужі ключі не проходять" postgres "
  assert (select value ~ '^[0-9a-f]{64}\$' from app_secrets where name = 'channel_cron'), 'формат';
  assert not cron_token_ok('a') and not cron_token_ok(null) and not cron_token_ok(repeat('0', 64)), 'чужий ключ';"
chk "v0912: anon і authenticated не викликають cron_token_ok і channel_cron_on" postgres "
  assert not has_function_privilege('anon', 'public.cron_token_ok(text)', 'execute') and not has_function_privilege('authenticated', 'public.cron_token_ok(text)', 'execute'), 'cron_token_ok';
  assert not has_function_privilege('anon', 'public.channel_cron_on(text)', 'execute') and not has_function_privilege('authenticated', 'public.channel_cron_on(text)', 'execute'), 'channel_cron_on';
  assert has_function_privilege('service_role', 'public.cron_token_ok(text)', 'execute'), 'service_role';
  assert not has_table_privilege('authenticated', 'public.app_secrets', 'select'), 'authenticated читає';"
# 0.91.1 hardening (sql/v0911_hardening.sql): no direct writes, unused tables unreadable, other 5x5 formations hidden
for pass in 1 2; do
  if $P -d t1 -tA -f "$ROOT/sql/v0911_hardening.sql" >"$D/out" 2>"$D/err" && [ ! -s "$D/out" ]; then ok "запуск $pass: v0911_hardening.sql"; else bad "запуск $pass: v0911_hardening.sql — $(grep -v NOTICE "$D/err" | head -3) $(head -3 "$D/out")"; fi
done
chk "v0911: anon не пише в players і seasons, не читає player_links і season_seeds; user_state — як було" postgres "
  assert not has_table_privilege('anon', 'public.players', 'insert') and not has_table_privilege('authenticated', 'public.seasons', 'delete'), 'запис';
  assert not has_table_privilege('anon', 'public.seasons', 'truncate') and not has_table_privilege('authenticated', 'public.user_state', 'truncate'), 'truncate';
  assert not has_table_privilege('anon', 'public.player_links', 'select') and not has_table_privilege('authenticated', 'public.season_seeds', 'select'), 'читання';
  assert has_table_privilege('authenticated', 'public.user_state', 'insert') and has_table_privilege('authenticated', 'public.user_state', 'select'), 'user_state';"
chk "v0911: 5x5 — нова ліга до турніру, обидва склади" authenticated "
  j := fl_create5('$MX', '$SEC', 'Кубок 0911', 3, 1, 'show', 'all');" ',"sub":"'$UG'"'
F911=$($P -d t1 -tAc "select id from fl_leagues where name = 'Кубок 0911' order by created_at desc limit 1")
chk "v0911: друг надсилає склад" authenticated "
  j := fl_join('$L3', '$SEC', '$F911'); j := fl5_submit('$L3', '$SEC', '$F911', '1-2-1', '$XI');" ',"sub":"'$U3'"'
chk "v0911: 5x5 до турніру — у чужого немає ні складу, ні схеми; свій видно повністю" authenticated "
  j := fl5_submit('$MX', '$SEC', '$F911', '2-2', '$XI');
  assert json_array_length(j->'fives') = 2 and (select count(*) from jsonb_array_elements(j::jsonb->'fives') f where f ? 'xi' and f->>'form' = '2-2') = 1, 'свій ' || j::text;
  assert (select count(*) from jsonb_array_elements(j::jsonb->'fives') f where not f ? 'xi' and f ? 'form') = 0, 'чужа схема видна ' || j::text;" ',"sub":"'$UG'"'
chk "v0911: anon до турніру не бачить схем" anon "
  j := fl_get('$F911'); assert (j->>'fives_n')::int = 2 and (select count(*) from jsonb_array_elements(j::jsonb->'fives') f where f ? 'form' or f ? 'xi') = 0, j::text;"
# 0.92 share (sql/v092_share.sql): daily-challenge fields in seasons_pub, squad hidden until the challenge day is over
for pass in 1 2; do
  if $P -d t1 -tA -f "$ROOT/sql/v092_share.sql" >"$D/out" 2>"$D/err" && [ "$(cat "$D/out")" = "t|t|t|t" ]; then ok "запуск $pass: v092_share.sql"; else bad "запуск $pass: v092_share.sql — $(grep -v NOTICE "$D/err" | head -3) $(head -3 "$D/out")"; fi
done
chk "v092: сезон виклику дня — сьогодні склад схований, рахунок видно; наступного дня склад відкритий" postgres "
  insert into seasons(device_id, mode, format, formation, w, d, l, pts, place, gf, ga, xi) values ('$DEV', 'normal', 'classic', '4-4-2', 10, 10, 10, 40, 8, 30, 30, '[{\"n\":\"X\"}]');
  insert into vd_results(day, device_id, attempt, gate_ok, score, season_id) values ((now() at time zone 'Europe/Kyiv')::date, '$DEV', 1, true, 9, (select max(id) from seasons));
  assert (select xi is null and vd_score = 9 and vd_gate from seasons_pub where id = (select max(id) from seasons)), 'сьогодні';
  update vd_results set day = day - 1 where season_id = (select max(id) from seasons);
  assert (select xi is not null and vd_day is not null from seasons_pub where id = (select max(id) from seasons)), 'завтра';
  assert (select xi is not null and vd_day is null from seasons_pub where id = (select min(id) from seasons where xi is not null)), 'звичайний сезон';"
chk "v092: сезон виклику дня без перевірки сервером (немає рядка vd_results) — склад сьогодні теж схований" postgres "
  insert into season_seeds(device_id, xi_hash, seed, day, vd_day) values ('$DEV', 'h092', 7, (now() at time zone 'Europe/Kyiv')::date, (now() at time zone 'Europe/Kyiv')::date);
  insert into seasons(device_id, mode, format, formation, w, d, l, pts, place, gf, ga, xi, seed_id) values ('$DEV', 'normal', 'classic', '4-4-2', 10, 10, 10, 40, 8, 30, 30, '[{\"n\":\"X\"}]', (select id from season_seeds where seed = 7 and vd_day is not null order by created_at desc limit 1));
  assert (select xi is null and vd_day is null from seasons_pub where id = (select max(id) from seasons)), 'сьогодні без vd_results';
  update season_seeds set vd_day = vd_day - 1 where id = (select seed_id from seasons where id = (select max(id) from seasons));
  assert (select xi is not null from seasons_pub where id = (select max(id) from seasons)), 'завтра';"
chk "v092: сезон виклику дня без seed від сервера (vd_day у самому сезоні) — склад сьогодні схований" postgres "
  insert into seasons(device_id, mode, format, formation, w, d, l, pts, place, gf, ga, xi, vd_day) values ('$DEV', 'normal', 'classic', '4-4-2', 10, 10, 10, 40, 8, 30, 30, '[{\"n\":\"X\"}]', (now() at time zone 'Europe/Kyiv')::date);
  assert (select xi is null from seasons_pub where id = (select max(id) from seasons)), 'сьогодні без seed';
  update seasons set vd_day = vd_day - 1 where id = (select max(id) from seasons);
  assert (select xi is not null from seasons_pub where id = (select max(id) from seasons)), 'завтра';"
chk "v092 профіль: сьогоднішні сезони виклику дня не рахуються в улюбленого гравця й клуб (підказка схованого складу)" postgres "
  j := player_profile(t_link('device', '$PDEV')); assert j->'fav_player'->>'id' = 'pv1', 'до ' || j::text;
  update seasons set vd_day = (now() at time zone 'Europe/Kyiv')::date where device_id = '$PDEV';
  j := player_profile(t_link('device', '$PDEV')); assert j->'fav_player' is null or json_typeof(j->'fav_player') = 'null', 'сьогодні ' || j::text;
  assert (j->>'seasons')::int >= 1, 'сезони рахуються ' || j::text;
  update seasons set vd_day = vd_day - 1 where device_id = '$PDEV';
  j := player_profile(t_link('device', '$PDEV')); assert j->'fav_player'->>'id' = 'pv1', 'завтра ' || j::text;
  update seasons set vd_day = null where device_id = '$PDEV';"
echo "база: $D (порт $PORT)"
[ $FAIL = 0 ] && echo "SQL: УСЕ ГАРАЗД ($N перевірок)" || echo "SQL: ПРОБЛЕМИ $FAIL/$N"
exit $((FAIL>0))

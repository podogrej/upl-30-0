#!/bin/bash
# База з нуля в локальному Postgres (заглушка Supabase — stub.sql) і перевірки SQL:
#  - new_db_part_A.sql + v039_part_B.sql + cards_bucket.sql проходять і ПОВТОРНИЙ запуск нічого не ламає (CLAUDE.md, «База»);
#  - гравець v0.39: player_hello, set_player_name, секрет пристрою (чужий пристрій не перейменує), тригер player_id, strip_verified;
#  - 0.53 (v053_writes.sql, двічі): device_ok лише для сервера, старий пристрій без секрету не забирає чужу історію (К6),
#    спільний пристрій не зливає два акаунти (В6), одна офіційна спроба дня (В2), дублі — NOTICE без падіння;
#  - крок 2 (v054_close_writes.sql, двічі): прямий запис anon/authenticated закрито, читання й сервер працюють;
#  - 0.55 (v055_backups.sql, двічі): сховище backups приватне, anon/authenticated не читають і не бачать файлів; rate_hit — лише сервер.
#  - 0.59 (v059_player_page.sql, двічі): правила імен, унікальність без регістру, 30 днів, public_id, сторінка гравця, видалення акаунта,
#    лічильники за гравцем, жодного нового прямого запису для anon; база зі збігами імен — NOTICE без індексу; v059_name_conflicts.sql читається.
#  База — UTF8 з локаллю C (lower() не чіпає кирилицю — як найгірший випадок; ключ імені робить переклад сам).
# Потрібні бінарники Postgres (/usr/lib/postgresql/*/bin). Запуск з кореня: bash tools/tests/setup.sh   (KEEP=1 — не зупиняти базу)
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
# перевірка = блок plpgsql від імені ролі; assert падає — перевірка не пройшла
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
# старий пристрій (до 0.39: сезон є, секрету немає) і старий пристрій без історії; «прод»-назви політик дня
$P -d t1 >/dev/null 2>"$D/err" <<SQL || { cat "$D/err"; exit 1; }
begin; set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into seasons(device_id, mode, format, formation, w, d, l, pts, place, gf, ga, nickname) values ('$LDEV', 'normal', 'classic', '4-4-2', 10, 10, 10, 40, 8, 30, 30, 'Власник');
commit;
select player_for_device('$EDEV');
update players set name = 'Власник' where id = (select player_id from player_links where key = '$LDEV');
create policy "insert today" on daily_results for insert to anon with check (day between (now() at time zone 'Europe/Kyiv')::date - 1 and (now() at time zone 'Europe/Kyiv')::date);
create policy "read all" on daily_results for select to anon using (true);
-- лише для тесту: читати player_links (RLS) з перевірок від імені anon/authenticated
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
# В2 у базі, де дублі вже є: файл не падає, індекс не створено
$P -c "create database t2" >/dev/null
if { $P -d t2 -f "$ROOT/tools/tests/stub.sql" && $P -d t2 -f "$ROOT/sql/new_db_part_A.sql" && $P -d t2 -f "$ROOT/sql/v039_part_B.sql" \
     && $P -d t2 -c "insert into season_seeds(device_id, xi_hash, seed, day, daily, official) select '$DEV', 'x', g, '2026-10-01', true, true from generate_series(1,2) g" \
     && $P -d t2 -f "$ROOT/sql/v053_writes.sql"; } >/dev/null 2>"$D/err" && grep -q "НЕ створено" "$D/err" \
   && [ "$($P -d t2 -tAc "select count(*) from pg_indexes where indexname = 'season_seeds_official_uq'")" = 0 ]
then ok "В2: дублі вже є — NOTICE, індекс не створено, файл не падає"; else bad "В2: база з дублями — $(grep -v NOTICE "$D/err" | head -2)"; fi
# ===== крок 2 =====
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
# ===== 0.55: резервні копії й обмеження частоти =====
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
# ===== 0.59: сторінка гравця й імена =====
$P -d t1 -c "select count(*) from pg_policies" -tA > "$D/pol_before" 2>/dev/null
$P -d t1 -c "insert into players(anon_name, name) values ('X', 'Вітя')" >/dev/null   # старе ім'я з великої літери — «зайняте» для «вітя»
for pass in 1 2; do
  if $P -d t1 -f "$ROOT/sql/v059_player_page.sql" >/dev/null 2>"$D/err"; then ok "запуск $pass: v059_player_page.sql"; else bad "запуск $pass: v059_player_page.sql — $(grep -v NOTICE "$D/err" | head -3)"; fi
done
if $P -d t1 -f "$ROOT/sql/v059_name_conflicts.sql" >/dev/null 2>"$D/err"; then ok "v059_name_conflicts.sql читається без помилок"; else bad "v059_name_conflicts.sql — $(head -3 "$D/err")"; fi
if $P -d t1 -f "$ROOT/sql/v053_writes.sql" >/dev/null 2>"$D/err" && $P -d t1 -f "$ROOT/sql/v055_backups.sql" >/dev/null 2>>"$D/err"; then ok "v053/v055 після v059 — без помилок"; else bad "v053/v055 після v059 — $(grep -v NOTICE "$D/err" | head -3)"; fi
chk "v059: нових політик немає, anon/authenticated не пишуть у players і player_links" postgres "
  assert (select count(*) from pg_policies)::text = '$(cat "$D/pol_before")', 'кількість політик змінилась';
  assert not has_table_privilege('anon', 'players', 'insert') or not exists (select 1 from pg_policies where tablename = 'players' and cmd <> 'SELECT'), 'players: політика запису';
  assert not exists (select 1 from pg_policies where tablename in ('players','player_links') and cmd <> 'SELECT'), 'запис у players/player_links';
  assert (select count(*) from pg_indexes where indexname in ('players_name_uq', 'players_public_id_uq')) = 2, 'індекси';"
chk "v059: public_id у всіх гравців, унікальний, 8 символів; новий гравець теж отримує" postgres "
  assert (select count(*) from players where public_id is null or public_id !~ '^[a-z2-9]{8}$') = 0, 'public_id';
  pid := player_for_device('cccccccc-0000-4000-a000-000000000009'); assert (select public_id is not null from players where id = pid), 'новий без public_id';"
chk "v059: нове анонімне ім'я в нижньому регістрі, ключ імені — нижній регістр і для кирилиці" postgres "
  declare a text := anon_name(); begin assert a = lower(a), a; end;
  assert name_key('  ВІТЯ   Ґонта’s ') = 'вітя ґонта''s', name_key('  ВІТЯ   Ґонта’s ');"
chk "set_player_name: ім'я зберігається в нижньому регістрі; той самий ключ — без відліку 30 днів" anon "
  j := set_player_name('$DEV', '$SEC', 'Андрій Ш'); assert j->>'name' = 'андрій ш' and j->>'public_id' is not null, j::text;
  j := set_player_name('$DEV', '$SEC', 'АНДРІЙ   Ш'); assert j->>'name' = 'андрій ш' and j->>'name_next' is null, 'другий раз ' || j::text;"
chk "set_player_name: правила — 2 символи, крапка, лише цифри, мат, 21 символ" anon "
  begin j := set_player_name('$DEV', '$SEC', 'ab'); assert false, '2 символи'; exception when sqlstate '22023' then assert sqlerrm = 'name_len', sqlerrm; end;
  begin j := set_player_name('$DEV', '$SEC', 'andriy.s'); assert false, 'крапка'; exception when sqlstate '22023' then assert sqlerrm = 'name_chars', sqlerrm; end;
  begin j := set_player_name('$DEV', '$SEC', '12345'); assert false, 'цифри'; exception when sqlstate '22023' then assert sqlerrm = 'name_chars', sqlerrm; end;
  begin j := set_player_name('$DEV', '$SEC', 'Супер_ХУЙ'); assert false, 'мат'; exception when sqlstate '22023' then assert sqlerrm = 'name_bad', sqlerrm; end;
  begin j := set_player_name('$DEV', '$SEC', repeat('я', 21)); assert false, '21'; exception when sqlstate '22023' then assert sqlerrm = 'name_len', sqlerrm; end;
  assert (player_hello('$DEV', '$SEC'))->>'name' = 'андрій ш', 'ім''я змінилось';"
chk "set_player_name: зайняте без урахування регістру (у базі «Вітя») — name_taken" anon "
  begin j := set_player_name('$NDEV', '$SEC2', 'вітя'); assert false, 'взяв зайняте'; exception when sqlstate '23505' then assert sqlerrm = 'name_taken', sqlerrm; end;"
chk "set_player_name: перша зміна з анонімного — вільно, друга — лише через 30 днів (name_wait:дата), скинути теж не можна" anon "
  j := set_player_name('$EDEV', '$SEC2', 'сергій'); assert j->>'name' = 'сергій' and j->>'name_next' is null, j::text;
  j := set_player_name('$EDEV', '$SEC2', 'сергій 2'); assert j->>'name' = 'сергій 2' and j->>'name_next' is not null, j::text;
  begin j := set_player_name('$EDEV', '$SEC2', 'сергій 3'); assert false, 'друга зміна'; exception when sqlstate '22023' then assert sqlerrm like 'name_wait:____-__-__', sqlerrm; end;
  begin j := set_player_name('$EDEV', '$SEC2', ''); assert false, 'скинув'; exception when sqlstate '22023' then assert sqlerrm like 'name_wait:%', sqlerrm; end;"
chk "set_player_name: чужий секрет — відмова (як раніше)" anon "
  begin j := set_player_name('$DEV', 'attacker-attacker-attacker', 'hacked'); assert false, 'перейменував'; exception when sqlstate '28000' then null; end;"
chk "унікальний індекс: навіть сервер не запише друге «СЕРГІЙ 2»" service_role "
  begin update players set name = 'СЕРГІЙ 2', merged_into = null where id = t_link('device', '$NDEV'); assert false, 'дубль'; exception when unique_violation then null; end;"
chk "merge_players з однаковими іменами не падає на унікальному індексі" postgres "
  declare a uuid; b uuid; begin
  insert into players(anon_name) values ('m1') returning id into a; insert into players(anon_name) values ('m2') returning id into b;
  update players set name = 'злиття' where id = a; perform merge_players(a, b);
  assert (select name from players where id = b) = 'злиття' and (select merged_into from players where id = a) = b, 'злиття';
  end;"
chk "player_profile_pub (anon): ім'я, цифри, трофеї; без device_id" anon "
  j := player_profile_pub((player_hello('$DEV', '$SEC'))->>'public_id');
  assert j->>'name' = 'андрій ш' and (j->>'seasons')::int >= 1 and j->'best' is not null and json_typeof(j->'trophies') = 'array', j::text;
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
# база, де збіги імен уже є: файл не падає, індекс не створено, NOTICE
$P -c "create database t3" >/dev/null
if { $P -d t3 -f "$ROOT/tools/tests/stub.sql" && $P -d t3 -f "$ROOT/sql/new_db_part_A.sql" && $P -d t3 -f "$ROOT/sql/v039_part_B.sql" \
     && $P -d t3 -c "insert into players(anon_name, name) values ('a', 'Вітя'), ('b', 'вітя '), ('c', 'Ok')" && $P -d t3 -f "$ROOT/sql/v053_writes.sql" \
     && $P -d t3 -f "$ROOT/sql/v059_player_page.sql"; } >/dev/null 2>"$D/err" && grep -q "НЕ створено" "$D/err" \
   && [ "$($P -d t3 -tAc "select count(*) from pg_indexes where indexname = 'players_name_uq'")" = 0 ] \
   && $P -d t3 -f "$ROOT/sql/v059_name_conflicts.sql" -tA 2>>"$D/err" | grep -c "^збіг" | grep -qx 2
then ok "збіги імен уже є — NOTICE, індекс не створено, файл не падає; v059_name_conflicts.sql показує обидва"; else bad "база зі збігами імен — $(grep -v NOTICE "$D/err" | head -2)"; fi
echo "база: $D (порт $PORT)"
[ $FAIL = 0 ] && echo "SQL: УСЕ ГАРАЗД ($N перевірок)" || echo "SQL: ПРОБЛЕМИ $FAIL/$N"
exit $((FAIL>0))

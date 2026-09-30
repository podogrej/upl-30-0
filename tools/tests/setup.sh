#!/bin/bash
# База з нуля в локальному Postgres (заглушка Supabase — stub.sql) і перевірки SQL:
#  - new_db_part_A.sql + v039_part_B.sql + cards_bucket.sql проходять і ПОВТОРНИЙ запуск нічого не ламає (CLAUDE.md, «База»);
#  - гравець v0.39: player_hello, set_player_name, секрет пристрою (чужий пристрій не перейменує), тригер player_id, strip_verified;
#  - 0.53 (v053_writes.sql, двічі): device_ok лише для сервера, старий пристрій без секрету не забирає чужу історію (К6),
#    спільний пристрій не зливає два акаунти (В6), одна офіційна спроба дня (В2), дублі — NOTICE без падіння;
#  - крок 2 (v054_close_writes.sql, двічі): прямий запис anon/authenticated закрито, читання й сервер працюють;
#  - 0.55 (v055_backups.sql, двічі): сховище backups приватне, anon/authenticated не читають і не бачать файлів; rate_hit — лише сервер.
#  - 0.59 (v059_player_page.sql, двічі): імена лише латиницею (правила, транслітерація, міграція старих імен і її повтор), унікальність без регістру, 30 днів, public_id, сторінка гравця, видалення акаунта,
#    лічильники за гравцем, жодного нового прямого запису для anon; база зі збігами імен і база зі старою версією v059 — доводяться до правил.
#  - 0.60 (v060_one_player.sql, двічі): питання «Це ти?» при другому вході, відповідь лише тим самим входом, злиття з журналом і відкат (unmerge_players),
#    «andré» лише власнику (і повторний v059 його не чіпає), пошта для новин (правила, не публічна, стирається з акаунтом), show_r, «Вибір сезону» на сторінці гравця.
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
# ===== 0.59: сторінка гравця й імена (лише латиниця, рішення власника 30.09.2026) =====
$P -d t1 -c "select count(*) from pg_policies" -tA > "$D/pol_before" 2>/dev/null
$P -d t1 -c "insert into players(anon_name, name) values ('Brave Fox', 'Вітя'), ('Calm Owl', 'andré'), ('Bold Hawk', 'Anna Maria'), ('Quiet Lynx', 'Щербак')" >/dev/null   # старі імена: кирилиця, «é», пробіл і великі літери
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
# ===== 0.60: «Один гравець» — питання «Це ти?», журнал злиттів, «andré», пошта, show_r, «Вибір сезону» на сторінці =====
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
-- лише для тесту: читати закриті таблиці 0.60 з перевірок від імені authenticated
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
# база, де збіги імен уже є: v059_name_conflicts.sql їх показує; v059 дає молодшому номер і створює індекс
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
# тестова база, де вже виконано ПОПЕРЕДНЮ версію v059 (імена кирилицею в нижньому регістрі, індекс на name_key): нова версія доводить до латиниці
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
echo "база: $D (порт $PORT)"
[ $FAIL = 0 ] && echo "SQL: УСЕ ГАРАЗД ($N перевірок)" || echo "SQL: ПРОБЛЕМИ $FAIL/$N"
exit $((FAIL>0))

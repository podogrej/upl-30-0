#!/bin/bash
# База з нуля в локальному Postgres (заглушка Supabase — stub.sql) і перевірки SQL:
#  - new_db_part_A.sql + v039_part_B.sql + cards_bucket.sql проходять і ПОВТОРНИЙ запуск нічого не ламає (CLAUDE.md, «База»);
#  - гравець v0.39: player_hello, set_player_name, секрет пристрою (чужий пристрій не перейменує), тригер player_id, strip_verified.
# Потрібні бінарники Postgres (/usr/lib/postgresql/*/bin). Запуск з кореня: bash tools/tests/setup.sh   (KEEP=1 — не зупиняти базу)
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1); [ -x "$BIN/initdb" ] || { echo "SQL: немає Postgres — пропускаю"; exit 2; }
D=$(mktemp -d /tmp/upl-pg.XXXXXX); PORT=${PGPORT_TEST:-5439}
AS=""; [ "$(id -u)" = 0 ] && { chown postgres "$D"; AS="su postgres -s /bin/bash -c"; }
run(){ if [ -n "$AS" ]; then $AS "$*"; else bash -c "$*"; fi; }
run "$BIN/initdb -D $D/data -A trust -U postgres >/dev/null" || { echo "SQL: initdb не вдався"; exit 2; }
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
echo "база: $D (порт $PORT)"
[ $FAIL = 0 ] && echo "SQL: УСЕ ГАРАЗД ($N перевірок)" || echo "SQL: ПРОБЛЕМИ $FAIL/$N"
exit $((FAIL>0))

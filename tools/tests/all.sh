#!/bin/bash
# Усі автоперевірки одним запуском (0.64): локально й у GitHub Actions (.github/workflows/ci.yml).
# Запуск з кореня: bash tools/tests/all.sh   (QUICK=1 — швидкий набір ~1 хв; JOBS=N — скільки тестів у браузері одночасно, типово 3)
# Код виходу 0 — усе гаразд; інакше в кінці список того, що впало.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT" || exit 1
LOG=$(mktemp -d); FAIL=(); PASS=0
step(){ local name="$1"; shift; local t=$SECONDS
  if "$@" >"$LOG/$PASS.log" 2>&1; then echo "✓ $name ($((SECONDS-t)) с)"; else echo "✗ $name ($((SECONDS-t)) с)"; tail -25 "$LOG/$PASS.log" | sed 's/^/    /'; FAIL+=("$name"); fi
  PASS=$((PASS+1)); }
# 1. index.html, lib/engine.js, lib/five_core.js — згенеровані: перезбираємо й дивимося, що в репозиторії вони свіжі
GEN="index.html lib/engine.js lib/five_core.js pool.*.js"; BEFORE=$(md5sum $GEN)
step "збірка" bash -c 'python3 src/build.py && node tools/make_engine.js'
gen_same(){ [ "$(md5sum $GEN)" = "$BEFORE" ] || { echo 'index.html / lib/* застаріли: python3 src/build.py && node tools/make_engine.js — і закомітити'; return 1; }; }
step "згенеровані файли свіжі (збірка нічого не змінила)" gen_same
step "пул гравців (check_pool)" python3 data/check_pool.py
step "сервер завантажується (як на Vercel)" node tools/tests/server_load.js
# швидкі тести без браузера — завжди
for t in cheat card_api err_digest player_texts feedback; do step "тест $t" node "tools/tests/$t.js"; done
# тести в браузері (0.67): незалежні, тож ідуть по JOBS одночасно (типово 3) — найдовші першими; QUICK=1 — лише короткий набір
UI="determinism scenarios fl63 f5online modes chal tro v064 fl61 leagueui v060 player_page v39 news draft58 pitch_layout f5test2 emoji_layout nav_back err_report long_names tg_swipes font_tour"
[ -n "$QUICK" ] && UI="draft58 v064 emoji_layout nav_back"
JOBS=${JOBS:-3}; declare -A T0
for t in $UI; do [ -f "tools/tests/$t.js" ] || continue
  while [ "$(jobs -rp | wc -l)" -ge "$JOBS" ]; do wait -n; done
  T0[$t]=$SECONDS; ( node "tools/tests/$t.js" >"$LOG/ui_$t.log" 2>&1; echo $? >"$LOG/ui_$t.rc"; echo $SECONDS >"$LOG/ui_$t.end" ) &
done
wait
for t in $UI; do [ -f "$LOG/ui_$t.rc" ] || continue
  name="тест $t"; [ "$t" = determinism ] && name="детермінізм"; [ "$t" = scenarios ] && name="сценарії"
  d=$(( $(cat "$LOG/ui_$t.end") - ${T0[$t]} ))
  if [ "$(cat "$LOG/ui_$t.rc")" = 0 ]; then echo "✓ $name ($d с)"; else echo "✗ $name ($d с)"; tail -25 "$LOG/ui_$t.log" | sed 's/^/    /'; FAIL+=("$name"); fi
  PASS=$((PASS+1))
done
if ls -d /usr/lib/postgresql/*/bin >/dev/null 2>&1; then step "SQL у Postgres (setup.sh)" bash tools/tests/setup.sh; else echo "· SQL: немає Postgres — пропускаю"; fi
rm -rf "$LOG"
echo
if [ ${#FAIL[@]} -eq 0 ]; then echo "УСІ ПЕРЕВІРКИ: УСЕ ГАРАЗД ($PASS)"; exit 0; fi
echo "ВПАЛО ${#FAIL[@]} з $PASS:"; printf -- '- %s\n' "${FAIL[@]}"; exit 1

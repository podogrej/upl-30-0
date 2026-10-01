#!/bin/bash
# Усі автоперевірки одним запуском (0.64): локально й у GitHub Actions (.github/workflows/ci.yml).
# Запуск з кореня: bash tools/tests/all.sh   (QUICK=1 — без довгих тестів інтерфейсу)
# Код виходу 0 — усе гаразд; інакше в кінці список того, що впало.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT" || exit 1
LOG=$(mktemp -d); FAIL=(); PASS=0
step(){ local name="$1"; shift; local t=$SECONDS
  if "$@" >"$LOG/$PASS.log" 2>&1; then echo "✓ $name ($((SECONDS-t)) с)"; else echo "✗ $name ($((SECONDS-t)) с)"; tail -25 "$LOG/$PASS.log" | sed 's/^/    /'; FAIL+=("$name"); fi
  PASS=$((PASS+1)); }
# 1. index.html, lib/engine.js, lib/five_core.js — згенеровані: перезбираємо й дивимося, що в репозиторії вони свіжі
GEN="index.html lib/engine.js lib/five_core.js"; BEFORE=$(md5sum $GEN)
step "збірка" bash -c 'python3 src/build.py && node tools/make_engine.js'
gen_same(){ [ "$(md5sum $GEN)" = "$BEFORE" ] || { echo 'index.html / lib/* застаріли: python3 src/build.py && node tools/make_engine.js — і закомітити'; return 1; }; }
step "згенеровані файли свіжі (збірка нічого не змінила)" gen_same
step "пул гравців (check_pool)" python3 data/check_pool.py
step "сервер завантажується (як на Vercel)" node tools/tests/server_load.js
step "детермінізм" node tools/tests/determinism.js
step "сценарії" node tools/tests/scenarios.js
if [ -z "$QUICK" ]; then
  for t in cheat chal card_api modes v39 v060 v064 player_page tro news draft58 pitch_layout fl61 fl63 leagueui f5test2 f5online; do
    [ -f "tools/tests/$t.js" ] && step "тест $t" node "tools/tests/$t.js"
  done
fi
if ls -d /usr/lib/postgresql/*/bin >/dev/null 2>&1; then step "SQL у Postgres (setup.sh)" bash tools/tests/setup.sh; else echo "· SQL: немає Postgres — пропускаю"; fi
rm -rf "$LOG"
echo
if [ ${#FAIL[@]} -eq 0 ]; then echo "УСІ ПЕРЕВІРКИ: УСЕ ГАРАЗД ($PASS)"; exit 0; fi
echo "ВПАЛО ${#FAIL[@]} з $PASS:"; printf -- '- %s\n' "${FAIL[@]}"; exit 1

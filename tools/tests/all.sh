#!/bin/bash
# All automated checks in one run: locally and in GitHub Actions (.github/workflows/tests.yml).
# Run from repo root: bash tools/tests/all.sh   (QUICK=1: quick set ~1 min; JOBS=N: parallel browser tests, default 3)
# Urgent fix: FAST=1 ONLY="modes fl61" bash tools/tests/all.sh — build, fast tests, determinism, scenarios and the listed browser tests (~7 min);
# SQL check only if ONLY has "sql". CI (.github/workflows/tests.yml) always runs the full set, split into parts:
# SHARD=k/N runs build checks everywhere, fast tests and SQL only in part 1, and its share of browser tests (longest first, snake order).
# Exit code 0 = all good; otherwise a list of failures is printed at the end.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT" || exit 1
LOG=$(mktemp -d); FAIL=(); PASS=0
step(){ local name="$1"; shift; local t=$SECONDS
  if "$@" >"$LOG/$PASS.log" 2>&1; then echo "✓ $name ($((SECONDS-t)) с)"; else echo "✗ $name ($((SECONDS-t)) с)"; tail -25 "$LOG/$PASS.log" | sed 's/^/    /'; FAIL+=("$name"); fi
  PASS=$((PASS+1)); }
# 1. index.html, lib/engine.js, lib/five_core.js, lib/vd_core.js are generated: rebuild and verify the committed copies are up to date
GEN="index.html lib/engine.js lib/five_core.js lib/vd_core.js pool.*.js"; BEFORE=$(md5sum $GEN)
step "збірка" bash -c 'python3 src/build.py && node tools/make_engine.js'
gen_same(){ [ "$(md5sum $GEN)" = "$BEFORE" ] || { echo 'index.html / lib/* застаріли: python3 src/build.py && node tools/make_engine.js — і закомітити'; return 1; }; }
step "згенеровані файли свіжі (збірка нічого не змінила)" gen_same
step "пул гравців (check_pool)" python3 data/check_pool.py
step "сервер завантажується (як на Vercel)" node tools/tests/server_load.js
# vercel.json: Vercel rejects ignoreCommand longer than 256 chars (deploy fails before build)
step "vercel.json (ignoreCommand ≤ 256)" node -e 'const c=require("./vercel.json").ignoreCommand||"";if(c.length>256){console.log("ignoreCommand: "+c.length+" > 256");process.exit(1)}'
# fast non-browser tests: always run
SK=${SHARD%/*}; SN=${SHARD#*/}; [ -n "$SHARD" ] || { SK=1; SN=1; }
[ "$SK" = 1 ] && for t in cheat card_api err_digest player_texts feedback board_pin cron_summary channel notify code_comments css_classes trophies086; do step "тест $t" node "tools/tests/$t.js"; done
# browser tests are independent, so JOBS run in parallel (default 3), longest first; QUICK=1 runs only a short set
# longest first (seconds with 3 parallel jobs, 10.2026, reel spin skipped in tests): parts get them in snake order, so each part ends up with a similar total
UI="v077c font_tour v077d scenarios live_height modes draft58 determinism line_height v076 v076b v078 v074 v080 v073 v081 long_names icon_align spin_shots v077b tro chal v39 v064 fl61 leagueui oneclub72 v060 v077a emoji_layout f5test2 player_page numbers xp_stable v079 fl63 news pitch_layout v075 faq_anim err_report nav_back tg_swipes"
[ -n "$QUICK" ] && UI="draft58 v064 emoji_layout nav_back"
[ -n "$FAST" ] && UI="determinism scenarios $(echo " $ONLY " | sed 's/ sql / /g')"
if [ "$SN" -gt 1 ]; then i=0; U=""; for t in $UI; do r=$((i % (2*SN))); [ $r -ge "$SN" ] && r=$((2*SN-1-r)); [ $((r+1)) = "$SK" ] && U="$U $t"; i=$((i+1)); done; UI=$U; fi
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
if [ "$SK" != 1 ]; then :; elif [ -n "$FAST" ] && [[ " $ONLY " != *" sql "* ]]; then echo "· SQL: FAST без ONLY=sql — пропускаю"; elif ls -d /usr/lib/postgresql/*/bin >/dev/null 2>&1; then step "SQL у Postgres (setup.sh)" bash tools/tests/setup.sh; else echo "· SQL: немає Postgres — пропускаю"; fi
rm -rf "$LOG"
echo
if [ ${#FAIL[@]} -eq 0 ]; then echo "УСІ ПЕРЕВІРКИ: УСЕ ГАРАЗД ($PASS)"; exit 0; fi
echo "ВПАЛО ${#FAIL[@]} з $PASS:"; printf -- '- %s\n' "${FAIL[@]}"; exit 1

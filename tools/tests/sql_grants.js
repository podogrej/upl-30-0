// Every table a SQL file creates must grant the server role explicitly in the same file: from 30.10.2026 Supabase
// no longer grants Data API access to new tables in "public" (sql/v0932_grants.sql covers the files listed in BASE).
// Run from repo root: node tools/tests/sql_grants.js
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..'), DIR = path.join(ROOT, 'sql');
const BASE = new Set(['new_db_part_A.sql', 'v039_part_B.sql', 'v053_writes.sql', 'v055_backups.sql', 'v060_one_player.sql',
  'v061_leagues.sql', 'v063_fives.sql', 'v068_client_errors.sql', 'v0695_feedback.sql', 'v06997_channel_posts.sql', 'v070.sql', 'v080_vyklyk_dnia.sql',
  'v085_player_numbers.sql', 'v0901_anticheat.sql', 'v0903_traffic.sql', 'v0912_channel_cron.sql']);
const fail = []; let n = 0;
for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()) {
  const sql = fs.readFileSync(path.join(DIR, f), 'utf8').replace(/--[^\n]*/g, '');
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi)) {
    n++;
    if (BASE.has(f)) continue;
    const t = m[1], re = new RegExp(`grant\\s[^;]*\\son\\s+(?:table\\s+)?(?:public\\.)?"?${t}"?\\b[^;]*\\bservice_role\\b`, 'i');
    if (!re.test(sql)) fail.push(`${f}: таблиця ${t} без grant … to service_role`);
  }
}
for (const x of fail) console.log('✗', x);
console.log(fail.length ? `sql_grants: ПРОБЛЕМИ ${fail.length}` : `sql_grants: УСЕ ГАРАЗД (${n} таблиць)`);
process.exit(fail.length ? 1 : 0);

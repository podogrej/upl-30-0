// Every table or view a SQL file creates must grant the server role explicitly in the same file: from 30.10.2026 Supabase
// no longer grants Data API access to new tables in "public" (sql/v0932_grants.sql covers the ones in BASE).
// Run from repo root: node tools/tests/sql_grants.js
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..'), DIR = path.join(ROOT, 'sql');
// tables and views that existed before the rule (granted by sql/v0932_grants.sql)
const BASE = new Set(('app_marks app_secrets challenge_results challenge_results_pub challenges challenges_pub channel_posts client_errors daily_results '
  + 'f5_picks f5_players f5_rooms feedback fl_entries fl_fives fl_leagues fl_members league_boards league_members league_results leagues merge_log '
  + 'merge_offers name_reserved player_contacts player_links players rate_hits season_offers season_seeds seasons seasons_pub stats_cache tg_logins '
  + 'tg_notify traffic_events traffic_funnel trophies user_state vd_results').split(' '));
const fail = []; let n = 0;
for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()) {
  const sql = fs.readFileSync(path.join(DIR, f), 'utf8').replace(/--[^\n]*/g, '');
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?(?:unlogged\s+)?(?:table|view|materialized\s+view)\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi)) {
    n++;
    const t = m[1];
    if (BASE.has(t)) continue;
    const re = new RegExp(`grant\\s[^;]*\\son\\s+(?:table\\s+)?(?:public\\.)?"?${t}"?\\b[^;]*\\bservice_role\\b`, 'i');
    if (!re.test(sql)) fail.push(`${f}: ${t} без grant … to service_role`);
  }
}
for (const x of fail) console.log('✗', x);
console.log(fail.length ? `sql_grants: ПРОБЛЕМИ ${fail.length}` : `sql_grants: УСЕ ГАРАЗД (${n} таблиць і представлень)`);
process.exit(fail.length ? 1 : 0);

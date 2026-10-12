// One-off restore of a nightly backup (api/backup.js file YYYY-MM-DD.json.gz) into a TEST database. Nothing is sent anywhere:
// the script only writes SQL files that Claude then runs on the test project (Supabase connector or psql), one file at a time.
//   node tools/backup/restore_to_test.js <backup.json.gz> <out-dir> --confirm-test [--target-url https://<test-ref>.supabase.co] [--with-user-state]
// The target must already have the schema (new_db_part_A.sql + v039_part_B.sql + every later sql/*.sql). Rows are inserted with
// "on conflict do nothing", so a rerun is harmless; restore into an EMPTY test database (otherwise old and restored rows mix).
// Generated columns (seasons.gd) are skipped; identity ids (seasons.id, ...) keep their backed-up values and the sequences are moved
// past them at the end. Triggers and foreign keys are off for the insert (session_replication_role = replica), so order does not matter.
// user_state is skipped by default: its user_id points to auth.users, which a backup does not contain.
// Output: 00_before.sql (counts in the target), NN_<table>_<part>.sql (rows), 98_sequences.sql, 99_after.sql (counts to compare with expected.txt).
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const args = process.argv.slice(2), flag = n => args.includes(n), val = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i && ['--target-url'].includes(args[i - 1])));
const [file, outDir] = pos;
if (!file || !outDir || !flag('--confirm-test')) {
  console.error('usage: node tools/backup/restore_to_test.js <backup.json.gz> <out-dir> --confirm-test [--target-url https://<test-ref>.supabase.co] [--with-user-state]');
  process.exit(2);
}
const dump = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
const target = val('--target-url');
if (target && dump.source && target.replace(/\/+$/, '') === String(dump.source).replace(/\/+$/, '')) { console.error(`refusing: target equals the backup source ${dump.source}`); process.exit(3); }
// parents first (order does not matter with replica role, but a partial run then still makes sense)
const ORDER = ['players', 'player_links', 'app_marks', 'seasons', 'daily_results', 'trophies', 'challenges', 'challenge_results', 'leagues', 'league_members',
  'league_results', 'league_boards', 'season_seeds', 'f5_rooms', 'f5_players', 'f5_picks', 'player_contacts', 'merge_offers', 'merge_log', 'name_reserved',
  'feedback', 'channel_posts', 'tg_notify', 'vd_results', 'season_offers', 'fl_leagues', 'fl_members', 'fl_entries', 'fl_fives', 'user_state'];
const names = Object.keys(dump.tables), unknown = names.filter(t => !ORDER.includes(t));
const todo = [...ORDER, ...unknown].filter(t => dump.tables[t] && (t !== 'user_state' || flag('--with-user-state')));
const MAX_ROWS = 500, MAX_BYTES = 1.5e6, TAG = '$bk_json$';
fs.mkdirSync(outDir, { recursive: true });
const w = (f, s) => fs.writeFileSync(path.join(outDir, f), s);
const ident = s => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error('odd identifier ' + s); return s; };
const expected = [];

function chunks(rows) {
  const out = []; let cur = [], bytes = 0;
  for (const r of rows) {
    const s = JSON.stringify(r);
    if (s.includes(TAG)) throw new Error('row contains the quoting tag');
    if (cur.length && (cur.length >= MAX_ROWS || bytes + s.length > MAX_BYTES)) { out.push(cur); cur = []; bytes = 0; }
    cur.push(r); bytes += s.length;
  }
  if (cur.length) out.push(cur);
  return out;
}
const countSql = ts => ts.map(t => `select '${ident(t)}' as tbl, count(*) as n from public.${ident(t)}`).join('\nunion all\n') + '\norder by 1;\n';
w('00_before.sql', '-- rows already in the target (should be 0 everywhere except tables seeded by the schema files)\n' + countSql(todo));
let step = 1;
for (const t of todo) {
  const rows = dump.tables[t];
  if (!rows.length) { expected.push(`${t}\t0`); continue; }
  expected.push(`${t}\t${rows.length}`);
  chunks(rows).forEach((part, i) => {
    const keys = [...new Set(part.flatMap(r => Object.keys(r)))].map(ident);
    w(`${String(step).padStart(2, '0')}_${t}_${i + 1}.sql`,
`-- ${t}: ${part.length} rows (part ${i + 1}); safe to rerun
do $bk$
declare cols text;
begin
  set local session_replication_role = replica;
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = '${t}' and is_generated = 'NEVER' and column_name = any (array[${keys.map(k => `'${k}'`).join(', ')}]);
  if cols is null then raise exception 'no matching columns in ${t}'; end if;
  execute format('insert into public.%I (%s) overriding system value select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict do nothing', '${t}', cols, cols, '${t}')
    using ${TAG}${JSON.stringify(part)}${TAG}::jsonb;
end $bk$;
`);
  });
  step++;
}
w('98_sequences.sql', `-- identity sequences move past the restored ids
do $bk$
declare c record;
begin
  for c in select table_name, column_name from information_schema.columns
            where table_schema = 'public' and is_identity = 'YES' and table_name = any (array[${todo.map(t => `'${t}'`).join(', ')}]) loop
    execute format('select setval(pg_get_serial_sequence(%L, %L), coalesce((select max(%I) from public.%I), 0) + 1, false)', 'public.' || c.table_name, c.column_name, c.column_name, c.table_name);
  end loop;
end $bk$;
`);
w('99_after.sql', '-- compare with expected.txt (season_seeds holds the last 30 days only; a table that was missing in the source is 0)\n' + countSql(todo));
w('expected.txt', `backup made ${dump.made} from ${dump.source}, day ${dump.day}\n` + expected.join('\n') + '\n');
console.log(`written to ${outDir}: ${fs.readdirSync(outDir).length} files; source ${dump.source}; tables ${todo.length}; rows ${expected.reduce((a, l) => a + +l.split('\t')[1], 0)}`);

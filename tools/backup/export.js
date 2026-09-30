// Резервна копія публічних таблиць основної бази (лише читання, публічний ключ — той самий, що на сайті).
// Запуск з кореня: node tools/backup/export.js [prod|test] > backup.json
// Не входить: player_links, user_state, season_seeds, tg_logins, auth.users — їх читає лише сервер (див. BACKLOG «Бекап»).
const ENVS = {
  prod: { url: 'https://qruhcbwycrnfgzzdbljr.supabase.co', key: 'sb_publishable_pEszTOPsCHLgpiPpwB4JKg_SS-X07hY' },
  test: { url: 'https://joahjmpupilukdbmbdfl.supabase.co', key: 'sb_publishable_OqaI_M6vP6S6D9fxzfwFcQ_TcQx8Rkz' },
};
const TABLES = ['players', 'seasons', 'daily_results', 'trophies', 'challenges', 'challenge_results', 'leagues', 'league_results', 'f5_rooms', 'f5_players', 'f5_picks'];
const PAGE = 1000;
(async () => {
  const env = ENVS[process.argv[2] || 'prod'];
  if (!env) throw new Error('env: prod | test');
  const out = { made: new Date().toISOString(), source: env.url, tables: {} };
  for (const t of TABLES) {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const r = await fetch(`${env.url}/rest/v1/${t}?select=*`, { headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, Range: `${from}-${from + PAGE - 1}` } });
      if (!r.ok) throw new Error(`${t}: ${r.status} ${(await r.text()).slice(0, 120)}`);
      const part = await r.json();
      rows.push(...part);
      if (part.length < PAGE) break;
    }
    out.tables[t] = rows;
  }
  out.counts = Object.fromEntries(Object.entries(out.tables).map(([k, v]) => [k, v.length]));
  process.stdout.write(JSON.stringify(out));
  console.error('ok', JSON.stringify(out.counts));
})().catch(e => { console.error(e.message); process.exit(1); });

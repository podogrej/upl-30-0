// v0.39 end-to-end: справжній Postgres + PostgREST (як Supabase), сайт у браузері, /api/seed і /api/verify у node.
// node v39.js new   → база з players.sql (PostgREST :3001)
// node v39.js old   → база без players.sql (PostgREST :3000) — нова версія сайту до запуску SQL
const http = require('http'), crypto = require('crypto');
const { chromium } = require('playwright');
const MODE = process.argv[2] || 'new';
const UP = MODE === 'new' ? 3001 : 3000, PROXY = MODE === 'new' ? 3101 : 3100;
const SECRET = 'local-test-secret-local-test-secret-0123456789';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = p => { const h = b64({ alg: 'HS256', typ: 'JWT' }), b = b64(p); return `${h}.${b}.${crypto.createHmac('sha256', SECRET).update(h + '.' + b).digest('base64url')}`; };
const SVC = jwt({ role: 'service_role', exp: Math.floor(Date.now() / 1000) + 3600 });
// проксі як у Supabase: /rest/v1/… → PostgREST, параметр apikey прибираємо, не-JWT Authorization відкидаємо
const proxy = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); u.searchParams.delete('apikey');
  const path = u.pathname.replace(/^\/rest\/v1/, '') + (u.search || '');
  const headers = { ...req.headers }; delete headers.host; delete headers.apikey;
  if (headers.authorization && headers.authorization.split('.').length !== 3) delete headers.authorization;
  const up = http.request({ host: 'localhost', port: UP, path, method: req.method, headers }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  req.pipe(up);
});
process.env.SUPABASE_URL = `http://localhost:${PROXY}`; process.env.SUPABASE_SERVICE_KEY = SVC;
const seedH = require('/home/claude/upl-dataset/game/site/api/seed.js'), verH = require('/home/claude/upl-dataset/game/site/api/verify.js');
const call = (h, body) => new Promise(res => { h({ method: 'POST', body }, { status(c) { this.c = c; return this; }, json(j) { res({ c: this.c, j }); } }); });
const rest = async (q) => (await fetch(`http://localhost:${UP}/${q}`)).json();
async function draft(pg) { for (let i = 0; i < 11; i++) { await pg.click('#spinBtn'); await pg.waitForTimeout(1750); const btn = await pg.$('.pl:not([disabled])'); await btn.click(); await pg.waitForTimeout(80); const pk = await pg.$('#pitch .slot.target'); if (pk) { await pk.click(); await pg.waitForTimeout(60); } } }
(async () => {
  await new Promise(r => proxy.listen(PROXY, r));
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const pg = await (await b.newContext({ viewport: { width: 430, height: 900 } })).newPage();
  let errs = 0; pg.on('pageerror', e => { errs++; console.log('PAGEERROR', e.message); });
  pg.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') console.log('console.' + m.type(), m.text().slice(0, 160)); });
  await pg.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: 'window.supabase={createClient(){return {auth:{onAuthStateChange(){},async getSession(){return {data:{session:null}}}}}}};' }));
  await pg.route('**/api/seed', async r => { const x = await call(seedH, JSON.parse(r.request().postData())); r.fulfill({ status: x.c, contentType: 'application/json', body: JSON.stringify(x.j) }); });
  await pg.route('**/api/verify', async r => { const x = await call(verH, JSON.parse(r.request().postData())); r.fulfill({ status: x.c, contentType: 'application/json', body: JSON.stringify(x.j) }); });
  await pg.route('https://qruhcbwycrnfgzzdbljr.supabase.co/**', async r => {
    const req = r.request(); const u = new URL(req.url());
    const resp = await fetch(`http://localhost:${PROXY}${u.pathname}${u.search}`, { method: req.method(), headers: req.headers(), body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postData() });
    r.fulfill({ status: resp.status, headers: Object.fromEntries(resp.headers), body: Buffer.from(await resp.arrayBuffer()) });
  });
  await pg.goto('http://localhost:8765/preview.html'); await pg.waitForTimeout(1500);
  const player = await pg.evaluate(() => JSON.parse(localStorage.getItem('upl30_player') || 'null'));
  console.log('player after load:', JSON.stringify(player));
  if (MODE === 'new') {
    await pg.click('#acctBtn'); await pg.waitForTimeout(200);
    console.log('name box placeholder:', await pg.$eval('#pName', e => e.placeholder), '| msg:', await pg.textContent('#pNameMsg'));
    await pg.screenshot({path:'v39_acct.png'}); await pg.fill('#pName', 'Андрій'); await pg.click('#pNameSave'); await pg.waitForTimeout(600);
    console.log('after save msg:', await pg.textContent('#pNameMsg'), '| db:', JSON.stringify(await rest(`players?id=eq.${player.id}&select=name,anon_name`)));
    await pg.click('#viewClose');
  }
  // вільна гра, «Складний»
  await pg.evaluate(() => document.getElementById('freeOpen').click());
  await pg.screenshot({path:'v39_free_'+MODE+'.png',fullPage:true}); console.log('free-play name row visible:', !(await pg.$eval('#myNameRow', e => e.hidden)), '| value:', await pg.$eval('#myName', e => e.value));
  await pg.click('#modes .opt:nth-child(2)'); await pg.click('#startBtn'); await draft(pg);
  await pg.click('#lockBtn'); await pg.waitForSelector('#simBtn:not([hidden])'); await pg.click('#simBtn'); await pg.waitForTimeout(700); await pg.click('#skipBtn').catch(() => {}); await pg.waitForTimeout(1500);
  console.log('verified line:', await pg.$eval('#verLine', e => e.hidden ? '(hidden)' : e.textContent));
  const last = (await rest('seasons?select=*&order=id.desc&limit=1'))[0];
  console.log('db row:', JSON.stringify({ mode: last.mode, nickname: last.nickname, player_ok: MODE === 'new' ? last.player_id === player.id : 'n/a', competition: last.competition, data_version: last.data_version, verified: last.verified, gd: last.gd }));
  // таблиця
  await pg.click('#homeBtn'); await pg.waitForTimeout(200); await pg.screenshot({path:'v39_home.png',fullPage:true}); await pg.click('#boardOpen'); await pg.waitForTimeout(800);
  const rows = await pg.$$eval('#boardBody tr', trs => trs.slice(1).map(t => (t.className === 'me' ? '* ' : '  ') + t.innerText.replace(/\s+/g, ' ').trim()));
  console.log('board main:\n  ' + rows.join('\n  ')); await pg.screenshot({path:'v39_board_'+MODE+'.png'});
  await pg.click('[data-board="anti"]'); await pg.waitForTimeout(500); console.log('board anti:', (await pg.textContent('#boardBody')).slice(0, 80));
  await pg.click('[data-board="main"]'); await pg.waitForTimeout(500);
  await pg.click('#boardBody tr.me'); await pg.waitForTimeout(600);
  console.log('view:', (await pg.textContent('#viewBody .hero .muted')).slice(0, 80), '| back btn:', !!(await pg.$('#viewBack')));
  await pg.click('#viewBack'); await pg.waitForTimeout(600); console.log('back to board rows:', (await pg.$$('#boardBody tr')).length - 1);
  await pg.click('#viewClose');
  if (MODE === 'new') {
    await pg.evaluate(() => document.getElementById('freeOpen').click());
    await pg.fill('#myName', 'Andriy 2'); await pg.dispatchEvent('#myName', 'change'); await pg.waitForTimeout(700);
    await pg.click('#homeBtn'); await pg.click('#boardOpen'); await pg.waitForTimeout(800);
    console.log('after rename, my rows:', await pg.$$eval('#boardBody tr.me td:nth-child(2)', t => t.map(x => x.innerText.split('\n')[0])));
    await pg.click('#viewClose'); await pg.click('#acctBtn'); await pg.fill('#pName', ''); await pg.click('#pNameSave'); await pg.waitForTimeout(600);
    console.log('cleared name msg:', await pg.textContent('#pNameMsg'));
    await pg.click('#viewClose'); await pg.click('#boardOpen'); await pg.waitForTimeout(800);
    console.log('after clear, my rows:', await pg.$$eval('#boardBody tr.me td:nth-child(2)', t => t.map(x => x.innerText.split('\n')[0])));
    // інший пристрій з тим самим device_id, але без секрету, не може перейменувати
    const r = await fetch(`http://localhost:${PROXY}/rest/v1/rpc/set_player_name`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_device: await pg.evaluate(() => JSON.parse(localStorage.getItem('upl30_device'))), p_secret: 'attacker-attacker-attacker', p_name: 'Hacked' }) });
    console.log('attacker rename status:', r.status);
  }
  console.log('errors', errs); await b.close(); proxy.close(); process.exit(0);
})();

// 30-0 UPL: result link with messenger preview: /r/<season id> (vercel.json -> /api/r?id=<id>)
// Serves a tiny page with og:title / og:description / og:image (Telegram, WhatsApp, Viber render a card) and redirects to the site by script only
// (no meta refresh: link-preview bots follow it and would take the home page preview instead of the season),
// which opens that squad (?s=<id>). Reads only public season fields (seasons_pub) with the publishable key, like the site. Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (test).
const { SB_URL, plUk } = require('./_lib.js');
const { VD_MEDALS, vdNumber } = require('../lib/vd_core.js');
const SB_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_pEszTOPsCHLgpiPpwB4JKg_SS-X07hY').trim();   // publishable key, same as on the site
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// only visible formats are named in a preview; hidden ones (derby, one club, legends league) show the neutral name
const FMT = { classic: 'Класика', anti: 'Антисезон' };
const NEUTRAL = '30-0 УПЛ';
const tag = v => String(v == null ? '' : v).toLowerCase().trim().slice(0, 64).replace(/[^a-z0-9_.:-]/g, '');
const UTM = ['utm_source', 'utm_medium', 'utm_campaign'];
// utm_* of the incoming request, carried to the site (values filtered; the target host is never taken from the request)
const utmQuery = q => UTM.map(k => [k, tag(q && (Array.isArray(q[k]) ? q[k][0] : q[k]))]).filter(x => x[1]).map(([k, v]) => `&${k}=${v}`).join('');

// seasons_pub: public view without personal columns (sql/v087_data_protection.sql)
async function season(id) {
  const base = 'id,w,d,l,pts,place,gf,ga,format,mode,verified,players';
  try {
    for (const cols of [base + ',vd_day,vd_score,vd_gate', base]) {   // the vd_* columns may be missing in an older database
      const r = await fetch(`${SB_URL}/rest/v1/seasons_pub?select=${cols}&id=eq.${id}&limit=1`, { headers: { apikey: SB_KEY } });
      if (r.ok) { const j = await r.json(); return j[0] || null; }
      if (r.status !== 400) break;
    }
  } catch (e) { console.error('r', e.message); }
  return null;
}
// share image stored by /api/card (og:true); HEAD with a short timeout
async function ogExists(id) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 1500);
  try { return (await fetch(`${SB_URL}/storage/v1/object/public/cards/og/${id}.jpg`, { method: 'HEAD', signal: ac.signal })).ok; }
  catch (e) { return false; } finally { clearTimeout(t); }
}

function page(site, id, s, extra, og) {
  const go = `${site}?s=${id}${extra || ''}`;
  let title = '30-0 УПЛ — збери 11-ку з історії УПЛ', desc = 'Збери найсильнішу 11-ку в історії УПЛ і пройди сезон без поразок.';
  if (s) {
    const who = (s.players && (s.players.name || s.players.anon_name)) || 'Гравець';
    // only server-verified seasons get result claims in the preview; the rest are marked
    const ok = s.verified === true;
    const head = s.format === 'anti' ? `${s.place} місце в антисезоні` : s.place === 1 && !s.l && !s.d ? '30-0!' : s.place === 1 ? 'Чемпіон України' : `${s.place} місце`;
    const sc = `${s.w}-${s.d}-${s.l}, ${s.pts} ${plUk(s.pts, 'очко', 'очки', 'очок')}`;
    if (ok && s.vd_day) {
      const med = VD_MEDALS.find(m => s.vd_score >= m[0]);
      title = `${who}: Виклик дня №${vdNumber(s.vd_day)} · ${med ? med[3] + ' ' : ''}${s.vd_score} з 11`;
      desc = 'Одна умова на склад з історії УПЛ. Збери свою 11-ку і порівняй результат.';
    } else if (ok) {
      title = `${who}: ${head} · ${sc}`;
      desc = `${FMT[s.format] || NEUTRAL} · голи ${s.gf}:${s.ga}. Збери свою 11-ку з історії УПЛ і спробуй краще.`;
    } else {
      title = `${who}: сезон у 30-0 УПЛ · не перевірено`;
      desc = 'Результат не перевірено сервером. Збери свою 11-ку з історії УПЛ і пройди сезон без поразок.';
    }
  }
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta property="og:type" content="website"><meta property="og:site_name" content="30-0 УПЛ">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
${og ? `<meta property="og:image" content="${esc(og)}"><meta property="og:image:width" content="1080"><meta property="og:image:height" content="1350">` : `<meta property="og:image" content="${esc(site)}og.jpg?v=2"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`}
<meta property="og:url" content="${esc(site)}r/${id}"><meta name="twitter:card" content="summary_large_image">
</head>
<body style="background:#0b1430;color:#ffffff;font-family:system-ui,sans-serif;padding:24px"><p><a style="color:#ff5aa0" href="${esc(go)}">Відкрити результат у 30-0 УПЛ</a></p>
<script>location.replace(${JSON.stringify(go)})</script></body></html>`;
}

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '').replace(/\D/g, '').slice(0, 12);
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'upl30.com.ua').replace(/[^a-z0-9.:-]/gi, '');
  const site = `https://${host}/`;
  const s = id ? await season(id) : null;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const og = s && s.verified === true && await ogExists(id) ? `${SB_URL}/storage/v1/object/public/cards/og/${id}.jpg` : null;
  res.setHeader('Cache-Control', s && !og ? 's-maxage=300, stale-while-revalidate=600' : 's-maxage=86400, stale-while-revalidate=604800');   // image may still be uploading
  res.status(200).send(page(site, id, s, utmQuery(req.query), og));
};
module.exports.page = page;   // for tests

// 30-0 УПЛ — посилання на результат з превʼю для месенджерів (0.63): /r/<id сезону> (vercel.json → /api/r?id=<id>)
// Віддає маленьку сторінку з og:title / og:description / og:image (Telegram, WhatsApp, Viber малюють картку) і одразу веде на сайт,
// де відкривається цей склад (?s=<id>). Читає лише публічні поля сезону публічним ключем — як і сайт. Змінні: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (у тесті).
const SB_URL = (process.env.SUPABASE_URL || 'https://qruhcbwycrnfgzzdbljr.supabase.co').trim();
const SB_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_pEszTOPsCHLgpiPpwB4JKg_SS-X07hY').trim();   // публічний ключ, як на сайті
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const plUk = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
const FMT = { classic: 'Класика', derby: 'Класичне дербі', oneclub: 'Один клуб', anti: 'Антисезон', legends: 'Ліга легенд' };

async function season(id) {
  for (const sel of ['id,w,d,l,pts,place,gf,ga,format,mode,players(name,anon_name)', 'id,w,d,l,pts,place,gf,ga,format,mode']) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/seasons?select=${sel}&id=eq.${id}&limit=1`, { headers: { apikey: SB_KEY } });
      if (r.ok) { const j = await r.json(); return j[0] || null; }
    } catch (e) { /* далі — простіший запит */ }
  }
  return null;
}

function page(site, id, s) {
  const go = `${site}?s=${id}`;
  let title = '30-0 УПЛ — збери 11-ку з історії УПЛ', desc = 'Збери найсильнішу 11-ку в історії УПЛ і пройди сезон без поразок.';
  if (s) {
    const who = (s.players && (s.players.name || s.players.anon_name)) || 'Гравець';
    const head = s.format === 'anti' ? `${s.place} місце в антисезоні` : s.place === 1 && !s.l && !s.d ? '30-0!' : s.place === 1 ? 'Чемпіон України' : `${s.place} місце`;
    title = `${who}: ${head} · ${s.w}-${s.d}-${s.l}, ${s.pts} ${plUk(s.pts, 'очко', 'очки', 'очок')}`;
    desc = `${FMT[s.format] || 'Класика'} · голи ${s.gf}:${s.ga}. Збери свою 11-ку з історії УПЛ і спробуй краще.`;
  }
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta property="og:type" content="website"><meta property="og:site_name" content="30-0 УПЛ">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(site)}og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:url" content="${esc(site)}r/${id}"><meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${esc(go)}"></head>
<body style="background:#0b1430;color:#ffffff;font-family:system-ui,sans-serif;padding:24px"><p><a style="color:#ff5aa0" href="${esc(go)}">Відкрити результат у 30-0 УПЛ</a></p>
<script>location.replace(${JSON.stringify(go)})</script></body></html>`;
}

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '').replace(/\D/g, '').slice(0, 12);
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'upl-30-0.vercel.app').replace(/[^a-z0-9.:-]/gi, '');
  const site = `https://${host}/`;
  const s = id ? await season(id) : null;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  res.status(200).send(page(site, id, s));
};
module.exports.page = page;   // для тесту

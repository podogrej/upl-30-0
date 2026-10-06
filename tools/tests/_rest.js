// Offline PostgREST + Telegram stub for server tests (api/*): several DBs by base URL, filters eq/neq/is/lt/lte/gt/gte/in/like,
// order, limit (at most 1000 rows, like Supabase), offset, on_conflict with ignore-/merge-duplicates, Prefer return=representation.
// Telegram calls are recorded in TG; sendMessage/sendPhoto to a chat in FAIL get {ok:false} with the given error.
function pgStub(bases, { onInsert } = {}) {
  const DBS = Object.fromEntries(bases.map(b => [b, {}]));
  const tbl = (base, t) => (DBS[base][t] = DBS[base][t] || []);
  function match(row, k, v) {
    const i = v.indexOf('.'), op = v.slice(0, i), a = decodeURIComponent(v.slice(i + 1)); const x = row[k];
    if (op === 'eq') return String(x) === a; if (op === 'neq') return String(x) !== a; if (op === 'is') return a === 'null' ? x == null : String(x) === a;
    if (op === 'in') return a.replace(/^\(|\)$/g, '').split(',').includes(String(x));
    if (op === 'like') return new RegExp('^' + a.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(String(x));
    const c = x == null ? null : String(x); if (c == null) return false;
    return op === 'lt' ? c < a : op === 'lte' ? c <= a : op === 'gt' ? c > a : op === 'gte' ? c >= a : true;
  }
  function rest(base, pathq, o) {
    const [t, qs = ''] = pathq.split('?'); const P = [...new URLSearchParams(qs)]; const m = o.method || 'GET', pref = (o.headers || {}).Prefer || '';
    const arg = k => (P.find(([x]) => x === k) || [])[1];
    const filt = P.filter(([k]) => !['select', 'order', 'limit', 'offset', 'on_conflict', 'apikey'].includes(k)); const rows = tbl(base, t); const sel = r => filt.every(([k, v]) => match(r, k, v));
    if (m === 'GET') {
      let out = rows.filter(sel); const ord = arg('order');
      if (ord) { const [c, d] = ord.split(',')[0].split('.'); out = [...out].sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : 1) * (d === 'desc' ? -1 : 1)); }
      const lim = Math.min(1000, +(arg('limit') || 1000)), off = +(arg('offset') || 0); return out.slice(off, off + lim).map(r => ({ ...r }));
    }
    if (m === 'POST') {
      const body = JSON.parse(o.body); const list = Array.isArray(body) ? body : [body]; const oc = arg('on_conflict'); const done = [];
      for (const b of list) {
        const ks = oc ? oc.split(',') : [], old = oc && rows.find(r => ks.every(k => String(r[k]) === String(b[k])));
        if (old) { if (/merge-duplicates/.test(pref)) { Object.assign(old, b); done.push(old); } continue; }
        const r = { ...b }; if (onInsert) onInsert(t, r); if (t === 'app_marks') r.at = r.at || new Date().toISOString(); rows.push(r); done.push(r);
      }
      return /return=representation/.test(pref) ? done.map(r => ({ ...r })) : null;
    }
    if (m === 'PATCH') { const body = JSON.parse(o.body); const hit = rows.filter(sel); for (const r of hit) Object.assign(r, body); return /return=representation/.test(pref) ? hit.map(r => ({ ...r })) : null; }
    if (m === 'DELETE') { DBS[base][t] = rows.filter(r => !sel(r)); return null; }
  }
  const TG = [], FAIL = {};
  const fetch = async (url, o = {}) => {
    const u = String(url); const J = (s, j) => ({ ok: s < 300, status: s, json: async () => j, text: async () => (j == null ? '' : JSON.stringify(j)) });
    if (u.startsWith('https://api.telegram.org/')) {
      const method = u.split('/').pop(), b = JSON.parse(o.body || '{}'); TG.push({ m: method, b });
      if (/^(sendMessage|sendPhoto)$/.test(method) && FAIL[String(b.chat_id)]) return J(200, { ok: false, ...FAIL[String(b.chat_id)] });
      return J(200, { ok: true, result: { message_id: TG.length + 1000 } });
    }
    const base = Object.keys(DBS).find(b => u.startsWith(b + '/rest/v1/')); if (!base) return J(404, { message: '?' + u });
    return J(200, rest(base, u.slice(base.length + 9), o));
  };
  return { DBS, tbl, TG, FAIL, fetch };
}
module.exports = { pgStub };

"""Collect current-season UPL squads (all registered players) from Transfermarkt 'kader' pages.

Usage (from repo root): python3 data/current/collect_squads.py <cache dir> [season, default 2026]
Writes data/current/squads_<season>.csv (club_slug, player_id, tm_id, name).
Pages are cached in <cache dir>; rerun resumes. Club slugs follow data/matches/club_names_map.csv.
Pool id is 'tm:<id>' when the TM id exists in src/pool.json, else empty.
"""
import sys, os, re, csv, json, time, subprocess, html

CACHE = sys.argv[1]
SEASON = int(sys.argv[2]) if len(sys.argv) > 2 else 2026
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
BASE = 'https://www.transfermarkt.com'
os.makedirs(CACHE, exist_ok=True)

def fetch(url, name, minsize=30000):
    p = os.path.join(CACHE, name)
    if os.path.exists(p) and os.path.getsize(p) > minsize:
        return open(p, encoding='utf-8').read()
    for _ in range(5):
        r = subprocess.run(['curl', '-sL', '-m', '40', '-A', UA, url, '-o', p, '-w', '%{http_code}'],
                           capture_output=True, text=True)
        if r.stdout == '200' and os.path.getsize(p) > minsize:
            return open(p, encoding='utf-8').read()
        time.sleep(4)
    print('FAILED', url, file=sys.stderr)
    return ''

nmap = {}
with open(os.path.join(ROOT, 'data/matches/club_names_map.csv'), encoding='utf-8') as f:
    for r in csv.DictReader(f):
        if str(SEASON) >= r['first_tm_season'] and str(SEASON) <= r['last_tm_season']:
            nmap[r['source_name']] = r['slug']

t = fetch('%s/premier-liga/startseite/wettbewerb/UKR1/saison_id/%d' % (BASE, SEASON), 'season_%d.html' % SEASON, 100000)
clubs = {}
for slug, cid, name in re.findall(r'href="/([^"/]+)/startseite/verein/(\d+)/saison_id/%d">([^<]+)<' % SEASON, t):
    clubs[cid] = (slug, html.unescape(name).strip())
print('clubs', len(clubs), flush=True)

pool = json.load(open(os.path.join(ROOT, 'src/pool.json'), encoding='utf-8'))
tm_in_pool = {p[5] for c in pool['clubs'] for p in c['pl'] if p[5].startswith('tm:')}

rows = []
for cid, (cslug, cname) in sorted(clubs.items(), key=lambda x: x[1][1]):
    slug = nmap.get(cname, '')
    if not slug:
        print('NO SLUG for', cname, file=sys.stderr)
    page = fetch('%s/%s/kader/verein/%s/saison_id/%d/plus/1' % (BASE, cslug, cid, SEASON), 'kader_%s_%d.html' % (cid, SEASON), 60000)
    i = page.find('class="items"')
    tb = page[i:page.find('</tbody>', i)]
    seen, n = set(), 0
    for tid, name in re.findall(r'<td class="hauptlink">\s*<a href="/[^"]*/profil/spieler/(\d+)">\s*([^<]*?)\s*</a>', tb):
        if tid in seen:
            continue
        seen.add(tid)
        rows.append((slug, 'tm:' + tid if 'tm:' + tid in tm_in_pool else '', tid, html.unescape(name).strip()))
        n += 1
    print(cname, slug, n, flush=True)
    time.sleep(2)

out = os.path.join(ROOT, 'data/current/squads_%d.csv' % SEASON)
with open(out, 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['club_slug', 'player_id', 'tm_id', 'name'])
    w.writerows(rows)
print('players', len(rows), 'matched', sum(1 for r in rows if r[1]))

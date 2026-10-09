"""Collect current-season UPL appearances per player from Transfermarkt 'leistungsdaten' pages.

Usage (from repo root): python3 data/current/collect_current.py <cache dir> [season, default 2026]
Writes data/current/apps_<season>.csv (club_slug, player_id, tm_id, name, apps); only apps >= 1.
Pages are cached in <cache dir>; rerun resumes. Club slugs follow data/matches/club_names_map.csv.
Pool ids: 'tm:<id>' matched directly; 'w:' ids matched by birth year + transliterated surname.
"""
import sys, os, re, csv, json, time, subprocess, html, unicodedata

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

# TM club display name -> pool slug
nmap = {}
with open(os.path.join(ROOT, 'data/matches/club_names_map.csv'), encoding='utf-8') as f:
    for r in csv.DictReader(f):
        if str(SEASON) >= r['first_tm_season'] and str(SEASON) <= r['last_tm_season']:
            nmap[r['source_name']] = r['slug']

# clubs of the season
t = fetch('%s/premier-liga/startseite/wettbewerb/UKR1/saison_id/%d' % (BASE, SEASON), 'season_%d.html' % SEASON, 100000)
clubs = {}
for slug, cid, name in re.findall(r'href="/([^"/]+)/startseite/verein/(\d+)/saison_id/%d">([^<]+)<' % SEASON, t):
    clubs[cid] = (slug, html.unescape(name).strip())
print('clubs', len(clubs), flush=True)

# pool index
pool = json.load(open(os.path.join(ROOT, 'src/pool.json'), encoding='utf-8'))
tm_in_pool = set()
w_by_year = {}
UK = dict(zip('абвгґдезийклмнопрстуфхіїцчшщ', 'a b v h g d e z y i k l m n o p r s t u f kh i i ts ch sh shch'.split()))
UK.update({'є': 'ie', 'ж': 'zh', 'ю': 'iu', 'я': 'ia', 'ь': '', "'": '', '’': '', 'ы': 'y', 'э': 'e', 'ё': 'e', 'ъ': ''})
def translit(s):
    return ''.join(UK.get(c, c) for c in s.lower())
def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z]', '', s)
def skel(s):
    # consonant skeleton to absorb transliteration differences
    return re.sub(r'[aeiouyjh]', '', norm(s))
for c in pool['clubs']:
    for p in c['pl']:
        pid = p[5]
        if pid.startswith('tm:'):
            tm_in_pool.add(pid)
        else:
            parts = p[0].split()
            w_by_year.setdefault(p[11], {})[pid] = skel(translit(parts[-1]))

rows, unmatched_w = [], 0
for cid, (cslug, cname) in sorted(clubs.items(), key=lambda x: x[1][1]):
    slug = nmap.get(cname, '')
    if not slug:
        print('NO SLUG for', cname, file=sys.stderr)
    url = '%s/%s/leistungsdaten/verein/%s/reldata/UKR1%%26%d/plus/1' % (BASE, cslug, cid, SEASON)
    page = fetch(url, 'club_%s_%d.html' % (cid, SEASON))
    i = page.find('class="items"')
    tb = page[i:page.find('</table>\n', i)]
    n = 0
    for r in re.split(r'<tr class="(?:odd|even)">', tb)[1:]:
        m = re.search(r'href="/[^"]*/profil/spieler/(\d+)">([^<]*)</a></span></div><div', r)
        if not m or '</table></td>' not in r:
            continue
        cells = re.findall(r'<td[^>]*>(.*?)</td>', r.split('</table></td>', 1)[1], re.S)
        # cells: age, nationality, in squad, appearances
        a = re.sub(r'<.*?>', '', cells[3]).strip() if len(cells) > 3 else ''
        apps = int(a) if a.isdigit() else 0
        if apps < 1:
            continue
        tid, name = m.group(1), html.unescape(m.group(2)).strip()
        age = re.sub(r'<.*?>', '', cells[0]).strip()
        pid = 'tm:' + tid if 'tm:' + tid in tm_in_pool else ''
        if not pid and age.isdigit():
            sk = skel(name.split()[-1])
            hits = [k for y in (SEASON - int(age) - 1, SEASON - int(age)) for k, v in w_by_year.get(y, {}).items() if v == sk]
            if len(hits) == 1:
                pid = hits[0]
        rows.append((slug, pid, tid, name, apps))
        n += 1
    print(cname, slug, n, flush=True)
    time.sleep(2)

out = os.path.join(ROOT, 'data/current/apps_%d.csv' % SEASON)
with open(out, 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['club_slug', 'player_id', 'tm_id', 'name', 'apps'])
    w.writerows(rows)
print('players', len(rows), 'matched', sum(1 for r in rows if r[1]))

"""Collect Ukrainian top-flight matches from Transfermarkt 'gesamtspielplan' pages.

Usage (from repo root): python3 data/matches/collect_tm.py <cache dir>
Writes data/matches/raw_tm.csv (tm_season, round, date, home, away, hg, ag, status).
Pages are cached in <cache dir>; rerun resumes. Dates are carried forward when a row has none.
"""
import sys, os, re, csv, time, subprocess, html

CACHE = sys.argv[1]
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
URL = 'https://www.transfermarkt.com/premier-liga/gesamtspielplan/wettbewerb/UKR1/saison_id/%d'
os.makedirs(CACHE, exist_ok=True)

def fetch(season):
    p = os.path.join(CACHE, 'tm_%d.html' % season)
    if os.path.exists(p) and os.path.getsize(p) > 50000:
        return open(p, encoding='utf-8').read()
    for _ in range(4):
        r = subprocess.run(['curl', '-sL', '-m', '40', '-A', UA, URL % season, '-o', p, '-w', '%{http_code}'],
                           capture_output=True, text=True)
        if r.stdout == '200' and os.path.getsize(p) > 50000:
            return open(p, encoding='utf-8').read()
        time.sleep(3)
    return ''

ROW = re.compile(r'<tr>(.*?)</tr>', re.S)
def parse(t, season):
    out = []
    for blk in re.split(r'<div class="content-box-headline">', t)[1:]:
        head = re.sub(r'<.*?>', '', blk.split('</div>')[0]).strip()
        m = re.match(r'(\d+)\.Matchday', head)
        rnd = int(m.group(1)) if m else head
        date = ''
        for row in ROW.findall(blk.split('</table>')[0]):
            if 'spielbericht' not in row:
                continue
            d = re.search(r'datum/(\d{4}-\d\d-\d\d)', row)
            if d:
                date = d.group(1)
            teams = re.findall(r'<a title="([^"]*)" href="/[^"]*spielplan/verein', row)
            sc = re.search(r'class="zentriert hauptlink">&nbsp;<a[^>]*>([^<]*)<', row)
            tm = re.search(r'zentriert hide-for-small">\s*(\d+:\d\d [AP]M)', row)
            score = html.unescape(sc.group(1)).strip() if sc else ''
            s = re.match(r'(\d+):(\d+)', score)
            hg, ag = (s.group(1), s.group(2)) if s else ('', '')
            if len(teams) < 2:
                continue
            out.append((season, rnd, date, html.unescape(teams[0]), html.unescape(teams[-1]), hg, ag, 'played' if s else (score or 'unknown'), tm.group(1) if tm else ''))
    return out

rows = []
for season in range(1991, 2027):
    t = fetch(season)
    r = parse(t, season) if t else []
    print(season, len(r), flush=True)
    rows += r
    time.sleep(1.5)
with open(os.path.join(os.path.dirname(__file__), 'raw_tm.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['tm_season', 'round', 'date', 'home', 'away', 'hg', 'ag', 'status', 'time'])
    w.writerows(rows)

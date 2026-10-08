"""Cross-check TM-derived club-season totals (GF, GA) against uk.wikipedia standings tables.

Usage (from repo root): python3 data/matches/check_wiki.py <dir with w_<year>.html> [nodiff]
Prints, per season, clubs whose GF/GA differ from the Wikipedia table (matched to slugs by name words),
and, when exactly one match of the opponent explains the difference, that match (candidate technical result).
"""
import re, sys, csv, html, collections, os, json

W = sys.argv[1]
D = os.path.dirname(os.path.abspath(__file__))
names = json.load(open(os.path.join(W, 'poolnames.json')))
matches = [r for r in csv.DictReader(open(os.path.join(D, 'upl_matches.csv'), encoding='utf-8')) if r['season'] != '1992']
agg = collections.defaultdict(lambda: collections.defaultdict(lambda: [0, 0, 0]))
for r in matches:
    if r['home_goals'] == '':
        continue
    y = r['season'][:4]
    for t, a, b in ((r['home_slug'], r['home_goals'], r['away_goals']), (r['away_slug'], r['away_goals'], r['home_goals'])):
        x = agg[y][t]; x[0] += 1; x[1] += int(a); x[2] += int(b)

ALIAS = [('металург д', 'металург донецьк'), ('металург з', 'металург запоріжжя'), ('металург м', 'металург маріуполь'),
         ('зірка-нібас', 'зірка кропивницький'), ('зірка кіровоград', 'зірка кропивницький'),
         ('ворскла-нафтогаз', 'ворскла полтава'), ('поліграфтехніка', 'олександрія'),
         ('іллічівець', 'металург маріуполь'), ('говерла', 'закарпаття ужгород')]

def words(s):
    s = s.lower().replace('\xa0', ' ').replace('«', '').replace('»', '')
    s = re.sub(r"^\d+\.\s*", '', s.replace('’', "'").replace('ʼ', "'"))
    for a, b in ALIAS:
        if s.startswith(a) or ' ' + a in s:
            s = b; break
    return set(w for w in re.findall(r"[а-яіїєґ0-9']+", s) if w not in ('фк', 'пфк', 'ск', 'нк'))

def wiki(y):
    t = open(os.path.join(W, 'w_%s.html' % y), encoding='utf-8').read()
    t = re.sub(r"data-mw='[^']*'", '', t)
    for m in re.finditer(r'<table class="wikitable".*?</table>', t, re.S):
        rows = re.findall(r'<tr.*?</tr>', m.group(0), re.S)
        cells = [[html.unescape(re.sub(r'<[^>]+>', '', c)).strip() for c in re.findall(r'<t[dh].*?</t[dh]>', r, re.S)] for r in rows]
        if not cells or 'Команда' not in ' '.join(cells[0]) or 'О' not in cells[0]:
            continue
        res = []
        for c in cells[1:]:
            i = next((k for k, x in enumerate(c) if re.search(r'[А-Яа-яІіЇї]', x)), None)
            if i is None:
                continue
            rest = [x for x in c[i + 1:] if x != '']
            nums = [x for x in rest if re.fullmatch(r'\d+', x)]
            g = next((x for x in rest if re.fullmatch(r'\d+\s*[-−–:]\s*\d+', x)), None)
            if g:
                gf, ga = re.split(r'\s*[-−–:]\s*', g)
            elif len(nums) >= 6:
                gf, ga = nums[4], nums[5]
            else:
                continue
            res.append((c[i], int(nums[0]), int(gf), int(ga)))
        return res
    return []

def find_slug(wname, y):
    ww = words(wname); best = []
    for s in agg[y]:
        pw = words(names.get(s, s).replace('Маріуполь / Іллічівець', 'Металург Маріуполь').replace('Говерла / Закарпаття (Ужгород)', 'Закарпаття Ужгород'))
        if pw and (pw <= ww or ww <= pw):
            best.append((len(pw & ww) + (10 if pw == ww else 0), s))
    best.sort(reverse=True)
    if not best:
        return None
    if len(best) > 1 and best[0][0] == best[1][0]:
        return None
    return best[0][1]

flagged = []
for y in sorted(agg):
    if y == '2026':
        continue
    wt = wiki(y)
    if not wt:
        print(y, 'NO WIKI TABLE'); continue
    bad = []; unres = []; diff = {}
    for name, g, gf, ga in wt:
        s = find_slug(name, y)
        if not s:
            unres.append(name); continue
        v = agg[y][s]
        if (v[1], v[2]) != (gf, ga):
            bad.append((s, (v[1] - gf, v[2] - ga), v[0], g)); diff[s] = (v[1] - gf, v[2] - ga)
    print(y, 'OK' if not bad and not unres else '', 'rows=%d' % len(wt), 'unmatched=%s' % unres if unres else '')
    for s, d, gt, gw in bad:
        print('   ', s, 'TM-minus-wiki GF/GA', d, 'games TM/wiki', gt, gw)

    # locate matches that explain a pair of diffs exactly (result counted by TM, not in the Wikipedia table)
    if y in ('2013', '2016'):
        continue
    for r in matches:
        if r['season'][:4] != y or r['home_goals'] == '':
            continue
        h, a = r['home_slug'], r['away_slug']; hg, ag = int(r['home_goals']), int(r['away_goals'])
        if diff.get(h) and diff.get(a) and diff[h] == (hg, ag) and diff[a] == (ag, hg):
            flagged.append((r['season'], r['date'], h, a, hg, ag, 'pair of club diffs vs Wikipedia table equals this score'))
        elif y == '2015' and 'metalurh-zaporizhzhia' in (h, a) and (hg, ag) in ((3, 0), (0, 3)) and r['date'] > '2016-02-20':
            flagged.append((r['season'], r['date'], h, a, hg, ag, 'forfeit after withdrawal'))
with open(os.path.join(D, 'suspect_scores.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f); w.writerow(['season', 'date', 'home_slug', 'away_slug', 'home_goals', 'away_goals', 'reason']); w.writerows(flagged)
print(len(flagged), 'flagged')

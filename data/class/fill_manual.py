"""Player class for people that data/class/collect.py did not find on Transfermarkt.
collect.py accepts a TM profile only if the date of birth matches ours; these people have an inexact date in their id (day/month),
so the profile was found manually by surname and clubs (TM transfer history matches our cards); evidence is in MANUAL.
Only people whose best card is >= 88 are filled; the rest stay at class 0 (proposal.py / ratings/class_v2.py).

Run from repo root:
    python3 data/class/fill_manual.py --fetch   # network: tmapi -> data/class/class_manual.csv (same columns as class.csv)
    python3 data/class/fill_manual.py           # offline: class_manual.csv rows -> class.csv (replacing those people's empty rows)
Idempotent. After a full rerun of collect.py (it overwrites class.csv) run again without --fetch.
Numbers are computed as in collect.py (write()): national team = sum over all senior teams (no U17-U23, Olympic, "B");
European cups = matches played in competition type 10 in /performance-game; top transfer fee (not loan); peak market value.
Awards (Ukrainian Footballer of the Year, Komanda, UPL top scorer, Ballon d'Or, UEFA Team of the Year): these people are absent
from the 1991-2024 lists (same Wikipedia pages as collect.py), so the field is empty.
"""
import csv, json, os, re, subprocess, sys, time

D = os.path.dirname(os.path.abspath(__file__))
CLASS = os.path.join(D, 'class.csv')
OUT = os.path.join(D, 'class_manual.csv')
TMAPI = 'https://tmapi.transfermarkt.technology'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
EURO_TYPE = 10
YOUTH = re.compile(r'\bU-?\d{2}\b|Olympic|\bB\b|Amateur|Futsal|Beach|Military|Universiade|Youth|Students|\bII\b', re.I)

# person_id -> (TM id, evidence that it is the same person)
MANUAL = {
    'w:1980-05-10:chernat': ('3132', 'Florin Cernat, 10.03.1980 (у нас 10.05): Динамо Київ 01.2001–2007 і 2008/09 — як наші картки Динамо 2000–2008'),
    'w:1971-06-22:bukel': ('86568', 'Букель Юрій Олександрович, 30.11.1971: Чорноморець до 1998, Маріуполь 1998, Чорноморець 1999–2000 — як наші картки'),
    'w:1983-07-18:djihani': ('54635', 'Parid Xhihani, 10.07.1983 (у нас 18.07): Зоря Луганськ 07.2008–08.2011 — як наші картки Зорі 2008–2010'),
    'w:1967-01-29:shmatovalenko': ('96524', 'Шматоваленко Сергій Сергійович, 20.01.1967 (у нас 29.01): Динамо Київ 1987–1999 — як наші картки Динамо 1992–1997'),
    'w:1974-09-27:mochuliak': ('128014', 'Мочуляк Олег Леонідович, 24.09.1974 (у нас 27.09): Нива Т, Чорноморець 1999–2000, Таврія 2001 — як наші картки'),
    'w:1965-08-12:tiapushkin': ('155420', 'Тяпушкин Дмитрий Альбертович, 06.11.1964 (у нас 12.08.1965 — з uk-вікі): Нива Т 1991–07.1994 → Спартак Москва — як наші картки Ниви 1992–1993; інших Тяпушкіних на TM немає'),
    'w:1965-10-03:martinkenas': ('187546', 'Valdemaras Martinkenas, 10.03.1965 (у нас 03.10 — день і місяць переставлені): Жальгіріс → Динамо Київ 1991–1994'),
    'w:1968-10-25:chuichenko': ('858005', 'Чуйченко Сергій Олександрович, 25.10.1968: Дніпро 1995, Ворскла 1996–1999, Олександрія 2000–2003, Металіст 2003 — як наші картки'),
}


def curl_json(url):
    time.sleep(1.5)
    r = subprocess.run(['curl', '-sL', '-m', '90', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9', url], capture_output=True, text=True, errors='replace')
    d = json.loads(r.stdout or '{}')
    assert d.get('success'), url
    return d['data']


def clubs(ids, cache):
    need = [i for i in dict.fromkeys(str(x) for x in ids) if i and i not in cache]
    for k in range(0, len(need), 25):
        for c in curl_json(TMAPI + '/clubs?' + '&'.join('ids[]=' + i for i in need[k:k + 25])):
            cache[str(c['id'])] = c.get('name', '')


def fetch():
    base = {r['person_id']: r for r in csv.DictReader(open(CLASS, encoding='utf-8', newline=''))}
    cols = list(next(iter(base.values())).keys())
    rows, names = [], {}
    for pid, (t, why) in MANUAL.items():
        r = dict(base[pid])
        pl = curl_json(f'{TMAPI}/players?ids[]={t}')[0]
        hi = (pl.get('marketValueDetails') or {}).get('highest') or {}
        nat = curl_json(f'{TMAPI}/player/{t}/national-career-history').get('history', [])
        perf = curl_json(f'{TMAPI}/player/{t}/performance-game').get('performance', [])
        trf = ((curl_json(f'{TMAPI}/transfer/history/player/{t}').get('history') or {}).get('terminated', []))
        clubs([h['clubId'] for h in nat] + [x.get(k, {}).get('clubId') for x in trf for k in ('transferSource', 'transferDestination')], names)
        senior = sorted([(names.get(str(h['clubId']), ''), h.get('gamesPlayed') or 0, h.get('goalsScored') or 0) for h in nat
                         if not YOUTH.search(names.get(str(h['clubId']), 'U99'))], key=lambda x: -x[1])
        eu = [g for g in perf if g['gameInformation'].get('competitionTypeId') == EURO_TYPE
              and (g['statistics'].get('generalStatistics') or {}).get('participationState') == 'played']
        best, loan = None, None
        for x in trf:
            det = x.get('details') or {}; v = (det.get('fee') or {}).get('value'); typ = (x.get('typeDetails') or {}).get('type', '')
            if not v: continue
            if 'LOAN' in typ.upper(): loan = max(loan or 0, v)
            elif best is None or v > best[0]:
                best = (v, f"{(det.get('date') or '')[:4]} {names.get(str(x['transferSource']['clubId']))} → {names.get(str(x['transferDestination']['clubId']))}")
        r.update(tm_id=t, tm_name=pl.get('name', ''), dob=(pl.get('lifeDates') or {}).get('dateOfBirth') or '',
                 caps=sum(x[1] for x in senior), intl_goals=sum(x[2] for x in senior), country=senior[0][0] if senior and senior[0][1] else '',
                 ukraine=int(any(x[0] == 'Ukraine' and x[1] for x in senior)), other_senior='; '.join(f'{a} {b}/{c}' for a, b, c in senior[1:] if b),
                 youth_caps=sum(h.get('gamesPlayed') or 0 for h in nat if YOUTH.search(names.get(str(h['clubId']), 'U99'))),
                 euro_apps=len(eu), ucl_apps=sum(1 for g in eu if g['gameInformation'].get('competitionId') == 'CL'),
                 euro_goals=sum((g['statistics'].get('goalStatistics') or {}).get('goalsScoredTotal') or 0 for g in eu), euro_apps_foreign='',
                 peak_mv_eur=hi.get('value') or '', peak_mv_date=hi.get('determined') or '',
                 max_fee_eur=best[0] if best else '', max_fee_move=best[1] if best else '', max_loan_fee_eur=loan or '', awards='',
                 sources=' '.join([f'https://www.transfermarkt.com/-/profil/spieler/{t}', f'{TMAPI}/player/{t}/national-career-history',
                                   f'{TMAPI}/player/{t}/performance-game', f'{TMAPI}/transfer/history/player/{t}']),
                 checked=time.strftime('%Y-%m-%d'), note=f'tm id вручну (0.57): {why}')
        if eu:
            ys = sorted(int(g['gameInformation']['seasonId']) for g in eu)
            r['note'] += f'; єврокубки в базі TM: {ys[0]}–{ys[-1] + 1}'
        rows.append(r)
        print(pid, r['name'], 'caps', r['caps'], 'euro', r['euro_apps'], 'mv', r['peak_mv_eur'], 'fee', r['max_fee_eur'])
    with open(OUT, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(rows)


def merge():
    txt = open(CLASS, encoding='utf-8', newline='').read()
    rows = list(csv.DictReader(open(CLASS, encoding='utf-8', newline='')))
    cols = list(rows[0].keys())
    man = {r['person_id']: r for r in csv.DictReader(open(OUT, encoding='utf-8', newline=''))}
    n = 0
    for i, r in enumerate(rows):
        m = man.get(r['person_id'])
        if m and not r['tm_id']:
            # fresh fields (name, rating, best card) from the pool, the rest from class_manual.csv
            rows[i] = {**m, **{k: r[k] for k in ('name', 'max_rating', 'best_card', 'cards84', 'dk_sh_seasons')}}
            n += 1
    import io
    buf = io.StringIO(); w = csv.DictWriter(buf, fieldnames=cols, lineterminator='\r\n'); w.writeheader(); w.writerows(rows)
    if buf.getvalue() != txt: open(CLASS, 'w', encoding='utf-8', newline='').write(buf.getvalue())
    print('class.csv:', f'додано {n}' if buf.getvalue() != txt else 'без змін')


if __name__ == '__main__':
    fetch() if '--fetch' in sys.argv else merge()

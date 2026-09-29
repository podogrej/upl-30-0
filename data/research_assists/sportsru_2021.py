"""Асисти УПЛ 2021/22 з sports.ru: завантаження, розбір і зіставлення з нашим списком гравців.
Запуск з кореня репозиторію: python3 data/research_assists/sportsru_2021.py [--fetch]
  --fetch  заново скачати сторінки клубів (інакше береться sportsru_2021_clubs.json)
Джерело: https://www.sports.ru/football/club/<slug>/stat/2021-2022/ — лише ліга, 18 турів, повний склад
(польові + воротарі, стовпець «П» — гольові передачі).
Вихід: assists_2021_more.csv (для 14 клубів із players_2021_todo.csv).
"""
import csv, difflib, html, json, os, re, subprocess, sys
D = os.path.dirname(os.path.abspath(__file__))
NAMES = os.path.join(D, '..', 'names', 'names_master.csv')
SL = {'dnipro-1': 'dnipro-1', 'vorskla': 'vorskla-poltava', 'zarya': 'zorya-luhansk', 'shakhtar': 'shakhtar-donetsk',
      'desna': 'desna-chernihiv', 'oleksandria': 'oleksandriya', 'metalist-1925': 'metalist-1925', 'rukh-lviv': 'rukh-lviv',
      'chernomorets-odessa': 'chornomorets-odesa', 'minaj': 'minaj', 'veres': 'veres-rivne', 'kolos-kovalivka': 'kolos-kovalivka',
      'fc-lviv': 'pfk-lviv', 'inhulets': 'inhulets-petrove', 'dynamo-kiev': 'dynamo-kyiv', 'mariupol': 'mariupol'}
URL = 'https://www.sports.ru/football/club/{}/stat/2021-2022/'
# Перевірено вручну: транслітерація або футбольне ім'я відрізняються, але матчі й голи збігаються.
MANUAL_OK = {'Мохаммед Кадірі', 'Ренан', 'Ренан Олівейра', 'Дієго Каріока', 'Олексій Хахльов', 'Шина', 'Раймонд Овусу', 'Жуніор Рейс'}
# Статистика збігається, а ім'я — ні: у нашому пулі, схоже, змішані два гравці (див. assists_2021_more_report.md).
CHECK_NAME = {('Євген Паст', 'desna-chernihiv'), ('Дмитро Махнєв', 'veres-rivne')}


def fetch():
    out = {}
    for slug, club in SL.items():
        s = subprocess.run(['curl', '-sSL', '-m', '30', URL.format(slug)], capture_output=True, text=True, check=True).stdout
        tabs = []
        for t in re.findall(r'<table.*?</table>', s, re.S):
            rows = [[html.unescape(re.sub(r'<[^>]+>', '', x)).strip() for x in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', r, re.S)]
                    for r in re.findall(r'<tr[^>]*>(.*?)</tr>', t, re.S)]
            if rows and rows[0][:2] == ['Номер', 'Игрок']: tabs.append(rows)
        h1 = html.unescape(re.sub(r'<[^>]+>', '', re.findall(r'<h1[^>]*>(.*?)</h1>', s, re.S)[0])).split('\n')[0].strip()
        assert '2021/2022' in h1, h1
        f, g = tabs[0], tabs[1]
        out[club] = {'h1': h1, 'field': [dict(zip(f[0], r)) for r in f[1:] if r[0] != 'Всего'],
                     'gk': [dict(zip(g[0], r)) for r in g[1:] if r[0] != 'Всего']}
    return out


T = str.maketrans({'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'ґ': 'g', 'д': 'd', 'е': 'e', 'є': 'e', 'э': 'e', 'ё': 'e', 'ж': 'zh', 'з': 'z',
                   'и': 'i', 'і': 'i', 'ї': 'i', 'ы': 'i', 'й': 'i', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
                   'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ь': '', 'ъ': '',
                   "'": '', '’': '', 'ю': 'yu', 'я': 'ya'})


def lat(s):
    s = s.lower().translate(T).replace('-', ' ')
    for a, b in [('kh', 'h'), ('y', 'i'), ('j', 'i'), ('ii', 'i'), ('ie', 'e'), ('ts', 'c'), ('x', 'ks')]: s = s.replace(a, b)
    return re.sub(r'[^a-z ]', '', s).strip()


def nsim(a, b):
    aw, bw = a.split(), b.split()
    if not aw or not bw: return 0
    return 0.5 * difflib.SequenceMatcher(None, a, b).ratio() + 0.5 * max(difflib.SequenceMatcher(None, x, y).ratio() for x in aw for y in bw)


def match(our, site, nm):
    """Жадібне зіставлення 1:1 у межах клубу: схожість імені + бонус за однакові матчі й голи."""
    cand = []
    for i, o in enumerate(our):
        m = nm.get(o['pid'], {})
        ks = [lat(x) for x in [o['player'], m.get('name_uk'), m.get('name_ru'), m.get('name_en')] if x]
        for j, s in enumerate(site):
            n = max(nsim(lat(s['Игрок']), k) for k in ks)
            cand.append((n + (0.15 if o['apps'] == s['М'] else 0) + (0.1 if o['goals'] == s.get('Г', '0') else 0), n, i, j))
    cand.sort(reverse=True); ui, uj, pairs = set(), set(), {}
    for sc, n, i, j in cand:
        if i in ui or j in uj: continue
        ui.add(i); uj.add(j); pairs[i] = (n, site[j])
    return pairs


def main():
    js = os.path.join(D, 'sportsru_2021_clubs.json')
    if '--fetch' in sys.argv:
        json.dump(fetch(), open(js, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    C = json.load(open(js, encoding='utf-8'))
    nm = {r['person_id']: r for r in csv.DictReader(open(NAMES, encoding='utf-8'))}
    todo = [dict(zip(['club', 'club_name', 'player', 'pid', 'apps', 'goals'], l.split(';')))
            for l in open(os.path.join(D, 'players_2021_todo.csv'), encoding='utf-8').read().splitlines()[1:]]
    slug_of = {v: k for k, v in SL.items()}
    lines = ['person_id;display_uk;club;apps_site;goals_site;assists;clean_sheets;source_url;match_conf']
    for club in dict.fromkeys(t['club'] for t in todo):
        our = [t for t in todo if t['club'] == club]
        site = C[club]['field'] + C[club]['gk']
        pairs = match(our, site, nm)
        total = 0
        for i, o in enumerate(our):
            url = URL.format(slug_of[club])
            if i not in pairs:
                lines.append(f"{o['pid']};{o['player']};{club};;;0;;{url};not_on_site"); continue
            n, s = pairs[i]
            a = s['П'] if s['П'].isdigit() else '0'; total += int(a)
            conf = ('check_name' if (o['player'], club) in CHECK_NAME else 'high' if n >= 0.85
                    else 'high_manual' if o['player'] in MANUAL_OK else 'CHECK')
            lines.append(f"{o['pid']};{o['player']};{club};{s['М']};{s.get('Г', '0')};{a};;{url};{conf}")
        site_total = sum(int(p['П']) for p in site if p['П'].isdigit())
        print(f"{club}: асистів {total}, на сайті {site_total}", '' if total == site_total else '  ← НЕ СХОДИТЬСЯ')
    open(os.path.join(D, 'assists_2021_more.csv'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')


if __name__ == '__main__':
    main()

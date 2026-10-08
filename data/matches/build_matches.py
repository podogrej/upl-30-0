"""Build upl_matches.csv and club_names_map.csv from raw_tm.csv (see collect_tm.py).

Usage (from repo root): python3 data/matches/build_matches.py
Season label: Transfermarkt season N -> 'N/N+1'; the spring-1992 championship (TM 1991) -> '1992'.
Slugs come from the pool (pool.*.js); clubs absent from the pool get a new slug and are flagged in club_names_map.csv.
"""
import csv, os, collections

D = os.path.dirname(os.path.abspath(__file__))

# TM name -> slug (pool slugs); value may be a function of the TM season
MAP = {
 'Bukovyna Chernivtsi': 'bukovyna-chernivtsi', 'Chornomorets Odesa': 'chornomorets-odesa',
 'Dnipro Dnipropetrovsk': 'dnipro', 'Dnipro Dnipropetrovsk (- 2020)': 'dnipro',
 'Dynamo Kyiv': 'dynamo-kyiv', 'Karpaty Lviv': 'karpaty-lviv', 'Kremin Kremenchuk': 'kremin-kremenchuk',
 'Kryvbas Kryvyi Rig': 'kryvbas', 'Metalist Kharkiv': 'metalist-kharkiv', 'Metalist 1925 Kharkiv': 'metalist-1925',
 'Metalurg Zaporizhya': 'metalurh-zaporizhzhia', 'Nyva Ternopil': 'nyva-ternopil', 'Nyva Vinnytsia': 'nyva-vinnytsia',
 'Shakhtar Donetsk': 'shakhtar-donetsk', 'Tavriya Simferopol': 'tavriya-simferopol',
 'SC Tavriya Simferopol (-2022)': 'tavriya-simferopol', 'Temp Shepetivka': 'temp-shepetivka',
 'Torpedo Zaporizhya': 'torpedo-zaporizhzhia', 'Veres Rivne': 'veres-rivne', 'NK Veres Rivne': 'veres-rivne',
 'Volyn Lutsk': 'volyn-lutsk', 'Zorya-Mals Lugansk': 'zorya-luhansk', 'Zorya Lugansk': 'zorya-luhansk',
 'Evis Mykolaiv': 'mykolaiv', 'SC Mykolaiv': 'mykolaiv',
 'FC Prykarpattya Ivano-Frankivsk': 'prykarpattia',
 'CSKA-Borysfen Kyiv': 'cska-kyiv', 'CSKA Kyiv': 'cska-kyiv',
 'Zirka NIBAS Kirovograd': 'zirka-kropyvnytskyi', 'Zirka Kirovograd': 'zirka-kropyvnytskyi',
 'Zirka Kropyvnytskyi': 'zirka-kropyvnytskyi',
 'Vorskla Poltava': 'vorskla-poltava', 'Vorskla-Naftogaz Poltava': 'vorskla-poltava',
 'Metalurg Donetsk': 'metalurh-donetsk', 'Metalurg Mariupol': 'mariupol', 'Illichivets Mariupol': 'mariupol',
 'FC Mariupol': 'mariupol', 'Stal Alchevsk': 'stal-alchevsk', 'Arsenal Kyiv': 'arsenal-kyiv',
 'Zakarpattya Uzhgorod': 'hoverla-uzhhorod', 'Goverla-Zakarpattya Uzhgorod': 'hoverla-uzhhorod',
 'Goverla Uzhgorod (- 2016)': 'hoverla-uzhhorod', 'Obolon Kyiv': 'obolon-kyiv',
 'Borysfen Boryspil': 'borysfen-boryspil', 'Poligraftekhnika Oleksandriya': 'oleksandriya',
 'FC Oleksandriya': 'oleksandriya', 'PFC Oleksandriya': 'oleksandriya', 'FC Kharkiv': 'fc-kharkiv',
 'Naftovyk-Ukrnafta Okhtyrka': 'naftovyk-okhtyrka', 'Naftovyk Okhtyrka': 'naftovyk-okhtyrka',
 'FC Sevastopol': 'sevastopol', 'Olimpik Donetsk': 'olimpik-donetsk',
 'Stal Dniprodzerzhynsk': 'stal-kamianske', 'PFC Stal Kamyanske (-2018)': 'stal-kamianske',
 'Desna Chernigiv': 'desna-chernihiv', 'SC Dnipro-1': 'dnipro-1', 'Kolos Kovalivka': 'kolos-kovalivka',
 'Ingulets Petrove': 'inhulets-petrove', 'FC Minaj': 'minaj', 'Rukh Lviv': 'rukh-lviv',
 'LNZ Cherkasy': 'lnz-cherkasy', 'Polissya Zhytomyr': 'polissya-zhytomyr', 'Livyi Bereg Kyiv': 'livyi-bereh-kyiv',
 'Epitsentr Kamyanets-Podilskyi': 'epicentr', 'FC Kudrivka': 'kudrivka', 'SC Poltava': 'sc-poltava',
 'SKA Odessa': 'ska-odesa',  # not in pool (spring 1992 only) -> new slug
}
NEW = {'ska-odesa'}
def slug(name, season):
    if name == 'PFC Lviv':
        return 'fc-lviv-2008' if season < 2015 else 'pfk-lviv'
    return MAP[name]

def label(s):
    s = int(s)
    return '1992' if s == 1991 else '%d/%02d' % (s, (s + 1) % 100)

rows = list(csv.DictReader(open(os.path.join(D, 'raw_tm.csv'), encoding='utf-8')))
# manual additions: spring-1992 play-off matches (uk.wikipedia 'Чемпіонат України з футболу 1992')
extra = [('1991', 'final', '1992-06-21', 'Tavriya Simferopol', 'Dynamo Kyiv', '1', '0', 'played', '')]
for e in extra:
    rows.append(dict(zip(['tm_season', 'round', 'date', 'home', 'away', 'hg', 'ag', 'status', 'time'], e)))

out = []; names = collections.OrderedDict()
for r in rows:
    s = int(r['tm_season'])
    h, a = slug(r['home'], s), slug(r['away'], s)
    for n, sl in ((r['home'], h), (r['away'], a)):
        names.setdefault((n, sl), set()).add(s)
    src = 'transfermarkt' if r['status'] != 'played' or r['round'] != 'final' else 'transfermarkt'
    if r['round'] == 'final':
        src = 'wikipedia_uk'
    out.append([label(s), r['round'], r['date'], h, a, r['hg'], r['ag'], src])
out.sort(key=lambda x: (x[2] or '9999', x[0]))
with open(os.path.join(D, 'upl_matches.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['season', 'round', 'date', 'home_slug', 'away_slug', 'home_goals', 'away_goals', 'source'])
    w.writerows(out)
with open(os.path.join(D, 'club_names_map.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['source_name', 'slug', 'in_pool', 'first_tm_season', 'last_tm_season'])
    for (n, sl), ss in sorted(names.items()):
        w.writerow([n, sl, 'no (NEW, flagged)' if sl in NEW else 'yes', min(ss), max(ss)])
print(len(out), 'matches')

"""Pool fixes: cards that stage 3 attached to the wrong person. Idempotent.
Run from repo root: python3 data/fixes/fix_pool_057.py
Then: python3 data/aliases/apply.py && python3 data/ratings/class_v2.py && python3 data/update_meta.py && python3 data/check_pool.py
      && python3 src/build.py && node tools/make_engine.js

Rules (DECISIONS #7): ids never change or disappear, and an id is never given to a different person. A card that stage 3 gave to the
wrong person gets the real person's id; if that person is not in the pool, the Transfermarkt id `tm:<N>` (every found profile has the
same date of birth). The old id stays on the cards of the person it really belongs to. Cards are not reordered or added, so
pool_ratings_raw.json keys ("year|club|index") stay the same and the raw card rating (stage 4, from this row's stats) is unchanged;
the final rating comes from smooth_cameo.final() (cameo smoothing depends on whose card it is).

Evidence that a card is someone else's: the raw row in data/data_v2/ratings_player_seasons.csv (player_name = full name from the
uk-wiki squad) names a different person than the id. Second source: Transfermarkt profile and transfer history (tmapi.transfermarkt.technology).
Several cases are twins with the same date of birth (shared id `w:<date>:<surname>`, so stage 3 merged them):
Mazur, Kapanadze, Babiichuk, Pashaiev, Baranets, Makovskyi. Missing cards of the second twin are not added here (BACKLOG).

Per-person sources (TM = https://www.transfermarkt.com/-/profil/spieler/<N>):
- Mykola Kalishchuk, TM 999526, 1967-11-26 (same date as Anatolii Polishchuk): Veres -> Karpaty 1993-03-14; Polishchuk in 1992/93
  played only for Volyn (14 apps; adding Veres and Karpaty would give 33 apps in 30 rounds). Position DF in the Karpaty squad
  (uk-wiki Karpaty Lviv 1992-93 season).
- Vasyl Mazur, TM 518654, 1970-05-23, SW -> CB (twin of Serhii, TM 999294: Kryvbas -> Zorya 11.1992 -> Kryvbas 1993 -> Sirius 01.1994
  -> Kryvbas 07.1995). Rows Zorya 1992 (30 apps), Kryvbas 1993-1995 (33/34/17 apps) are Vasyl; Kryvbas 1992 (6 apps) is Serhii.
- Vitalii Levchenko, TM 251328, 1972-03-28 (same date as Oleksii Korobchenko, TM 774168), LB, Tajikistan:
  CSKA-Borysfen 1994 -> CSKA 1996 -> Tavriya 01.2001. Korobchenko played only for Zorya 1992-1995; TM position RW, citizenship (raw rows) Ukraine.
- Oleksii Kuznetsov (existing id w:1976-02-23:kuznetsov), TM 969948: Tavriya until 01.1995. The Tavriya 1993/94 card is his, not Viktor's.
- Mykhailo Makovskyi, TM 92633, 1977-04-23, CM, Belarus (twin of Volodymyr, TM 158439: at Vorskla only from 01.2000, 15 apps).
  The Vorskla 1999/2000 card (22 apps, 1 goal) is Mykhailo's row (TM: Dynamo -> Vorskla 07.1999).
- Avtandil Kapanadze, TM 843683, 1962-12-01, SS -> ST, Georgia (twin of Tariel, TM 843175): Temp -> Nyva Ternopil 01.1996.
  Nyva cards 1997/98 and 1998/99 (28 apps 15 goals, 29 apps 10 goals) are Avtandil's rows; the id's other cards are Tariel's.
- Ruslan Suanov, TM 63164, 1975-06-18, SS -> ST, Russia: Metalurh Zaporizhzhia 01.2004 - 01.2005 (card 2003/04, 5 apps).
- Oleksandr Babiichuk, TM 992337, 1973-02-02, CF -> ST (twin of Serhii, TM 986515): Nyva Vinnytsia 01.1997 - 1999 (card 1996/97).
- Maksym Pashaiev, TM 59114, 1988-01-04, LB (twin of Pavlo): Kryvbas (loan) 2007/08, Dnipro from 06.2008 (cards Kryvbas 2007, Dnipro 2008).
  id tm:58961 is Pavlo Pashaiev (TM 58961: Kryvbas 08-12.2008, Dnipro 2009-2012, ...) -> his other cards are only renamed.
- Hryhorii Baranets, TM 82593, 1986-07-22, AM -> CAM (twin of Borys, TM 82592): Karpaty 07.2010 -> Obolon 02.2011 (Karpaty card 2010/11).
Tutychenko: handled separately as an alias in data/aliases/aliases.csv (one person, TM 533750); duplicate's birth year 1971 -> 1970.
"""
import json, os, sys

D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(D, '..', '..')
POOL = os.path.join(ROOT, 'src', 'pool.json')
RAW = os.path.join(ROOT, 'data', 'ratings', 'pool_ratings_raw.json')
sys.path.insert(0, os.path.join(ROOT, 'data', 'ratings'))
import smooth_cameo as SC

# card: [name, line, rating, apps, goals, person_id, main, alts, assists, clean_sheets, nat, birth_year]
UA, TJ, GE, BY, RU = 0, 81, 31, 20, 71   # pool['nats'] indices (asserted below)
KALISCHUK = {0: 'Микола Каліщук', 5: 'tm:999526', 6: 'CB', 7: '', 10: UA, 11: 1967}
V_MAZUR = {0: 'Василь Мазур', 5: 'tm:518654', 6: 'CB', 7: '', 10: UA, 11: 1970}
LEVCHENKO = {0: 'Віталій Левченко', 5: 'tm:251328', 6: 'LB', 7: '', 10: TJ, 11: 1972}
A_KAPANADZE = {0: 'Автанділ Капанадзе', 5: 'tm:843683', 6: 'ST', 7: '', 10: GE, 11: 1962}
M_PASHAEV = {0: 'Максим Пашаєв', 5: 'tm:59114', 6: 'LB', 7: '', 10: UA, 11: 1988}
POLISCHUK = ('Анатолій Поліщук', 'w:1967-11-26:polischuk')
S_MAZUR = ('Сергій Мазур', 'w:1970-05-23:mazur')
KOROBCHENKO = ('Олексій Коробченко', 'w:1972-03-28:korobchenko')
T_KAPANADZE = ('Таріел Капанадзе', 'w:1962-12-01:kapanadze')
P_PASHAEV_OLD = ('Максим Пашаєв', 'tm:58961')

REASSIGN = [   # (year, club, (name, id) before fix, new fields {index: value})
    (1992, 'veres-rivne', POLISCHUK, KALISCHUK),
    (1992, 'karpaty-lviv', POLISCHUK, KALISCHUK),
    (1992, 'zorya-luhansk', S_MAZUR, V_MAZUR),
    (1993, 'kryvbas', S_MAZUR, V_MAZUR),
    (1994, 'kryvbas', S_MAZUR, V_MAZUR),
    (1995, 'kryvbas', S_MAZUR, V_MAZUR),
    *[(y, 'cska-kyiv', KOROBCHENKO, LEVCHENKO) for y in range(1995, 2001)],
    (2000, 'tavriya-simferopol', KOROBCHENKO, LEVCHENKO),
    (1993, 'tavriya-simferopol', ('Віктор Кузнецов', 'w:1975-03-31:kuznetsov'),
     {0: 'Олексій Кузнецов', 5: 'w:1976-02-23:kuznetsov', 6: 'CB', 7: '', 10: UA, 11: 1976}),
    (1999, 'vorskla-poltava', ('Володимир Маковський', 'w:1977-04-23:makovski'),
     {0: 'Михайло Маковський', 5: 'tm:92633', 6: 'CM', 7: '', 10: BY, 11: 1977}),
    (1997, 'nyva-ternopil', T_KAPANADZE, A_KAPANADZE),
    (1998, 'nyva-ternopil', T_KAPANADZE, A_KAPANADZE),
    (2003, 'metalurh-zaporizhzhia', ('Денис Смірнов', 'w:1975-06-18:smirnov'),
     {0: 'Руслан Суанов', 5: 'tm:63164', 6: 'ST', 7: '', 10: RU, 11: 1975}),
    (1996, 'nyva-vinnytsia', ('Сергій Бабійчук', 'w:1973-02-02:babichuk'),
     {0: 'Олександр Бабійчук', 5: 'tm:992337', 6: 'ST', 7: '', 10: UA, 11: 1973}),
    (2007, 'kryvbas', P_PASHAEV_OLD, M_PASHAEV),
    (2008, 'dnipro', P_PASHAEV_OLD, M_PASHAEV),
    (2010, 'karpaty-lviv', ('Борис Баранець', 'w:1986-07-22:baranets'),
     {0: 'Григорій Баранець', 5: 'tm:82593', 6: 'CAM', 7: '', 10: UA, 11: 1986}),
]
# person keeps their id, but these fields were taken from someone else's rows
PERSON = {
    'tm:58961': {0: 'Павло Пашаєв'},                     # TM 58961 = Pavlo Pashayev
    'w:1972-03-28:korobchenko': {6: 'RW', 7: '', 10: UA},  # TM 774168: RW; raw Zorya rows say Ukraine (81 = Tajikistan came from Levchenko)
}
BIRTH_YEAR = {'w:1971-07-10:tutichenko': 1970}   # alias of w:1970-03-05:tutichenko (TM 533750: born 1970-03-05)


def main():
    raw_txt = open(POOL, encoding='utf-8').read()
    pool = json.loads(raw_txt)
    raw = json.load(open(RAW, encoding='utf-8'))
    assert [pool['nats'][i] for i in (UA, TJ, GE, BY, RU)] == ['Україна', 'Таджикистан', 'Грузія', 'Білорусь', 'Росія']
    log, touched = [], set()
    ids = {p[5] for c in pool['clubs'] for p in c['pl']}

    for y, club, before, new in REASSIGN:
        cl = [c for c in pool['clubs'] if c['y'] == y and c['c'] == club]
        assert len(cl) == 1, (y, club)
        cl = cl[0]
        after = (new[0], new[5])
        hit = [i for i, p in enumerate(cl['pl']) if (p[0], p[5]) in (before, after)]
        assert len(hit) == 1, (y, club, before, hit)
        p = cl['pl'][hit[0]]
        if (p[0], p[5]) == before:
            # the new tm id must not belong to anyone else in the pool
            owners = {q[0] for c in pool['clubs'] for q in c['pl'] if q[5] == new[5]}
            assert owners <= {new[0]}, (new[5], owners)
            touched |= {before[1], new[5]}
            for k, v in new.items(): p[k] = v
            log.append(f'{y} {club}: {before[0]} ({before[1]}) → {p[0]} ({p[5]}), {p[6]}')

    for c in pool['clubs']:
        for p in c['pl']:
            for pid, fix in PERSON.items():
                if p[5] == pid and any(p[k] != v for k, v in fix.items()):
                    log.append(f'{c["y"]} {c["c"]}: {p[0]} ({pid}) → ' + ', '.join(f'[{k}]={v}' for k, v in fix.items()))
                    for k, v in fix.items(): p[k] = v
                    touched.add(pid)
            if p[5] in BIRTH_YEAR and p[11] != BIRTH_YEAR[p[5]]:
                log.append(f'{c["y"]} {c["c"]}: {p[0]} ({p[5]}) — рік народження {p[11]} → {BIRTH_YEAR[p[5]]}')
                p[11] = BIRTH_YEAR[p[5]]

    # no old id disappeared
    assert ids <= {p[5] for c in pool['clubs'] for p in c['pl']}

    # rating: re-run cameo smoothing after ownership changes; only touched people's cards may change
    alias = pool.get('alias', {})
    canon = lambda i: alias.get(i, i)
    touched_c = {canon(i) for i in touched}
    fin = SC.final(pool, raw)
    for c in pool['clubs']:
        for i, p in enumerate(c['pl']):
            k = SC.key(c, i)
            if fin[k] == p[2]: continue
            if canon(p[5]) not in touched_c:
                sys.exit(f'рейтинг розходиться з пулом на чужій картці {k} {p[0]}: {p[2]} → {fin[k]} (спершу python3 data/ratings/smooth_cameo.py)')
            log.append(f'{k} {p[0]}: рейтинг {p[2]} → {fin[k]}')
            p[2] = fin[k]

    out = json.dumps(pool, ensure_ascii=False, separators=(',', ':'))
    if out != raw_txt: open(POOL, 'w', encoding='utf-8').write(out)
    print('src/pool.json:', 'змінено' if out != raw_txt else 'без змін')
    for l in log: print('  ' + l)


if __name__ == '__main__':
    main()

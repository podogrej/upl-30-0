"""Invariant checks for src/pool.json (part of the pre-release checklist, see README).
Run from repo root: python3 data/check_pool.py            - exit code 1 if anything is violated
                    python3 data/check_pool.py --write-transfers - append new mid-season transfers to the whitelist
                    (only after verifying them by hand, see data/README.md)
Does not modify the pool.

Hard rules (violation -> exit 1):
- a card has 12 fields of the right types: [name, line GK/DF/MF/FW, rating 45-99, apps, goals, id, main position, alts,
  assists|null, clean_sheets|null, citizenship (index into nats or -1), birth year];
- id format tm:<number> or w:<yyyy-mm-dd>:<latin>; each id once per club-season;
- main position is one of the game's 15 positions; alts use the same codes (with or without a ":0.23" share);
  line GK <=> main GK;
- one person (id) has the same name, birth year and citizenship on all cards;
- every season team (seasons[year].teams) has a club-season, and every club-season is among its season's teams;
- season status is complete / abandoned_18_rounds / live; live only for the latest season;
- foot keys are pool ids, values L/R/B;
- alias: both ids are in the pool, no chains, duplicate and canonical never in the same club-season;
- meta.club_seasons / players / persons / person_ids / aliases equal the real counts (data/update_meta.py);
- one person (canonical id) in two clubs in one season only if that transfer is in data/check_pool_transfers.csv
  (whitelist: season, id, clubs). A new unlisted transfer is an error (catches a card attached to the wrong person).
Warnings (non-fatal): a person's season apps exceed the season's rounds (whitelisted with a note), two different ids
with the same name in one club-season, a club-season with fewer than two goalkeepers, etc. Info: number of 90+ cards.
"""
import csv, json, os, re, sys
from collections import Counter, defaultdict

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
POOL = os.path.join(ROOT, 'src', 'pool.json')
TRANSFERS = os.path.join(ROOT, 'data', 'check_pool_transfers.csv')
POS = {'GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF'}
LINES = {'GK', 'DF', 'MF', 'FW'}
ID_RE = re.compile(r'^(tm:\d+|w:\d{4}-\d{2}-\d{2}:[a-z]+)$')
# live: season in progress (data/current/add_live_season.py), only the latest season
STATUSES = {'complete', 'abandoned_18_rounds', 'live'}
ALT_RE = re.compile(r'^([A-Z]+)(:\d(\.\d+)?)?$')


def main():
    write = '--write-transfers' in sys.argv
    pool = json.load(open(POOL, encoding='utf-8'))
    err, warn = [], []
    E = lambda s: err.append(s)
    nats = pool['nats']
    alias = pool.get('alias', {})
    canon = lambda i: alias.get(i, i)
    isint = lambda x: isinstance(x, int) and not isinstance(x, bool)

    ids, per, few_gk = set(), defaultdict(list), []
    for c in pool['clubs']:
        where = f"{c['y']} {c['c']}"
        cnt = Counter(p[5] if isinstance(p, list) and len(p) > 5 else None for p in c['pl'])
        for k, v in cnt.items():
            if v > 1: E(f'{where}: id {k} двічі в клуб-сезоні')
        names = defaultdict(set)
        for p in c['pl']:
            if not isinstance(p, list) or len(p) != 12:
                E(f'{where}: картка не з 12 полів: {p}'); continue
            nm, line, r, apps, goals, pid, main, alts, ast, cs, nat, by = p
            w = f'{where} {nm} ({pid})'
            if not isinstance(nm, str) or not nm.strip(): E(f'{w}: порожнє ім\'я')
            if line not in LINES: E(f'{w}: лінія «{line}»')
            if not isint(r) or not 45 <= r <= 99: E(f'{w}: рейтинг {r} поза 45–99')
            if not isint(apps) or not 0 <= apps <= 40: E(f'{w}: матчі {apps}')
            if not isint(goals) or goals < 0: E(f'{w}: голи {goals}')
            if not isinstance(pid, str) or not ID_RE.match(pid): E(f'{w}: id формату не tm:/w:')
            if main not in POS: E(f'{w}: основна позиція «{main}»')
            if (line == 'GK') != (main == 'GK'): E(f'{w}: лінія {line}, а основна позиція {main}')
            if not isinstance(alts, str): E(f'{w}: додаткові не рядок')
            else:
                for a in [x for x in alts.split(';') if x]:
                    m = ALT_RE.match(a)
                    if not m or m.group(1) not in POS: E(f'{w}: додаткова позиція «{a}»')
            if ast is not None and (not isint(ast) or ast < 0): E(f'{w}: асисти {ast}')
            if cs is not None and (not isint(cs) or cs < 0): E(f'{w}: сухі {cs}')
            if not isint(nat) or not -1 <= nat < len(nats): E(f'{w}: громадянство {nat}')
            if not isint(by) or not (by == 0 or 1940 <= by <= 2012): E(f'{w}: рік народження {by}')
            ids.add(pid); per[pid].append((c['y'], c['c'], nm, by, nat, apps, r))
            names[nm].add(pid)
        for nm, s in names.items():
            if len(s) > 1: warn.append(f'{where}: «{nm}» — {len(s)} різні id ({", ".join(sorted(s))})')
        if sum(1 for p in c['pl'] if isinstance(p, list) and len(p) > 1 and p[1] == 'GK') < 2: few_gk.append(where)

    if few_gk: warn.append(f'менше двох воротарів у {len(few_gk)} клуб-сезонах (так у джерелах; гра бере воротаря з колеса): {", ".join(few_gk[:3])}…')

    # one person: same name, birth year, citizenship
    for pid, L in per.items():
        for k, i in (('ім\'я', 2), ('рік народження', 3), ('громадянство', 4)):
            vals = {x[i] for x in L}
            if len(vals) > 1: E(f'{pid}: різне {k} на картках: {sorted(map(str, vals))}')

    # seasons <-> club-seasons
    cs_keys = Counter((c['y'], c['c']) for c in pool['clubs'])
    for k, v in cs_keys.items():
        if v > 1: E(f'клуб-сезон {k} двічі')
    teams = {(int(y), t[0]) for y, s in pool['seasons'].items() for t in s.get('teams', [])}
    for y, s in pool['seasons'].items():
        if not s.get('teams'): E(f'сезон {y} без команд')
        if s.get('status') not in STATUSES: E(f'сезон {y}: статус «{s.get("status")}»')
    live = [int(y) for y, s in pool['seasons'].items() if s.get('status') == 'live']
    if live and (len(live) > 1 or live[0] != max(map(int, pool['seasons']))): E(f'живий сезон не один або не останній: {live}')
    for k in sorted(teams - set(cs_keys)): E(f'команда сезону {k} без клуб-сезону')
    for k in sorted(set(cs_keys) - teams): E(f'клуб-сезон {k} не в командах свого сезону')

    # foot
    for k, v in pool.get('foot', {}).items():
        if k not in ids: E(f'foot: {k} немає в пулі')
        if v not in ('L', 'R', 'B'): E(f'foot: {k} = {v}')

    # aliases
    for d, k in alias.items():
        if d not in ids: E(f'alias: дубль {d} немає в пулі')
        if k not in ids: E(f'alias: canonical {k} немає в пулі')
        if k in alias: E(f'alias: ланцюжок {d} → {k} → {alias[k]}')
        if d == k: E(f'alias: {d} сам на себе')
    for c in pool['clubs']:
        got = {p[5] for p in c['pl']}
        for d, k in alias.items():
            if d in got and k in got: E(f'alias: {d} і {k} в одному клуб-сезоні {c["y"]} {c["c"]}')

    # meta
    m = pool.get('meta', {})
    real = dict(club_seasons=len(pool['clubs']), players=sum(len(c['pl']) for c in pool['clubs']),
                persons=len({canon(i) for i in ids}), person_ids=len(ids), aliases=len(alias))
    for k, v in real.items():
        if m.get(k) != v: E(f'meta.{k} = {m.get(k)}, а насправді {v} (python3 data/update_meta.py)')

    # one person in two clubs in the same season
    seasons = defaultdict(list)   # (year, canonical) -> [(club, id, name, apps)]
    for pid, L in per.items():
        for y, club, nm, by, nat, apps, r in L: seasons[(y, canon(pid))].append((club, pid, nm, apps))
    rounds = {}
    for y, s in pool['seasons'].items():
        mx = max((x[5] for L in per.values() for x in L if x[0] == int(y)), default=0)
        rounds[int(y)] = max(2 * (len(s['teams']) - 1), mx)
    multi = {k: v for k, v in seasons.items() if len({x[0] for x in v}) > 1}
    wl = {}
    if os.path.exists(TRANSFERS):
        for r in csv.DictReader(open(TRANSFERS, encoding='utf-8', newline='')):
            wl[(int(r['season']), r['person_id'])] = r
    new_rows = []
    for (y, pid), v in sorted(multi.items()):
        clubs = ';'.join(sorted({x[0] for x in v}))
        apps = sum(x[3] for x in v)
        r = wl.get((y, pid))
        if r is None or r['clubs'] != clubs:
            if write:
                note = 'сума матчів більша за тури — перевірити' if apps > rounds[y] else ''
                new_rows.append(dict(season=y, person_id=pid, name=v[0][2], clubs=clubs, apps=apps, note=note))
            else:
                E(f'{y}: {v[0][2]} ({pid}) у клубах {clubs} — немає в data/check_pool_transfers.csv (перехід посеред сезону чи помилка даних?)')
        elif apps > rounds[y]:
            warn.append(f'{y}: {v[0][2]} ({pid}) {clubs}: сума матчів {apps} > {rounds[y]} турів — {r.get("note") or "перевірити"}')
    for k in sorted(set(wl) - set(multi)):
        warn.append(f'білий список: {k} більше не в двох клубах — рядок можна прибрати')
    if write and new_rows:
        rows = list(wl.values()) + [{k: str(v) for k, v in r.items()} for r in new_rows]
        rows.sort(key=lambda r: (int(r['season']), r['person_id']))
        with open(TRANSFERS, 'w', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, fieldnames=['season', 'person_id', 'name', 'clubs', 'apps', 'note'])
            w.writeheader(); w.writerows(rows)
        print(f'data/check_pool_transfers.csv: дописано {len(new_rows)}')

    cards = [p for c in pool['clubs'] for p in c['pl'] if isinstance(p, list) and len(p) == 12]
    top = [p for p in cards if isint(p[2]) and p[2] >= 90]
    print(f'пул: {real["club_seasons"]} клуб-сезонів, {real["players"]} карток, {real["person_ids"]} id, {real["persons"]} людей, '
          f'{real["aliases"]} псевдонімів; 90+: {len(top)} карток ({len(top) / max(1, len(cards)) * 100:.1f}%), '
          f'{len({canon(p[5]) for p in top})} людей; переходів посеред сезону: {len(multi)}')
    for s in warn: print('  увага:', s)
    for s in err[:60]: print('  ПОМИЛКА:', s)
    if len(err) > 60: print(f'  … і ще {len(err) - 60}')
    print('ПОМИЛОК:', len(err) if err else 'немає — УСЕ ГАРАЗД')
    sys.exit(1 if err else 0)


if __name__ == '__main__':
    main()

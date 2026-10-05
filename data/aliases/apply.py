"""Player aliases: one person under two ids (duplicate from different sources). Ids never change (DECISIONS #7),
so the duplicate stays on its cards and src/pool.json gets pool['alias'] = {dup_id: canonical_id}.
The game compares people by canonical id: duplicate-player check (S.taken in browser, api/verify.js on server), trophies, player count.

Source: data/aliases/aliases.csv (dup_id, canonical_id, name, evidence); every row needs evidence.
Run from repo root: python3 data/aliases/apply.py   (then python3 data/update_meta.py, python3 src/build.py && node tools/make_engine.js)
Idempotent. Checks: both ids exist in the pool, no chains (canonical is not itself a duplicate), duplicate and canonical
are never in the same club-season.
"""
import csv, json, os, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
POOL = os.path.join(ROOT, 'src', 'pool.json')
CSV = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'aliases.csv')


def main():
    raw = open(POOL, encoding='utf-8').read()
    pool = json.loads(raw)
    ids = {p[5] for c in pool['clubs'] for p in c['pl']}
    alias = {}
    for r in csv.DictReader(open(CSV, encoding='utf-8', newline='')):
        d, k = r['dup_id'].strip(), r['canonical_id'].strip()
        if not r.get('evidence', '').strip(): sys.exit(f'{d}: немає доказу (evidence)')
        if d == k or d in alias: sys.exit(f'{d}: дубль сам на себе або двічі')
        for x in (d, k):
            if x not in ids: sys.exit(f'{x}: немає в пулі')
        alias[d] = k
    for d, k in alias.items():
        if k in alias: sys.exit(f'ланцюжок: {d} → {k} → {alias[k]}')
    for c in pool['clubs']:
        got = {p[5] for p in c['pl']}
        for d, k in alias.items():
            if d in got and k in got: sys.exit(f'{d} і {k} в одному клуб-сезоні {c["y"]} {c["c"]} — це дві різні людини')
    pool['alias'] = dict(sorted(alias.items()))
    out = json.dumps(pool, ensure_ascii=False, separators=(',', ':'))
    if out != raw: open(POOL, 'w', encoding='utf-8').write(out)
    print('alias:', len(alias), '| src/pool.json', 'змінено' if out != raw else 'без змін')


if __name__ == '__main__':
    main()

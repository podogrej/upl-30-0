"""Псевдоніми гравців: одна людина під двома id (дубль із різних джерел). Id не змінюються ніколи (DECISIONS п. 7),
тому дубль лишається в картках, а в src/pool.json з'являється словник pool['alias'] = {dup_id: canonical_id}.
Гра порівнює людей за canonical id: «гравець двічі» (S.taken у браузері, api/verify.js на сервері), трофеї, лічильник футболістів.

Джерело — data/aliases/aliases.csv (dup_id, canonical_id, name, evidence): кожен рядок з доказом.
Запуск з кореня репозиторію: python3 data/aliases/apply.py   (потім python3 data/update_meta.py, python3 src/build.py && node tools/make_engine.js)
Повторний запуск нічого не змінює. Перевіряє: обидва id є в пулі, ланцюжків немає (canonical сам не дубль), дубль і canonical
не стоять в одному клуб-сезоні.
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

"""Трофей «Верховна Рада»: прізвища гравців пулу, які збігаються з прізвищами народних депутатів.

Джерело: відкриті дані Верховної Ради, скликання 2–9
  https://data.rada.gov.ua/ogd/mps/skl<N>/mps0<N>-data.json  (поле last_name).
Запуск: python3 data/trophies/rada.py <тека з mps2.json … mps9.json>
Пише data/trophies/rada_surnames.json — список збігів (нижній регістр), його вписано в src/trophies.js (RADA).
"""
import json, glob, os, random, sys

def norm(s):
    for a in '’ʼ`':
        s = s.replace(a, "'")
    return s.strip().lower()

src = sys.argv[1]
mps = set()
for f in sorted(glob.glob(os.path.join(src, 'mps*.json'))):
    for m in json.load(open(f)):
        ln = m.get('last_name') or m.get('full_name', '').split(' ')[0]
        if ln:
            mps.add(norm(ln))

pool = json.load(open('src/pool.json'))
cards = [x[0] for c in pool['clubs'] for x in c['pl']]
sur = lambda name: norm(name.split(' ')[-1])
hit = sorted({sur(n) for n in cards if sur(n) in mps})
print('депутатів-прізвищ', len(mps), 'збігів у пулі', len(hit))
for th in (5, 6, 7):
    k = sum(sum(sur(x) in mps for x in random.sample(cards, 11)) >= th for _ in range(40000))
    print(f'{th}+ у випадковому XI: {k / 400:.2f}%')
json.dump(hit, open('data/trophies/rada_surnames.json', 'w'), ensure_ascii=False, indent=0)

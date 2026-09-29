"""Adds nationality (normalized to Ukrainian names) and birth year to each card in game/pool.json.
Card layout after this: [..., 8 assists, 9 clean_sheets, 10 nat_index|-1, 11 birth_year|0]; pool['nats'] = list of country names.
"""
import json, collections, re
import pandas as pd

ROOT = '/home/claude/upl-dataset'
EN = {'Ukraine':'Україна','Brazil':'Бразилія','Georgia':'Грузія','Croatia':'Хорватія','Nigeria':'Нігерія','Argentina':'Аргентина',
 'Serbia':'Сербія','Russia':'Росія','Portugal':'Португалія','Armenia':'Вірменія','Albania':'Албанія','Romania':'Румунія','France':'Франція',
 'Spain':'Іспанія','Azerbaijan':'Азербайджан','Cameroon':'Камерун','North Macedonia':'Північна Македонія','Slovenia':'Словенія','Israel':'Ізраїль',
 'Senegal':'Сенегал','Moldova':'Молдова','Kosovo':'Косово','Ghana':'Гана','Bosnia-Herzegovina':'Боснія і Герцеговина','Belarus':'Білорусь',
 'Venezuela':'Венесуела','Montenegro':'Чорногорія','Mali':'Малі','Uzbekistan':'Узбекистан','Congo':'Республіка Конго','Czech Republic':'Чехія',
 'Netherlands':'Нідерланди',"Cote d'Ivoire":"Кот-д'Івуар",'Poland':'Польща','Panama':'Панама','Austria':'Австрія','Tunisia':'Туніс',
 'Slovakia':'Словаччина','Latvia':'Латвія','Niger':'Нігер','Colombia':'Колумбія','Luxembourg':'Люксембург','Lithuania':'Литва','Greece':'Греція',
 'Morocco':'Марокко','Belgium':'Бельгія','Bulgaria':'Болгарія','Kazakhstan':'Казахстан','Costa Rica':'Коста-Рика','Burkina Faso':'Буркіна-Фасо',
 'Estonia':'Естонія','Hungary':'Угорщина','Togo':'Того','Bolivia':'Болівія','Uruguay':'Уругвай','Ecuador':'Еквадор','The Gambia':'Гамбія',
 'DR Congo':'ДР Конго','Paraguay':'Парагвай','Iran':'Іран','Cyprus':'Кіпр','Finland':'Фінляндія','Denmark':'Данія','Iceland':'Ісландія',
 'Rwanda':'Руанда','Guadeloupe':'Гваделупа','Cape Verde':'Кабо-Верде','Switzerland':'Швейцарія','Germany':'Німеччина','Sweden':'Швеція',
 'Guinea-Bissau':'Гвінея-Бісау','Italy':'Італія','Guinea':'Гвінея','Curacao':'Кюрасао','Tanzania':'Танзанія','Suriname':'Суринам',
 'Tajikistan':'Таджикистан','Kyrgyzstan':'Киргизстан','Ireland':'Ірландія','Zimbabwe':'Зімбабве','United States':'США','Aruba':'Аруба',
 'Gabon':'Габон','Uganda':'Уганда','Zambia':'Замбія','South Africa':'ПАР','Algeria':'Алжир','Jamaica':'Ямайка','Canada':'Канада',
 'England':'Англія','Haiti':'Гаїті','Türkiye':'Туреччина','Sierra Leone':'Сьєрра-Леоне','Mauritania':'Мавританія'}
RU = {'Украина':'Україна','Бразилия':'Бразилія','Хорватия':'Хорватія','Беларусь':'Білорусь','Грузия':'Грузія','Иран':'Іран','Мали':'Малі',
 'Италия':'Італія','Румыния':'Румунія','Словения':'Словенія','Франция':'Франція','Польша':'Польща','Буркина-Фасо':'Буркіна-Фасо',
 'Израиль':'Ізраїль','Латвия':'Латвія','Эстония':'Естонія','Португалия':'Португалія','Нигерия':'Нігерія','Испания':'Іспанія','Тунис':'Туніс',
 'Венесуэла':'Венесуела','Нидерланды':'Нідерланди','Северная Македония':'Північна Македонія','Сербия':'Сербія','Австрия':'Австрія',
 'Заїр':'ДР Конго','Югославія':'Сербія','Сербія та Чорногорія':'Сербія','Нідерландські Антильські острови':'Кюрасао'}

def norm(v):
    if not isinstance(v, str) or not v.strip(): return None
    v = re.split(r'[,;/]', v)[0].strip().strip('}').strip()
    return EN.get(v) or RU.get(v) or v

ps = pd.read_csv(f'{ROOT}/data_v2/ratings_player_seasons.csv', low_memory=False, usecols=['person_id', 'nationality', 'dob'])
nat = {}; by = {}
for pid, g in ps.groupby('person_id'):
    vals = [norm(x) for x in g.nationality if norm(x)]
    if vals: nat[pid] = collections.Counter(vals).most_common(1)[0][0]
    d = g.dob.dropna()
    if len(d):
        y = str(d.iloc[0])[:4]
        if y.isdigit() and int(y) > 1900: by[pid] = int(y)

pool = json.load(open(f'{ROOT}/game/pool.json'))
names = sorted(set(nat.values()), key=lambda n: (n != 'Україна', n))
idx = {n: i for i, n in enumerate(names)}
miss_n = miss_b = 0
for c in pool['clubs']:
    for p in c['pl']:
        while len(p) < 10: p.append(None)
        n = nat.get(p[5]); b = by.get(p[5], 0)
        if n is None: miss_n += 1
        if not b: miss_b += 1
        p[10:] = [idx[n] if n else -1, b]
pool['nats'] = names
json.dump(pool, open(f'{ROOT}/game/pool.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('countries', len(names), names[:12], '| cards without nat', miss_n, 'without birth year', miss_b)

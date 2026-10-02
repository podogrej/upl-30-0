"""Пенальті: хто і як бив (і відбивав) у кар'єрі → data/penalties/penalties.csv.

Навіщо: для режиму 5×5 / серій пенальті (docs/leagues_online.md, розділ «Пенальти») потрібен навик пенальтиста
і воротаря. Цей скрипт лише збирає факти з джерелами — у грі нічого не змінює. Модель навику — data/penalties/skill.md
(рахує data/penalties/skill.py з цього CSV).

Кандидати (людина = p[5] у src/pool.json):
  - ≥ 3 різних сезонів у пулі або хоч одна картка ≥ 80;
  - усі воротарі (основна лінія GK) з ≥ 30 матчами УПЛ сумарно за всі картки.
Порядок обробки (щоб при зупинці за бюджетом найважливіші були готові):
  1) нападники і атакувальні півзахисники (ST, LW, RW, CAM, LM, RM) — за максимальною карткою, спадання;
  2) воротарі; 3) решта — за максимальною карткою.

Ідентифікація (як у data/class/collect.py, функції звідти скопійовано, щоб не запускати той скрипт при імпорті):
  - id tm:<N> → N;
  - id w:<дата>:<прізвище> → вже підтверджений TM id з кешу data/class (idmap.json, якщо лежить у ../class поруч з нашим кешем);
    посилання на TM у data/foot/foot.csv, data/positions/*.csv; Wikidata P2446 серед футболістів з тією ж датою народження;
    запасний шлях — пошук на transfermarkt.com за прізвищем (≥ 6 с між запитами, при «Human Verification» — 90 с).
    Кожен кандидат для w:-id перевіряється: дата народження на TM = наша, прізвище латиницею схоже ≥ 0.7.
  - id з «-00» у даті (невідомий день/місяць) не шукаємо.

Дані: tmapi.transfermarkt.technology/player/<id>/performance-game (внутрішній API сайту Transfermarkt, без «Human Verification»,
пауза ≥ 1.5 с). У кожному матчі є goalStatistics.penaltyShooter{Attempts,GoalsScored,Saves,Misses} і
penaltyGoalkeeper{Attempts,GoalsConceded,Saves,Misses}. Це пенальті в грі (не серії післяматчевих пенальті).
Misses у TM = усі незабиті (відбиті + повз/у каркас). Для матчів без детального звіту TM поля = null — рахуємо,
скільки матчів «з протоколом» (tracked), щоб бачити, наскільки повні дані (1990-ті — часто неповні).
UPL = competitionId 'UKR1' (Вища ліга / Прем'єр-ліга України).

FIFA / EA FC (sofifa.com): 30.09.2026 сайт віддає Cloudflare «Attention Required» (403) навіть на один запит — пропущено,
колонка fifa_pen порожня. Скрипт робить одну пробу (SOFIFA=1) і нічого не качає, якщо заблоковано.

Запуск з кореня репозиторію:
    python3 data/penalties/collect.py <тека кешу> [хвилин_бюджету=230]
    CACHE_ONLY=1 python3 data/penalties/collect.py <тека кешу>   # без мережі: перебудувати CSV з кешу
Кеш (pen_perf.json — стислі підсумки по турнірах, tm_players.json, idmap.json, tm_search.json, wd_dates.json) дозволяє
зупиняти й продовжувати; повторний запуск ідемпотентний (уже зібране не качається вдруге).
Сирі відповіді (2–3 МБ на гравця) не зберігаються.
"""
import json, csv, os, sys, re, time, subprocess, io, difflib, unicodedata, collections, datetime, urllib.parse

args = [a for a in sys.argv[1:] if not a.startswith('--')]
CACHE = args[0] if args else '.'
BUDGET_MIN = float(args[1]) if len(args) > 1 else 230
CACHE_ONLY = os.environ.get('CACHE_ONLY') == '1'
T0 = time.time()
os.makedirs(CACHE, exist_ok=True)
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
WUA = 'upl30-research/0.1 (football game research)'
TODAY = str(datetime.date.today())
OUT = 'data/penalties/penalties.csv'
TMAPI = 'https://tmapi.transfermarkt.technology'
UPL = 'UKR1'
ATTACK = {'ST', 'LW', 'RW', 'CAM', 'LM', 'RM'}
MIN_SEASONS, MIN_CARD, GK_MIN_APPS = 3, 80, 30
# порядок полів у стислому підсумку турніру (pen_perf.json → comps[compId])
F = ['type', 'nat', 'played', 'tracked', 'sh_att', 'sh_goal', 'sh_saved', 'sh_miss', 'gk_att', 'gk_conc', 'gk_saved', 'gk_miss']
SH = {'sh_att': 'penaltyShooterAttempts', 'sh_goal': 'penaltyShooterGoalsScored', 'sh_saved': 'penaltyShooterSaves', 'sh_miss': 'penaltyShooterMisses',
      'gk_att': 'penaltyGoalkeeperAttempts', 'gk_conc': 'penaltyGoalkeeperGoalsConceded', 'gk_saved': 'penaltyGoalkeeperSaves', 'gk_miss': 'penaltyGoalkeeperMisses'}


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


def jload(f, d):
    p = os.path.join(CACHE, f)
    return json.load(open(p)) if os.path.exists(p) else d


def jsave(f, o):
    p = os.path.join(CACHE, f)
    json.dump(o, open(p + '.tmp', 'w'), ensure_ascii=False)
    os.replace(p + '.tmp', p)


def over_budget():
    return (time.time() - T0) / 60 > BUDGET_MIN


# ---------- кандидати ----------
pool = json.load(open('src/pool.json'))
P = {}
for c in pool['clubs']:
    for x in c['pl']:
        e = P.setdefault(x[5], {'name': x[0], 'max': 0, 'years': set(), 'apps': 0, 'goals': 0, 'line': collections.Counter(), 'pos': collections.Counter()})
        e['max'] = max(e['max'], x[2])
        e['years'].add(c['y'])
        e['apps'] += x[3] or 0
        e['goals'] += x[4] or 0
        e['line'][x[1]] += (x[3] or 0) + 1
        e['pos'][x[6]] += (x[3] or 0) + 1
for e in P.values():
    e['mainline'] = e['line'].most_common(1)[0][0]
    e['mainpos'] = e['pos'].most_common(1)[0][0]


def group(pid):
    e = P[pid]
    return 0 if e['mainpos'] in ATTACK and e['mainline'] != 'GK' else 1 if e['mainline'] == 'GK' else 2


CAND = [p for p, e in P.items() if len(e['years']) >= MIN_SEASONS or e['max'] >= MIN_CARD
        or (e['mainline'] == 'GK' and e['apps'] >= GK_MIN_APPS)]
CAND.sort(key=lambda p: (group(p), -P[p]['max'], p))
# ONLY=<id>,<id>… — оновити лише ці рядки в наявному penalties.csv (решта рядків лишається як є);
# ONLY=manual — усі з MANUAL. Потрібно, коли повного кешу вже немає, а виправити треба кілька людей.
ONLY = os.environ.get('ONLY', '')
log('кандидатів', len(CAND), collections.Counter(group(p) for p in CAND))


# ---------- імена (з data/class/collect.py) ----------
def latin(s):
    s = unicodedata.normalize('NFKD', s.replace('ł', 'l').replace('Ł', 'L'))
    s = ''.join(ch for ch in s if not unicodedata.combining(ch)).lower()
    for a, b in (('shch', 's'), ('sch', 's'), ('ch', 'c'), ('sh', 's'), ('zh', 'j'), ('kh', 'h'), ('ts', 'c'), ('tz', 'c'), ('w', 'v'), ('x', 'ks'), ('y', 'i'), ('j', 'i')):
        s = s.replace(a, b)
    return re.sub('[^a-z]', '', s)


UK = dict(zip('абвгґдеєжзиіїйклмнопрстуфхцчшщьюяыэё', ['a', 'b', 'v', 'h', 'g', 'd', 'e', 'ie', 'zh', 'z', 'y', 'i', 'i', 'i', 'k', 'l', 'm', 'n', 'o',
                                                  'p', 'r', 's', 't', 'u', 'f', 'kh', 'ts', 'ch', 'sh', 'shch', '', 'iu', 'ia', 'y', 'e', 'e']))


def translit(s):
    return ''.join(UK.get(ch, ch) for ch in s.lower().replace("'", '').replace('’', ''))


def sim(a, b):
    return difflib.SequenceMatcher(None, latin(a), latin(b)).ratio()


def surname_sim(pid, *labels):
    """схожість ПРІЗВИЩА (не будь-якого слова імені): до 01.10.2026 тут був name_sim — він приймав збіг імені
    («Олег», «Сергій»), і з Wikidata (та сама дата народження) приїхали чужі люди (Єсін → Usoltsev, Сизон → Sionko).
    Наше прізвище = усі слова імені, крім першого (або єдине слово; плюс slug з id, якщо він не є ім'ям).
    Пара «наше прізвище — слово TM» зараховується, якщо збігається перша літера, довжини близькі (≥ 0.65)
    і схожість ≥ 0.75; г→h/g, k/c, є/е — нечутливо."""
    def norm(s):
        return latin(s).replace('g', 'h').replace('k', 'c').replace('ie', 'e')
    words = [w for w in re.split(r'[\s-]+', P[pid]['name']) if w]
    ours = set()
    for w in (words[1:] if len(words) > 1 else words):
        ours |= {norm(translit(w)), norm(translit(w.replace('г', 'ґ').replace('Г', 'Ґ')))}
    if pid.startswith('w:'):
        slug = pid.split(':', 2)[2]
        if len(words) < 2 or sim(slug, translit(words[0])) < 0.7:
            ours.add(norm(slug))
    best = 0
    for label in labels:
        for t in re.split(r'[\s-]+', label or ''):
            b = norm(translit(t))
            for a in ours:
                if len(a) >= 2 and len(b) >= 2 and a[0] == b[0] and min(len(a), len(b)) / max(len(a), len(b)) >= 0.65:
                    best = max(best, difflib.SequenceMatcher(None, a, b).ratio())
    return best


SURNAME_MIN = 0.75


# ---------- мережа ----------
_last = collections.defaultdict(float)


def fetch(url, host, gap, tries=3):
    """GET з паузою між запитами до одного хоста; повертає текст або None"""
    if CACHE_ONLY:
        return None
    for a in range(tries):
        w = _last[host] + gap - time.time()
        if w > 0:
            time.sleep(w)
        cmd = ['curl', '-sL', '-m', '120', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9', url]
        r = subprocess.run(cmd, capture_output=True, text=True, errors='replace')
        _last[host] = time.time()
        h = r.stdout
        if h and 'Human Verification' not in h[:3000] and 'too many requests' not in h[:500].lower() and 'Attention Required' not in h[:2000]:
            return h
        log('  блок/порожньо', host, url[:90], '— пауза 90 с')
        time.sleep(90)
    return None


def fetch_json(url, host, gap):
    h = fetch(url, host, gap)
    try:
        return json.loads(h) if h else None
    except ValueError:
        return None


def sparql(q, head):
    if CACHE_ONLY:
        return None
    for a in range(5):
        r = subprocess.run(['curl', '-sS', '-m', '70', 'https://query.wikidata.org/sparql', '--data-urlencode', 'query=' + q,
                            '-H', 'Accept: text/csv', '-H', 'User-Agent: ' + WUA], capture_output=True, text=True)
        if r.stdout.startswith(head):
            return list(csv.DictReader(io.StringIO(r.stdout)))
        time.sleep(3 + a * 3)
    return None


# ---------- 1. Transfermarkt ID ----------
def seed(name, sub):
    """кеш сусідніх зборів (data/class, data/foot) у тій самій теці scratchpad — лише читаємо"""
    f = os.path.join(CACHE, '..', sub, name)
    return json.load(open(f)) if os.path.exists(f) else {}


TMPL = jload('tm_players.json', {})
for k, v in seed('tm_players.json', 'class').items():
    TMPL.setdefault(k, v)
SEARCH = jload('tm_search.json', {})
for k, v in seed('tm_search.json', 'class').items():
    SEARCH.setdefault(k, v)
WD = jload('wd_dates.json', {})
for k, v in seed('wd_foot.json', 'foot').items():
    WD.setdefault(k, v)
# Ручні прив'язки person_id → TM id (мають перевагу над кешем і автоматичним пошуком; ok_identity для них не перевіряється).
# 1) 01–02.10.2026: виправлено хибні прив'язки (стара перевірка приймала збіг імені, не прізвища) — кожен id звірено
#    з клубами й сезонами УПЛ у пулі; у Мендоси й Пищура дата народження на TM відрізняється на 2 дні.
# 2) правильні, але нова перевірка прізвища їх не пропустила б (Hakobyan, Tănasă, Tchoutang, Jakobia, Ţîgîrlaş, Ebanda; Jugeli — інше ім'я).
MANUAL = {
    'w:1969-01-23:nikiforov': '970292',  # Андрій Никифоров (було 3742)
    'w:1969-02-13:korponai': '883303',  # Іван Корпонай (було 21097)
    'w:1970-02-01:irichuk': '970590',  # Павло Ірічук (було 288479)
    'w:1970-02-14:shkolnikov': '883444',  # Ян Школьніков (було 951000)
    'w:1970-06-29:rudniak': '883453',  # Дмитро Рудняк (було 21927)
    'w:1970-07-05:rati': '169277',  # Олег Ратій (було 751152)
    'w:1970-10-07:korenev': '251323',  # Дмитро Корєнєв (було 372232)
    'w:1971-02-07:sich': '966827',  # Микола Сич (було 400938)
    'w:1971-10-21:prohorenkov': '529460',  # Олексій Прохоренков (було 181973)
    'w:1974-01-08:leliuk': '494564',  # Дмитро Лелюк (було 173664)
    'w:1974-01-23:semchuk': '871044',  # Дмитро Семчук (було 117937)
    'w:1975-02-17:seleznov': '97868',  # Сергій Селезньов (було 885346)
    'w:1975-03-31:balanchuk': '251263',  # Сергій Баланчук (було 25870)
    'w:1975-04-02:esin': '57873',  # Сергій Єсін (було 80090)
    'w:1975-11-21:lutsishin': '883532',  # Михайло Луцишин (було 95210)
    'w:1976-10-08:derenov': '664478',  # Сергій Деренов (було 532358)
    'w:1976-11-24:flavius': '22127',  # Флавіус Стойкан (було 6446)
    'w:1977-02-01:sizon': '883860',  # Олег Сизон (було 9770)
    'w:1978-02-04:aliutse': '28532',  # Маріан Аліуце (було 280347)
    'w:1978-04-26:andres': '9650',  # Андрес Мендоса (було 74433)
    'w:1978-06-20:apian': '987608',  # Артур Апіян (було 6766)
    'w:1978-07-24:malimon': '882566',  # Іван Малімон (було 301626)
    'w:1978-11-17:chomahidze': '175925',  # Шота Чомахідзе (було 254587)
    'w:1978-12-29:antonenko': '91467',  # Олександр Антоненко (було 110232)
    'w:1979-08-01:djurichich': '28392',  # Саша Джурічич (було 1802)
    'w:1979-09-12:vasin': '416208',  # Денис Васін (було 261224)
    'w:1979-09-14:kozoriz': '57885',  # Іван Козоріз (було 84958)
    'w:1981-01-29:pischur': '58245',  # Олександр Пищур (було 91349)
    'w:1982-01-15:chernikov': '27192',  # Володимир Черніков (було 73974)
    'w:1982-05-04:suhina': '855965',  # Євген Сухина (було 76312)
    'w:1983-05-07:lujankov': '161557',  # Олександр Лужанков (було 178115)
    'w:1985-06-07:shmakov': '58251',  # Євгеній Шмаков (було 19115)
    'w:1986-07-22:baranets': '82592',  # Борис Баранець (було 261100)
    'w:1972-04-03:shutkov': '14941',  # Дмитро Шутков (було 619988, виправлено 01.10.2026)
    'w:1985-03-12:tovt': '27216',  # Андрій Товт (було 89540, виправлено 01.10.2026)
    'w:1969-04-14:djuheli': '831725',  # Іван Джугелі
    'w:1976-09-02:bernar': '32170',  # Бернар Чутанг
    'w:1978-09-05:hiom': '58236',  # Патрік Ібанда
    'w:1980-08-20:djakobia': '42636',  # Лаша Джакобія
    'w:1980-11-04:akobian': '23986',  # Ара Акобян
    'w:1981-02-02:chiprian': '46661',  # Чіпріан Тенасе
    'w:1984-02-24:tsihirlash': '44387',  # Ігор Цигирлаш
}
CLASS_ID = seed('idmap.json', 'class')
IDMAP = jload('idmap.json', {})


if ONLY:
    _only = set(MANUAL) if ONLY == 'manual' else set(ONLY.split(','))
    CAND = [p for p in CAND if p in _only]
    log('ONLY: оновлюємо рядків', len(CAND))


def tm_players(ids):
    need = [i for i in dict.fromkeys(ids) if i and i not in TMPL]
    for k in range(0, len(need), 25):
        part = need[k:k + 25]
        d = fetch_json(TMAPI + '/players?' + '&'.join('ids[]=' + i for i in part), 'tmapi', 1.5)
        if not d or not d.get('success'):
            continue
        got = set()
        for x in d['data']:
            TMPL[x['id']] = dict(name=x.get('name', ''), short=x.get('shortName', ''),
                                 passport=((x.get('nationalityDetails') or {}).get('passportName') or ''),
                                 dob=((x.get('lifeDates') or {}).get('dateOfBirth') or ''),
                                 url='https://www.transfermarkt.com' + (x.get('relativeUrl') or f'/-/profil/spieler/{x["id"]}'))
            got.add(x['id'])
        for i in part:
            if i not in got:
                TMPL[i] = {'err': 'not found'}
        jsave('tm_players.json', TMPL)


def wd_dates(dates):
    todo = sorted(d for d in dates if d not in WD)
    for i in range(0, len(todo), 15):
        part = todo[i:i + 15]
        v = ' '.join('"%sT00:00:00Z"^^xsd:dateTime' % d for d in part)
        rows = sparql('SELECT DISTINCT ?bd ?l ?tm WHERE { VALUES ?bd {%s} ?p wdt:P569 ?bd; wdt:P106 wd:Q937857; wdt:P2446 ?tm. '
                      'OPTIONAL{?p rdfs:label ?l FILTER(lang(?l)="en")} }' % v, 'bd,')
        if rows is None:
            continue
        for d in part:
            WD[d] = []
        for r in rows:
            WD[r['bd'][:10]].append([r.get('l') or '', r['tm']])
        jsave('wd_dates.json', WD)


def tm_search(q):
    if q in SEARCH:
        return SEARCH[q]
    h = fetch('https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=' + urllib.parse.quote(q), 'www', 6)
    if h is None or 'Transfermarkt' not in h:
        return []
    ids = []
    for sl, t in re.findall(r'href="/([a-z0-9-]+)/profil/spieler/(\d+)"', h):
        if [sl, t] not in ids:
            ids.append([sl, t])
    SEARCH[q] = ids[:10]
    jsave('tm_search.json', SEARCH)
    return SEARCH[q]


def known_links():
    out = collections.defaultdict(list)
    rx = re.compile(r'spieler/(\d+)')
    for f, col in (('data/foot/foot.csv', 'url'), ('data/positions/verify_manual_report.csv', 'url'), ('data/positions/positions_manual.csv', 'source')):
        if os.path.exists(f):
            for r in csv.DictReader(open(f, newline='')):
                m = rx.search(r.get(col) or '')
                if m and r['person_id'].startswith('w:'):
                    out[r['person_id']].append(m.group(1))
    return out


def ok_identity(pid, e):
    if not e or 'err' in e:
        return False
    if pid.startswith('tm:'):
        return True
    return e.get('dob') == pid.split(':')[1] and surname_sim(pid, e['name'], e.get('short', ''), e.get('passport', '')) >= SURNAME_MIN


def resolve_ids():
    """без пошуку на www: tm:, кеш data/class, посилання репозиторію, Wikidata"""
    links = known_links()
    wd_dates({p.split(':')[1] for p in CAND if p.startswith('w:') and '-00' not in p and p not in MANUAL and not (IDMAP.get(p) or {}).get('tm')})
    cands = {}
    for pid in CAND:
        if pid in MANUAL:
            IDMAP[pid] = {'tm': MANUAL[pid], 'how': 'вручну (MANUAL у collect.py, звірено з клубами УПЛ)', 'searched': 1}
            continue
        if (IDMAP.get(pid) or {}).get('tm'):
            continue
        if pid.startswith('tm:'):
            IDMAP[pid] = {'tm': pid[3:], 'how': 'tm id'}
            continue
        if '-00' in pid:
            continue
        c = []
        ci = CLASS_ID.get(pid) or {}
        if ci.get('tm'):
            c.append((ci['tm'], 'data/class: ' + ci.get('how', '')))
        d = pid.split(':')[1]
        c += [(t, 'repo link (data/foot, data/positions)') for t in links.get(pid, [])]
        c += [(t, 'wikidata P2446 + dob') for lab, t in WD.get(d, []) if lab and surname_sim(pid, lab) >= SURNAME_MIN]
        cands[pid] = list(dict.fromkeys(c))
    tm_players([t for v in cands.values() for t, _ in v])
    for pid, c in cands.items():
        for t, how in c:
            if ok_identity(pid, TMPL.get(t)):
                IDMAP[pid] = {'tm': t, 'how': how}
                break
    if not CACHE_ONLY:
        jsave('idmap.json', IDMAP)


def search_ids():
    """запасний шлях: пошук на transfermarkt.com для ще не знайдених (≥ 6 с/запит), у порядку пріоритету"""
    for pid in CAND:
        if CACHE_ONLY or over_budget():
            return
        e = IDMAP.get(pid) or {}
        if e.get('tm') or e.get('searched') or pid.startswith('tm:') or '-00' in pid:
            continue
        slug = pid.split(':', 2)[2]
        t = translit(P[pid]['name'].split(' ')[-1]) or slug
        g = t.replace('kh', 'h').replace('h', 'g')
        found = ''
        for q in dict.fromkeys(q for q in (t, slug, g, g.replace('y', 'i')) if len(q) >= 3):
            ids = [x for sl, x in tm_search(q) if surname_sim(pid, sl.replace('-', ' ')) >= SURNAME_MIN]
            tm_players(ids)
            found = next((x for x in ids if ok_identity(pid, TMPL.get(x))), '')
            if found:
                break
        IDMAP[pid] = {'tm': found, 'how': 'transfermarkt search + dob' if found else 'not found', 'searched': 1}
        log('пошук', pid, P[pid]['name'], '→', found or '—')
        jsave('idmap.json', IDMAP)
        if found:
            get_perf(found)


# ---------- 2. пенальті з performance-game ----------
PERF = jload('pen_perf.json', {})   # tm id → {'comps': {compId: [F...]}, 'games': n, 'tracked_from': season, 'tracked_to': season}


def get_perf(t):
    if t in PERF:
        return PERF[t]
    d = fetch_json(f'{TMAPI}/player/{t}/performance-game', 'tmapi', 1.5)
    if not d or not d.get('success'):
        return None
    comps, seasons, games = {}, [], 0
    for g in (d['data'] or {}).get('performance', []):
        gi, st = g['gameInformation'], g['statistics']
        if (st.get('generalStatistics') or {}).get('participationState') != 'played':
            continue
        games += 1
        gs = st.get('goalStatistics') or {}
        c = comps.setdefault(gi['competitionId'], [gi.get('competitionTypeId'), int(bool(gi.get('isNationalGame')))] + [0] * (len(F) - 2))
        c[2] += 1
        if gs.get('penaltyShooterAttempts') is not None:
            c[3] += 1
            seasons.append(gi.get('seasonId') or 0)
        for i, k in enumerate(F[4:], 4):
            c[i] += gs.get(SH[k]) or 0
    PERF[t] = {'comps': comps, 'games': games, 'tracked_from': min(seasons) if seasons else None, 'tracked_to': max(seasons) if seasons else None}
    jsave('pen_perf.json', PERF)
    return PERF[t]


def collect():
    n = 0
    for p in CAND:
        t = (IDMAP.get(p) or {}).get('tm')
        if not t or t in PERF:
            continue
        if over_budget() or CACHE_ONLY:
            log('бюджет часу вичерпано / CACHE_ONLY — зупинка збору')
            return
        r = get_perf(t)
        n += 1
        if n % 25 == 0 or r is None:
            log(n, p, P[p]['name'], P[p]['max'], 'ok' if r else 'ПОМИЛКА', 'готово', sum(1 for q in CAND if (IDMAP.get(q) or {}).get('tm') in PERF))


def sofifa_probe():
    """одна ввічлива проба; якщо Cloudflare — повертаємо False і більше не звертаємось"""
    if CACHE_ONLY or os.environ.get('SOFIFA') != '1':
        return False
    h = fetch('https://sofifa.com/players?keyword=yarmolenko', 'sofifa', 10, tries=1)
    return bool(h and 'Attention Required' not in h)


# ---------- 3. CSV ----------
def write():
    rows = []
    for p in CAND:
        e = P[p]
        idm = IDMAP.get(p) or {}
        t = idm.get('tm', '')
        pl = TMPL.get(t, {}) if t else {}
        pf = PERF.get(t) if t else None
        r = dict(person_id=p, name=e['name'], pen_taken='', pen_scored='', gk_faced='', gk_saved='', fifa_pen='',
                 source='', url='', checked='', note='',
                 upl_taken='', upl_scored='', upl_gk_faced='', upl_gk_saved='', pen_saved_by_gk='', gk_conceded='',
                 games_tm='', games_tracked='', tracked_seasons='', tm_id=t, mainpos=e['mainpos'], line=e['mainline'],
                 max_rating=e['max'], seasons=len(e['years']), upl_apps_pool=e['apps'], upl_goals_pool=e['goals'])
        note = []
        if not t:
            note.append('немає Transfermarkt ID' + (' (невідома дата народження в id)' if '-00' in p else ' (не знайдено/не підтверджено датою народження)'))
        else:
            r['url'] = pl.get('url') or f'https://www.transfermarkt.com/-/profil/spieler/{t}'
            if p.startswith('w:'):
                note.append('tm id: ' + idm.get('how', ''))
        if pf is not None:
            tot = [0] * len(F)
            upl = [0] * len(F)
            for cid, v in pf['comps'].items():
                for i in range(2, len(F)):
                    tot[i] += v[i]
                    if cid == UPL:
                        upl[i] += v[i]
            ix = F.index

            def taken(v):   # у TM Attempts іноді менше за «забив + відбили» — беремо більше (див. README)
                return max(v[ix('sh_att')], v[ix('sh_goal')] + v[ix('sh_saved')])

            def faced(v):   # те саме для воротаря: пропустив + відбив
                return max(v[ix('gk_att')], v[ix('gk_conc')] + v[ix('gk_saved')])
            if faced(tot) > tot[ix('gk_att')] or taken(tot) > tot[ix('sh_att')]:
                note.append('у TM кількість пенальті менша за суму результатів — взято суму')
            r.update(pen_taken=taken(tot), pen_scored=tot[ix('sh_goal')], gk_faced=faced(tot), gk_saved=tot[ix('gk_saved')],
                     upl_taken=taken(upl), upl_scored=upl[ix('sh_goal')], upl_gk_faced=faced(upl), upl_gk_saved=upl[ix('gk_saved')],
                     pen_saved_by_gk=tot[ix('sh_saved')], gk_conceded=tot[ix('gk_conc')], games_tm=pf['games'], games_tracked=tot[ix('tracked')],
                     tracked_seasons=f"{pf['tracked_from']}–{pf['tracked_to'] + 1}" if pf['tracked_from'] else '')
            r['source'] = 'transfermarkt (tmapi performance-game)'
            r['url'] += f' {TMAPI}/player/{t}/performance-game'
            r['checked'] = TODAY
            if pf['games'] and tot[ix('tracked')] < 0.8 * pf['games']:
                note.append(f"протокол TM лише в {tot[ix('tracked')]} з {pf['games']} матчів — пенальті можуть бути неповні")
            if upl[ix('played')] < 0.5 * e['apps']:
                note.append(f"у TM лише {upl[ix('played')]} матчів УПЛ проти {e['apps']} у пулі")
        elif t:
            note.append('дані TM ще не зібрано (бюджет/помилка)')
        r['note'] = '; '.join(note)
        rows.append(r)
    if ONLY and os.path.exists(OUT):
        new = {r['person_id']: r for r in rows}
        old = list(csv.DictReader(open(OUT, newline='')))
        rows = [new.pop(r['person_id'], r) for r in old] + list(new.values())
    with open(OUT, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    got = [r for r in rows if r['source']]
    log('рядків', len(rows), 'з TM id', sum(1 for r in rows if r['tm_id']), 'з даними', len(got),
        'били пенальті', sum(1 for r in got if r['pen_taken']), 'воротарі з пенальті', sum(1 for r in got if r['gk_faced']))


def main():
    resolve_ids()
    log('TM id є в', sum(1 for p in CAND if (IDMAP.get(p) or {}).get('tm')), 'з', len(CAND))
    tm_players([IDMAP[p]['tm'] for p in CAND if (IDMAP.get(p) or {}).get('tm')])
    collect()
    search_ids()
    collect()
    if sofifa_probe():
        log('sofifa доступний — але збір атрибутів не реалізовано (див. README)')
    for p in CAND:
        IDMAP.setdefault(p, {'tm': '', 'how': 'not found'})
    if not CACHE_ONLY:
        jsave('idmap.json', IDMAP)
    write()


if __name__ == '__main__':
    main()

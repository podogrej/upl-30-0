"""Модель навику пенальті з data/penalties/penalties.csv → data/penalties/skill.md (пропозиція, у грі нічого не змінює).

Пенальтист: байєсова (бета-біноміальна) оцінка реалізації
    skill = (забив + k·m) / (пробив + k),
де m — апріорна реалізація для позиції і рейтингу людини, k — «вага апріорі» у пенальті (скільки ударів потрібно,
щоб власна статистика переважила). m і k оцінюються з самих даних (емпіричний Байєс):
  - m(група, рейтинг) = m_групи + b·(макс. картка − 85)/10; m_групи — зважена реалізація групи, b — зважений МНК по людях;
  - k = m(1−m)/σ²_між − 1, де σ²_між — дисперсія реалізації між людьми за вирахуванням біноміального шуму
    (люди з ≥ 8 ударами); обмежено 10…300.
Воротар: те саме для частки відбитих (saved / faced), апріорі — середня по воротарях (групи не потрібні).
Люди без даних TM отримують просто m (для воротарів — середню частку відбитих).

Запуск з кореня: python3 data/penalties/skill.py            # друкує підсумок
                 python3 data/penalties/skill.py --md       # + перезаписує data/penalties/skill.md
"""
import csv, sys, collections

ROWS = list(csv.DictReader(open('data/penalties/penalties.csv', newline='')))
GROUP = {'ST': 'FW', 'LW': 'W', 'RW': 'W', 'CAM': 'AM', 'LM': 'W', 'RM': 'W', 'CM': 'MF', 'CDM': 'MF',
         'CB': 'DF', 'LB': 'DF', 'RB': 'DF', 'LWB': 'DF', 'GK': 'GK'}
MIN_ATT_VAR = 8          # для оцінки дисперсії між людьми
MIN_TOP = 5              # у топ-списки — лише хто мав ≥ 5 пенальті (без даних skill = апріорі, це не «топ»)
K_RANGE = (10, 300)
GROUP_SHRINK = 1000      # умовних ударів, з якими групове апріорі стягується до загального


def i(x):
    return int(x) if x not in ('', None) else 0


def grp(r):
    return 'GK' if r['line'] == 'GK' else GROUP.get(r['mainpos'], 'MF')


def beta_k(items, m):
    """items = [(успіхи, спроби)]; метод моментів для сили апріорі бета-розподілу"""
    xs = [(s / n, n) for s, n in items if n >= MIN_ATT_VAR]
    if len(xs) < 10:
        return K_RANGE[1]
    w = sum(n for _, n in xs)
    mean = sum(p * n for p, n in xs) / w
    var = sum(n * (p - mean) ** 2 for p, n in xs) / w
    noise = len(xs) * mean * (1 - mean) / w   # E[Σ n(p−p̄)²]/Σn = σ²_між·(≈1) + (кількість людей)·p̄(1−p̄)/Σn
    between = var - noise
    if between <= 1e-6:
        return K_RANGE[1]
    return max(K_RANGE[0], min(K_RANGE[1], m * (1 - m) / between - 1))


def fit_takers():
    data = [r for r in ROWS if r['source'] and grp(r) != 'GK']
    by = collections.defaultdict(lambda: [0, 0])
    for r in data:
        g = by[grp(r)]
        g[0] += i(r['pen_scored'])
        g[1] += i(r['pen_taken'])
    tot_s, tot_n = sum(v[0] for v in by.values()), sum(v[1] for v in by.values())
    m0 = tot_s / tot_n
    # групові середні зі стягуванням до загальної: різниця груп статистично слабка (AM проти решти ≈ 1.7σ),
    # тому сильне стягування — 1000 умовних ударів
    mg = {g: (s + GROUP_SHRINK * m0) / (n + GROUP_SHRINK) for g, (s, n) in by.items()}
    # нахил за рейтингом: зважений МНК залишків (вага = спроби)
    pts = [((i(r['max_rating']) - 85) / 10, i(r['pen_scored']) / i(r['pen_taken']) - mg[grp(r)], i(r['pen_taken'])) for r in data if i(r['pen_taken'])]
    w = sum(n for _, _, n in pts)
    xm = sum(x * n for x, _, n in pts) / w
    ym = sum(y * n for _, y, n in pts) / w
    sxx = sum(n * (x - xm) ** 2 for x, _, n in pts)
    b = sum(n * (x - xm) * (y - ym) for x, y, n in pts) / sxx if sxx else 0
    b = max(-0.05, min(0.05, b))

    def prior(r):
        return max(0.6, min(0.9, mg.get(grp(r), m0) + b * (i(r['max_rating']) - 85) / 10))
    k = beta_k([(i(r['pen_scored']), i(r['pen_taken'])) for r in data], m0)
    return m0, mg, b, k, prior, by


def fit_keepers():
    data = [r for r in ROWS if r['source'] and grp(r) == 'GK']
    s, n = sum(i(r['gk_saved']) for r in data), sum(i(r['gk_faced']) for r in data)
    m = s / n if n else 0.2
    k = beta_k([(i(r['gk_saved']), i(r['gk_faced'])) for r in data], m)
    return m, k, s, n


def main():
    m0, mg, b, k, prior, by = fit_takers()
    gm, gk, gs, gn = fit_keepers()
    takers, keepers = [], []
    for r in ROWS:
        if grp(r) == 'GK':
            s, n = i(r['gk_saved']), i(r['gk_faced'])
            keepers.append(((s + gk * gm) / (n + gk), s, n, r))
        else:
            s, n, m = i(r['pen_scored']), i(r['pen_taken']), prior(r)
            takers.append(((s + k * m) / (n + k), s, n, m, r))
    takers.sort(key=lambda x: (-x[0], -x[2]))
    keepers.sort(key=lambda x: (-x[0], -x[2]))
    out = []
    P = out.append
    P('# Навык пенальти — предложение модели (данные 30.09.2026)\n')
    P('Черновик для режима 5×5 / серий пенальти (docs/leagues_online.md, «Пенальти»). В игре ничего не меняет. '
      'Числа пересчитывает `python3 data/penalties/skill.py --md` из `penalties.csv`.\n')
    P('## Пенальтист: байесовская реализация\n')
    P('`skill = (забил + k·m) / (пробил + k)` — это «реализация, стянутая к ожидаемой». У кого 2 удара из 2, получает почти m; '
      'у кого 40 ударов — почти свою реальную долю.\n')
    P(f'- Средняя реализация в данных (все полевые, пенальти в игре, TM): **{m0:.3f}** ({sum(v[0] for v in by.values())}/{sum(v[1] for v in by.values())}).')
    P(f'- Априори m по группе позиций (стянуто к общей средней с весом {GROUP_SHRINK} ударов — разница групп слабая): ' + ', '.join(f'{g} {v:.3f} ({by[g][0]}/{by[g][1]})' for g, v in sorted(mg.items(), key=lambda x: -x[1])) + '.')
    P(f'- Поправка на рейтинг: m += {b:+.3f} за каждые +10 к максимальной карточке (от 85), m ограничено 0.60…0.90.')
    P(f'- Сила априори k = **{k:.0f}** ударов (метод моментов по людям с ≥ {MIN_ATT_VAR} ударами). Разброс реализации между людьми '
      'очень мал (почти весь наблюдаемый разброс — случайность), поэтому k большое: даже 40 ударов сдвигают оценку от m лишь на ~1/6 пути.')
    P('- Рейтинг и голы почти не связаны с реализацией (наклон по рейтингу около нуля; по квартилям «голы за матч» реализация 0.81–0.82 везде). '
      'Зато голы и данные TM хорошо показывают, **кто штатный пенальтист** (пенальти за матч).')
    P('- Нет данных TM → skill = m (позиция + рейтинг).')
    P('- **Кто бьёт** в матче: skill, округлённый до 0.01, затем «пенальти за матч» в TM (штатный пенальтист), затем голы в пуле.\n')
    P('## Вратарь: байесовская доля отбитых\n')
    P(f'`save = (отбил + k·s̄) / (встретил + k)`, s̄ = **{gm:.3f}** ({gs}/{gn} по всем вратарям-кандидатам), k = **{gk:.0f}**. '
      'Мимо/в штангу вратарю не засчитываются (это промах бьющего).\n')
    P('## Как использовать в симуляции (предложение)\n')
    P('`P(гол) = clamp(m̄ + A·(skill_бьющего − m̄) − A·(save_вратаря − s̄), 0.55, 0.95)`, m̄ — средняя реализация. '
      'При A = 1 — реалистично (разница лучших и средних 2–4 п.п.); для игры можно A = 2–3, чтобы выбор бьющего был заметен. '
      'В матче бьёт лучший по skill на поле; в серии — 5 лучших по skill, дальше по порядку. '
      'Детерминизм: только из seed матча, как остальная симуляция.\n')
    P(f'## Топ-20 пенальтистов (skill; только ≥ {MIN_TOP} ударов в данных)\n')
    P('| # | Игрок | Поз. | Макс. | Пробил | Забил | Реализация | УПЛ | пен./матч | m | skill |')
    P('|---|---|---|---|---|---|---|---|---|---|---|')
    for j, (sk, s, n, m, r) in enumerate([x for x in takers if x[2] >= MIN_TOP][:20], 1):
        P(f"| {j} | {r['name']} | {r['mainpos']} | {r['max_rating']} | {n} | {s} | {s / n:.0%} | {r['upl_scored']}/{r['upl_taken']} | {n / max(1, i(r['games_tm'])):.3f} | {m:.3f} | **{sk:.3f}** |")
    P(f'\n## Топ-10 вратарей на пенальти (save; только ≥ {MIN_TOP} пенальти в данных)\n')
    P('| # | Вратарь | Макс. | Встретил | Отбил | Доля | УПЛ | save |')
    P('|---|---|---|---|---|---|---|---|')
    for j, (sk, s, n, r) in enumerate([x for x in keepers if x[2] >= MIN_TOP][:10], 1):
        P(f"| {j} | {r['name']} | {r['max_rating']} | {n} | {s} | {s / n:.0%} | {r['upl_gk_saved']}/{r['upl_gk_faced']} | **{sk:.3f}** |")
    most = sorted((x for x in takers if x[2]), key=lambda x: -x[2])[:10]
    P('\n## Для сравнения: больше всех ударов\n')
    P(', '.join(f"{r['name']} {s}/{n}" for sk, s, n, m, r in most) + '.\n')
    worst = [x for x in takers if x[2] >= 8][-5:]
    P('Худшие при ≥ 8 ударах (skill): ' + ', '.join(f"{r['name']} {s}/{n} → {sk:.3f}" for sk, s, n, m, r in worst) + '.\n')
    P('## Оговорки\n')
    P('- Только пенальти в игре (не послематчевые серии). Карьера целиком (все клубы, сборные, кубки), не только УПЛ; УПЛ — отдельной колонкой.')
    P('- 1990-е и 2000-е в TM покрыты неполно: у части ветеранов нет всех матчей УПЛ, а пенальти в матчах УПЛ ~1995–2008 записаны '
      'примерно вдвое реже, чем после 2010 (см. README). У таких людей ударов меньше — skill ближе к априори, это безопасно.')
    P('- Разброс реализации между людьми маленький: разница лучших и средних — единицы процентов. Поэтому в игре навык '
      'пенальти лучше делать мягким, а выбор бьющего — главным эффектом.')
    txt = '\n'.join(out) + '\n'
    print(txt)
    if '--md' in sys.argv:
        open('data/penalties/skill.md', 'w').write(txt)


if __name__ == '__main__':
    main()

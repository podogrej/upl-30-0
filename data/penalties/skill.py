"""Penalty skill model: data/penalties/penalties.csv -> data/penalties/skill.md (proposal only, does not change the game).

Taker: Bayesian (beta-binomial) conversion estimate
    skill = (scored + k*m) / (taken + k),
where m is the prior conversion for the player's position group and rating, and k is the prior weight in penalties
(how many attempts it takes for own stats to dominate). m and k are fitted from the data (empirical Bayes):
  - m(group, rating) = m_group + b*(max card - 85)/10; m_group = weighted group conversion, b = weighted least squares over players;
  - k = m(1-m)/var_between - 1, where var_between = between-player variance minus binomial noise
    (players with >= 8 attempts); clamped to 10..300.
Keeper: same for save rate (saved / faced); prior = mean over keepers (no groups).
Players without TM data get plain m (keepers: mean save rate).

Run from repo root: python3 data/penalties/skill.py            # print summary
                    python3 data/penalties/skill.py --md       # + overwrite data/penalties/skill.md
                    python3 data/penalties/skill.py --js       # + 5x5 table: src/pen_skill.js
"""
import csv, sys, collections, json

ROWS = list(csv.DictReader(open('data/penalties/penalties.csv', newline='')))
GROUP = {'ST': 'FW', 'LW': 'W', 'RW': 'W', 'CAM': 'AM', 'LM': 'W', 'RM': 'W', 'CM': 'MF', 'CDM': 'MF',
         'CB': 'DF', 'LB': 'DF', 'RB': 'DF', 'LWB': 'DF', 'GK': 'GK'}
MIN_ATT_VAR = 8          # min attempts for between-player variance
MIN_TOP = 5              # min attempts for top lists (without data skill equals the prior)
K_RANGE = (10, 300)
GROUP_SHRINK = 1000      # pseudo-attempts shrinking group priors toward the overall mean


def i(x):
    return int(x) if x not in ('', None) else 0


def grp(r):
    return 'GK' if r['line'] == 'GK' else GROUP.get(r['mainpos'], 'MF')


def beta_k(items, m):
    """items = [(successes, attempts)]; method of moments for the beta prior strength"""
    xs = [(s / n, n) for s, n in items if n >= MIN_ATT_VAR]
    if len(xs) < 10:
        return K_RANGE[1]
    w = sum(n for _, n in xs)
    mean = sum(p * n for p, n in xs) / w
    var = sum(n * (p - mean) ** 2 for p, n in xs) / w
    noise = len(xs) * mean * (1 - mean) / w   # E[sum n(p-mean)^2]/sum n = var_between*(~1) + n_players*mean(1-mean)/sum n
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
    # group means shrunk toward the overall mean; group differences are weak (AM vs rest ~1.7 sigma),
    # hence strong shrinkage
    mg = {g: (s + GROUP_SHRINK * m0) / (n + GROUP_SHRINK) for g, (s, n) in by.items()}
    # rating slope: weighted least squares on residuals (weight = attempts)
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
    if '--js' in sys.argv:   # 5x5 table -> src/pen_skill.js (only players with attempts / faced penalties)
        tk = {r['person_id']: [round(sk * 1000), round(1000 * n / max(1, i(r['games_tm'])))] for sk, s, n, m, r in takers if n}
        kp = {r['person_id']: round(sk * 1000) for sk, s, n, r in keepers if n}
        js = ('// GENERATED by python3 data/penalties/skill.py --js (Transfermarkt data, data/penalties). Do not edit.\n'
              '// F5_PK: id -> [penalty skill x1000, penalties per match x1000]; F5_GK: keeper id -> save rate x1000; F5_PM, F5_GM: averages\n'
              f'const F5_PM={m0:.4f},F5_GM={gm:.4f};\n'
              'const F5_PK=' + json.dumps(tk, ensure_ascii=False, separators=(',', ':')) + ';\n'
              'const F5_GK=' + json.dumps(kp, ensure_ascii=False, separators=(',', ':')) + ';\n')
        open('src/pen_skill.js', 'w').write(js)


if __name__ == '__main__':
    main()

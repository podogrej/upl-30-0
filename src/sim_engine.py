# -*- coding: utf-8 -*-
"""30-0 УПЛ — движок драфта и симуляции сезона (прототип для калибровки).

Вход: пул карточек «игрок-сезон» (ratings_player_seasons.csv), таблицы (standings.csv).
Модель матча: голы каждой стороны ~ Пуассон(λ), λ = базовая результативность лиги × атака своих × слабость обороны чужих × форма × дом/выезд.
Атака/оборона команды пользователя считаются из рейтингов XI по линиям; атака/оборона реальных соперников — из их реальных GF/GA в том сезоне.
"""
import numpy as np, pandas as pd
from dataclasses import dataclass, field

FORMATIONS = {
    "4-4-2":   {"GK": 1, "DF": 4, "MF": 4, "FW": 2},
    "4-3-3":   {"GK": 1, "DF": 4, "MF": 3, "FW": 3},
    "3-5-2":   {"GK": 1, "DF": 3, "MF": 5, "FW": 2},
    "4-2-3-1": {"GK": 1, "DF": 4, "MF": 5, "FW": 1},
    "5-3-2":   {"GK": 1, "DF": 5, "MF": 3, "FW": 2},
    "3-4-3":   {"GK": 1, "DF": 3, "MF": 4, "FW": 3},
}
# вклад позиции в атаку / оборону (на единицу «рейтинг − 50»)
ATT_W = {"GK": 0.0, "DF": 0.2, "MF": 0.6, "FW": 1.0}
DEF_W = {"GK": 1.4, "DF": 1.0, "MF": 0.5, "FW": 0.1}
REF = {"att": 5.2, "def": 7.6}   # сумма весов для 4-4-2 → «эффективный средний рейтинг»
BASE = 50.0

FORMATION_EFFECT = 0.5   # 1 = схема полностью меняет вес атаки/обороны, 0 = только состав слотов

def team_indices(xi):
    """xi: список (position_group, rating). Возвращает (att_eff, def_eff, balance_gap) — в единицах рейтинга.
    Нормировка: наполовину по весам 4-4-2, наполовину по весам самой схемы → атакующие схемы дают небольшой, а не подавляющий бонус."""
    wa = sum(ATT_W[p] for p, _ in xi); wd = sum(DEF_W[p] for p, _ in xi)
    na = FORMATION_EFFECT * REF["att"] + (1 - FORMATION_EFFECT) * wa
    nd = FORMATION_EFFECT * REF["def"] + (1 - FORMATION_EFFECT) * wd
    att = sum(ATT_W[p] * (r - BASE) for p, r in xi) / na + BASE
    de = sum(DEF_W[p] * (r - BASE) for p, r in xi) / nd + BASE
    lines = {}
    for p, r in xi: lines.setdefault(p, []).append(r)
    means = {p: np.mean(v) for p, v in lines.items()}
    gap = max(means.values()) - min(means.values())
    return att, de, gap

def best_xi(g, formation="4-4-2"):
    """лучший XI клуба-сезона под схему; g — DataFrame строк клуба-сезона с position_group, rating"""
    xi = []
    for pos, k in FORMATIONS[formation].items():
        rs = g.loc[g.position_group == pos, "rating"].nlargest(k).tolist()
        if len(rs) < k: return None
        xi += [(pos, r) for r in rs]
    return xi

@dataclass
class Params:
    beta_att: float = 0.065     # log-множитель атаки на 1 пункт att_eff (подобрано по реальным GF/GA ×1.3 и балансу схем)
    beta_def: float = 0.085     # log-множитель обороны на 1 пункт def_eff
    cap_att: float = 4.0        # потолок множителя атаки
    floor_def: float = 0.25     # пол множителя обороны
    home_adv: float = 0.12      # log-преимущество хозяев (≈ +13% голов)
    form_sd: float = 0.15       # разброс формы на матч (лог-нормальный)
    balance_pen: float = 0.010  # штраф за разбалансировку линий: на каждый пункт разрыва сверх 12
    damp: float = 1.0           # 1 = реальная сила соперников, 0.7 = «ровная лига» (Normal)
    star_bonus: float = 0.0     # бонус all-star XI (нет ротации/травм), в пунктах рейтинга

class League:
    def __init__(self, standings: pd.DataFrame):
        self.st = standings.copy()
        self.st["lg_gf"] = self.st.groupby("season").gf_pg.transform("mean")
        self.st["att_mult"] = self.st.gf_pg / self.st.lg_gf
        self.st["def_mult"] = self.st.ga_pg / self.st.lg_gf
        self.base_by_season = self.st.groupby("season").lg_gf.first().to_dict()

    def opponents(self, season, replace_pos=None, damp=1.0):
        s = self.st[self.st.season == season].sort_values("pos")
        if replace_pos is None: replace_pos = int(s.pos.max())   # пользователь заменяет последнюю команду
        s = s[s.pos != replace_pos]
        opp = pd.DataFrame({"club": s.canonical_id.values, "pos_real": s.pos.values,
                            "att": np.exp(damp * np.log(s.att_mult.values)), "de": np.exp(damp * np.log(s.def_mult.values))})
        return opp

def user_multipliers(att_eff, def_eff, gap, ref_att, ref_def, p: Params):
    """перевод индексов XI в множители атаки/обороны относительно средней команды лиги"""
    pen = max(0.0, gap - 12) * p.balance_pen
    a = np.exp(p.beta_att * (att_eff + p.star_bonus - ref_att) - pen)
    d = np.exp(-p.beta_def * (def_eff + p.star_bonus - ref_def) + pen)   # <1 = пропускает меньше среднего
    return min(a, p.cap_att), max(d, p.floor_def)

def sim_match(lam_h, lam_a, rng):
    return rng.poisson(lam_h), rng.poisson(lam_a)

def simulate_season(user, opp, base, p: Params, rng):
    """user: dict(att, de) множители; opp: DataFrame(club, att, de). Полный двухкруговой турнир 16 команд."""
    teams = ["USER"] + opp.club.tolist()
    A = {"USER": user["att"]}; D = {"USER": user["de"]}
    for r in opp.itertuples(): A[r.club] = r.att; D[r.club] = r.de
    n = len(teams); pts = {t: 0 for t in teams}; gf = {t: 0 for t in teams}; ga = {t: 0 for t in teams}
    w = d = l = 0; log = []
    form = {t: 1.0 for t in teams}
    for i in range(n):
        for j in range(n):
            if i == j: continue
            h, a = teams[i], teams[j]
            fh = np.exp(rng.normal(0, p.form_sd)); fa = np.exp(rng.normal(0, p.form_sd))
            lam_h = base * A[h] * D[a] * fh * np.exp(p.home_adv)
            lam_a = base * A[a] * D[h] * fa * np.exp(-p.home_adv * 0.3)
            gh, gA = sim_match(lam_h, lam_a, rng)
            gf[h] += gh; ga[h] += gA; gf[a] += gA; ga[a] += gh
            if gh > gA: pts[h] += 3
            elif gh < gA: pts[a] += 3
            else: pts[h] += 1; pts[a] += 1
            if "USER" in (h, a):
                ug, og = (gh, gA) if h == "USER" else (gA, gh)
                res = "W" if ug > og else ("D" if ug == og else "L")
                w += res == "W"; d += res == "D"; l += res == "L"
                log.append((a if h == "USER" else h, "H" if h == "USER" else "A", ug, og, res))
    table = sorted(teams, key=lambda t: (pts[t], gf[t] - ga[t], gf[t]), reverse=True)
    return {"W": w, "D": d, "L": l, "pts": pts["USER"], "gf": gf["USER"], "ga": ga["USER"],
            "position": table.index("USER") + 1, "table": [(t, pts[t], gf[t], ga[t]) for t in table], "log": log}

# ------------------------------------------------------------------ калибровка
def fit_beta(ps: pd.DataFrame, league: League, formation="4-4-2"):
    """насколько реальные GF/GA клубов объясняются рейтингами их лучших XI (по нашим же данным)"""
    rows = []
    for (y, c), g in ps.groupby(["season", "canonical_id"]):
        xi = best_xi(g, formation)
        if xi is None: continue
        att, de, gap = team_indices(xi)
        rows.append((y, c, att, de, gap))
    idx = pd.DataFrame(rows, columns=["season", "canonical_id", "att_eff", "def_eff", "gap"])
    m = idx.merge(league.st[["season", "canonical_id", "att_mult", "def_mult", "pos", "n_clubs"]], on=["season", "canonical_id"])
    m["att_c"] = m.att_eff - m.groupby("season").att_eff.transform("mean")
    m["def_c"] = m.def_eff - m.groupby("season").def_eff.transform("mean")
    ba = np.polyfit(m.att_c, np.log(m.att_mult.clip(0.2)), 1)
    bd = np.polyfit(m.def_c, np.log(m.def_mult.clip(0.2)), 1)
    r2a = np.corrcoef(m.att_c, np.log(m.att_mult.clip(0.2)))[0, 1] ** 2
    r2d = np.corrcoef(m.def_c, np.log(m.def_mult.clip(0.2)))[0, 1] ** 2
    return {"beta_att": ba[0], "beta_def": -bd[0], "r2_att": r2a, "r2_def": r2d, "table": m}

# ------------------------------------------------------------------ драфт (симуляция колеса)
class Pool:
    def __init__(self, ps: pd.DataFrame, rating_col="rating"):
        ps = ps.copy(); ps["r"] = ps[rating_col]
        self.ps = ps
        self.by_cs = {k: g for k, g in ps.groupby(["season", "canonical_id"])}
        self.keys = list(self.by_cs.keys())

    def spin(self, need, taken, rng):
        """колесо: случайный клуб-сезон, в котором есть ещё не взятый игрок на одну из открытых позиций"""
        for _ in range(200):
            k = self.keys[rng.integers(len(self.keys))]
            g = self.by_cs[k]
            g = g[g.position_group.isin([p for p, n in need.items() if n > 0]) & ~g.person_id.isin(taken)]
            if len(g): return k, g
        raise RuntimeError("no spin")

def draft(pool: Pool, formation, rng, policy="greedy"):
    need = dict(FORMATIONS[formation]); taken = set(); xi = []
    while sum(need.values()) > 0:
        k, g = pool.spin(need, taken, rng)
        if policy == "greedy":   # берём лучшего доступного на любую открытую позицию
            row = g.sort_values("r", ascending=False).iloc[0]
        elif policy == "random":
            row = g.sample(1, random_state=int(rng.integers(1e9))).iloc[0]
        else:  # "smart": предпочитаем закрывать позицию с наибольшим приростом относительно среднего по пулу
            row = g.sort_values("r", ascending=False).iloc[0]
        xi.append((row.position_group, float(row.r), row.player_name, k)); taken.add(row.person_id); need[row.position_group] -= 1
    return xi

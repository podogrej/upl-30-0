// Макети онлайн-ліг «Грати з друзями» (11×11 і 5×5). Підключається з make.js.
module.exports = ({ page, header, I, icon, avatar, ME }) => {
  const CSS = `<style>
.lg-h{text-align:center;margin:22px 0 6px}.lg-h h1{font-size:26px;font-weight:900;letter-spacing:-.02em}
.lg-sub{text-align:center;color:var(--ink2);font-size:14px;margin:0 auto 16px;max-width:36ch}
.lg-big{width:100%;padding:15px 18px;font-family:var(--font-display);font-weight:700;font-size:16px;background:var(--pitch);border-color:var(--pitch);color:#fff;border-radius:12px}
.lg-hint{text-align:center;font-size:12px;color:var(--muted);margin:8px 0 0}
.lg-k{font-family:var(--font-mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:22px 0 8px;display:flex;justify-content:space-between}
.lg-row{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--surface);margin-bottom:8px}
.lg-row .t b{display:flex;gap:6px;align-items:center;font-size:15px}.lg-row .t span{display:block;font-size:12px;color:var(--ink2)}
.lg-tag{font-family:var(--font-mono);font-size:10px;font-weight:600;letter-spacing:.06em;padding:2px 6px;border-radius:5px;border:1px solid currentColor}
.lg-tag.f11{color:var(--df)}.lg-tag.f5{color:var(--fw)}
.lg-st{font-size:12px;font-weight:600;padding:4px 8px;border-radius:7px;background:var(--bg2);border:1px solid var(--line);white-space:nowrap}
.lg-st.hot{border-color:var(--amber);color:var(--amber)}
.lg-pl{font-family:var(--font-display);font-weight:700;font-size:18px;text-align:right}.lg-pl small{display:block;font-family:var(--font-body);font-size:11px;color:var(--muted);font-weight:600}
.lg-how{display:grid;gap:8px;margin-top:4px}.lg-how div{display:grid;grid-template-columns:auto 1fr;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font-size:13px;color:var(--ink2)}.lg-how b{color:var(--ink);display:block;font-size:14px}
.lg-opts{display:grid;grid-template-columns:1fr 1fr;gap:8px}.lg-opts.c3{grid-template-columns:repeat(3,1fr)}
.lg-o{border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:var(--surface);display:grid;gap:2px}
.lg-o b{font-size:14px}.lg-o small{font-size:11.5px;color:var(--ink2);line-height:1.3}
.lg-o.on{border-color:var(--pitch);background:color-mix(in srgb,var(--pitch) 16%,var(--surface))}.lg-o.on b{color:color-mix(in srgb,var(--pitch) 40%,var(--ink))}
.lg-o.big{padding:14px}.lg-o.big b{font-family:var(--font-display);font-size:18px}
.lg-chips{display:flex;flex-wrap:wrap;gap:6px}.lg-chip{padding:8px 12px;border:1px solid var(--line);border-radius:10px;font-size:14px;font-weight:600;background:var(--surface)}.lg-chip.on{border-color:var(--pitch);color:color-mix(in srgb,var(--pitch) 40%,var(--ink));background:color-mix(in srgb,var(--pitch) 16%,var(--surface))}
.lg-shuf{border:0;background:none;padding:6px 0;font-size:13px;color:var(--ink2);display:inline-flex;gap:6px;align-items:center}
.lg-card{border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:14px;display:grid;gap:10px}
.lg-day{display:flex;justify-content:space-between;align-items:baseline}.lg-day b{font-family:var(--font-display);font-size:18px}.lg-day span{font-family:var(--font-mono);font-size:12px;color:var(--ink2)}
.lg-dots{display:flex;gap:6px}.lg-dots i{flex:1;height:6px;border-radius:3px;background:var(--line)}.lg-dots i.d{background:var(--pitch)}.lg-dots i.now{background:var(--amber)}
.lg-tries{display:flex;gap:6px;align-items:center;font-size:13px;color:var(--ink2)}.lg-tries i{width:22px;height:22px;border-radius:6px;border:1px solid var(--line);display:grid;place-items:center;font-style:normal;font-family:var(--font-mono);font-size:11px}.lg-tries i.u{background:var(--bg2);color:var(--ink)}
.lg-tbl{border:1px solid var(--line);border-radius:12px;background:var(--surface);overflow:hidden}
.lg-tr{display:grid;grid-template-columns:22px 28px 1fr auto auto;gap:8px;align-items:center;padding:9px 12px;font-size:14px}
.lg-tr+.lg-tr{border-top:1px solid var(--line)}.lg-tr .n{font-family:var(--font-mono);color:var(--muted);font-size:12px;text-align:right}
.lg-tr .v{font-family:var(--font-display);font-weight:700;text-align:right;min-width:34px}.lg-tr .x{font-family:var(--font-mono);font-size:11px;color:var(--muted);text-align:right}
.lg-tr.me{background:color-mix(in srgb,var(--amber) 10%,var(--surface))}.lg-tr .av{border-radius:6px}
.lg-tr.hd{font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:7px 12px}
.lg-tr.g5{grid-template-columns:22px 28px 1fr 26px 26px 26px 34px}
.lg-seg{display:grid;grid-template-columns:1fr 1fr;padding:3px;border-radius:10px;background:var(--bg2);border:1px solid var(--line)}.lg-seg span{text-align:center;padding:7px;font-size:13px;border-radius:8px;color:var(--ink2)}.lg-seg span.on{background:var(--ink);color:var(--bg);font-weight:700}
.lg-link{display:flex;gap:8px}.lg-link input{flex:1;min-width:0;font:inherit;font-family:var(--font-mono);font-size:12px;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink2)}
.lg-timer{text-align:center}.lg-timer b{font-family:var(--font-display);font-size:34px;letter-spacing:.02em}.lg-timer span{display:block;font-size:12px;color:var(--ink2)}
.lg-ok{color:var(--win);font-weight:700;font-size:13px}.lg-wait{color:var(--muted);font-size:13px}
.lg-br{display:grid;gap:8px}.lg-m{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--surface);font-size:14px}
.lg-m>span:nth-child(3){text-align:right}.lg-m b{font-family:var(--font-display);font-size:17px;white-space:nowrap}.lg-m .w{font-weight:800}.lg-m small{grid-column:1/-1;text-align:center;font-size:11px;color:var(--amber);margin-top:-4px}
.lg-champ{text-align:center;padding:16px;border:1px solid var(--amber);border-radius:14px;background:color-mix(in srgb,var(--amber) 10%,var(--surface))}.lg-champ .ico{width:34px;height:34px;fill:var(--amber)}.lg-champ b{display:block;font-family:var(--font-display);font-size:20px;margin-top:4px}.lg-champ span{font-size:12px;color:var(--ink2)}
.lg-score{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;text-align:center;margin-top:14px}.lg-score b{font-family:var(--font-display);font-size:44px}.lg-score div{font-weight:700;font-size:14px}.lg-score .av{border-radius:10px;display:block;margin:0 auto 4px}
.lg-feed{display:grid;gap:0;border:1px solid var(--line);border-radius:12px;background:var(--surface);overflow:hidden;margin-top:12px}
.lg-ev{display:grid;grid-template-columns:36px 1fr;gap:8px;padding:9px 12px;font-size:14px;align-items:baseline}.lg-ev+.lg-ev{border-top:1px solid var(--line)}
.lg-ev .mn{font-family:var(--font-mono);font-size:12px;color:var(--muted)}.lg-ev.r{text-align:right;grid-template-columns:1fr 36px}.lg-ev.r .mn{order:2;text-align:right}
.lg-ev small{display:block;font-size:12px;color:var(--ink2)}
.lg-ev.var{background:color-mix(in srgb,var(--df) 10%,var(--surface))}.lg-ev.pen{background:color-mix(in srgb,var(--amber) 9%,var(--surface))}
.lg-ev .tg{font-family:var(--font-mono);font-size:10px;font-weight:600;padding:1px 5px;border-radius:4px;margin-right:4px;color:#fff;background:var(--df)}
.lg-ev .tg.p{background:var(--amber)}.lg-ev .tg.x{background:var(--loss)}
</style>`;
  const P = (t, b) => page(t, CSS + header(ME) + b);
  const av = (id, s = 24) => avatar(id, s);
  const files = {};

  // 1. Список ліг
  files.lg_1_list = P('Грати з друзями', `<div class="lg-h"><h1>Грати з друзями</h1></div>
<p class="lg-sub">Кожен збирає свою команду за однаковими правилами. Чия виявиться кращою?</p>
<button class="lg-big">Створити лігу</button><p class="lg-hint">Отримав посилання від друга? Просто відкрий його.</p>
<div class="lg-k"><span>Грають зараз</span><span>2</span></div>
<div class="lg-row">${I('account-group')}<div class="t"><b>Банка на воротах <span class="lg-tag f11">11×11</span></b><span>День 3 з 7 · 9 гравців · сьогодні 1 з 3 спроб</span></div><div class="lg-pl">2<small>місце</small></div></div>
<div class="lg-row">${I('sword-cross')}<div class="t"><b>Кубок кума <span class="lg-tag f5">5×5</span></b><span>Склади до 21:00 · 5 з 6 готові</span></div><span class="lg-st hot">02:14:37</span></div>
<div class="lg-k"><span>Завершені</span><span>3</span></div>
<div class="lg-row">${I('trophy')}<div class="t"><b>Суддю на мило <span class="lg-tag f11">11×11</span></b><span>7 днів · 11 гравців · 22.09</span></div><div class="lg-pl" style="color:var(--amber)">1<small>місце</small></div></div>
<div class="lg-row">${I('sword-cross')}<div class="t"><b>Дуель з Вітею <span class="lg-tag f5">5×5</span></b><span>1 матч · 3:2 · 19.09</span></div><div class="lg-pl">1<small>місце</small></div></div>
<button class="ghost" style="width:100%">Показати всі</button>
<div class="lg-k"><span>Як це працює</span></div>
<div class="lg-how"><div>${I('format-list-numbered')}<span><b>Ти задаєш правила</b>Один раз для всіх — чесна гра.</span></div>
<div>${I('soccer-field')}<span><b>Кожен збирає склад</b>Колесо в кожного своє.</span></div>
<div>${I('trophy')}<span><b>Найкращий перемагає</b>11×11 — очки за дні; 5×5 — справжні матчі між вами.</span></div></div>`);

  // 2. Створення
  const opt = (b, s, on, big) => `<div class="lg-o${on ? ' on' : ''}${big ? ' big' : ''}"><b>${b}</b>${s ? `<small>${s}</small>` : ''}</div>`;
  files.lg_2_create = P('Створити лігу', `<div class="lg-h"><h1>Правила ліги</h1></div>
<p class="lg-sub">Однакові для всіх. Відрізняється лише команда.</p>
<div class="lg-k"><span>Формат</span></div><div class="lg-opts">${opt('11×11', 'Ліга на кілька днів: щодня тур, очки сумуються', 1, 1)}${opt('5×5', 'Турнір: матчі між вами, фінал, пенальті', 0, 1)}</div>
<div class="lg-k"><span>Назва</span></div><div class="lg-chips"><span class="lg-chip on">Банка на воротах</span><span class="lg-chip">Кубок кума</span><span class="lg-chip">Суддю на мило</span></div>
<button class="lg-shuf">${icon('swap-horizontal')}Перемішати</button>
<div class="lg-k"><span>Тривалість</span></div><div class="lg-opts c3">${opt('1 день', '')}${opt('3 дні', '', 0)}${opt('7 днів', '', 1)}</div>
<div class="lg-k"><span>Очки за тур</span></div><div class="lg-opts">${opt('За місце', '1-й отримує стільки, скільки зіграло; останній — 1', 1)}${opt('Сума', 'очки сезону додаються', 0)}</div>
<div class="lg-k"><span>Спроби на день</span></div><div class="lg-opts">${opt('1 спроба', 'без права на помилку')}${opt('3 спроби', '', 1)}</div>
<div class="lg-k"><span>У залік туру</span></div><div class="lg-opts">${opt('Найкраща', 'твій максимум за день', 1)}${opt('Остання', 'ризиковано: переграв — замінив')}</div>
<div class="lg-k"><span>Перекрути колеса</span></div><div class="lg-opts c3">${opt('3', 'легко')}${opt('1', 'нормально', 1)}${opt('0', 'хардкор')}</div>
<div class="lg-k"><span>Рейтинги</span></div><div class="lg-opts">${opt('Видно', '', 1)}${opt('На пам\'ять', 'рейтинги приховані')}</div>
<div class="lg-k"><span>Епоха</span></div><div class="lg-opts">${opt('Усі роки', '1992–2026', 1)}${opt('З 2000-х', '2000/01–2025/26')}${opt('З 2010-х', '2010/11–2025/26')}${opt('Сучасність', 'з 2016/17')}</div>
<div style="height:18px"></div><button class="lg-big">Створити й грати</button><p class="lg-hint">Далі — посилання для друзів і твоя перша спроба.</p>`);

  // 3. Ліга 11×11
  const P11 = [['player:1290', 'Вітя', 26, 3, 8], [ME, 'Андрій', 24, 2, 9], ['player:5521', 'Ігор', 21, 1, 7], ['player:8812', 'Сашко', 17, 0, 6], ['player:3301', 'Оля', 15, 0, 5], ['player:7004', 'Макс', 12, 0, 4], ['player:2230', 'Дмитро', 9, 0, 0], ['player:6619', 'Кум', 6, 0, 3], ['player:9100', 'Тарас', 3, 0, 2]];
  const tr = (i, [id, n, v, w, t]) => `<div class="lg-tr${id === ME ? ' me' : ''}"><span class="n">${i + 1}</span>${av(id)}<span>${n}</span><span class="x">${w ? w + ' тур' + (w > 1 ? 'и' : '') : ''}</span><span class="v">${v}</span></div>`;
  files.lg_3_league11 = P('Ліга 11×11', `<div class="lg-h" style="text-align:left"><h1 style="font-size:22px">Банка на воротах <span class="lg-tag f11" style="vertical-align:4px">11×11</span></h1></div>
<p class="muted" style="font-size:13px">9 гравців · очки за місце · найкраща з 3 спроб · перекрут 1</p>
<div class="lg-card"><div class="lg-day"><b>Тур 3 з 7</b><span>до кінця туру 6:42</span></div><div class="lg-dots"><i class="d"></i><i class="d"></i><i class="now"></i><i></i><i></i><i></i><i></i></div>
<div class="lg-tries">Спроби сьогодні: <i class="u">71</i><i>2</i><i>3</i> · найкраща 71 оч → 2-е місце в турі</div>
<button class="lg-big" style="background:var(--amber);border-color:var(--amber)">Зіграти спробу 2 з 3</button></div>
<div class="lg-k"><span>Таблиця</span></div><div class="lg-seg"><span class="on">Загальна</span><span>Тур 3 · сьогодні</span></div><div style="height:8px"></div>
<div class="lg-tbl"><div class="lg-tr hd"><span>#</span><span></span><span>Гравець</span><span>Виграв</span><span style="text-align:right">Оч</span></div>${P11.map((p, i) => tr(i, p)).join('')}</div>
<p class="lg-hint" style="text-align:left">За місце в турі: 1-й отримує стільки очок, скільки гравців зіграло того дня, останній — 1. Не зіграв — 0.</p>
<div class="lg-k"><span>Запросити</span></div><div class="lg-link"><input value="upl-30-0.vercel.app/l/banka" readonly><button class="primary">${I('share-variant')}</button></div>`);

  // 4. 5×5 — очікування складів
  const L5 = [[ME, 'Андрій', 1], ['player:1290', 'Вітя', 1], ['player:5521', 'Ігор', 1], ['player:8812', 'Сашко', 1], ['player:6619', 'Кум', 1], ['player:3301', 'Оля', 0]];
  files.lg_4_lobby5 = P('5×5 — склади', `<div class="lg-h" style="text-align:left"><h1 style="font-size:22px">Кубок кума <span class="lg-tag f5" style="vertical-align:4px">5×5</span></h1></div>
<p class="muted" style="font-size:13px">6 з 10 · перекрут 1 · рейтинги видно · кожен з кожним → фінал</p>
<div class="lg-card lg-timer"><b>02:14:37</b><span>до початку турніру (21:00). Потім сервер одразу зіграє всі матчі.</span></div>
<div class="lg-card" style="margin-top:10px;grid-template-columns:auto 1fr auto;align-items:center">${I('check-circle')}<div><b>Твоя п'ятірка готова</b><div class="muted" style="font-size:12px">Суперники побачать склад лише після старту</div></div><button class="ghost">Переглянути</button></div>
<div class="lg-k"><span>Учасники</span><span>5 з 6 готові</span></div>
<div class="lg-tbl">${L5.map(([id, n, ok]) => `<div class="lg-tr" style="grid-template-columns:28px 1fr auto">${av(id)}<span>${n}</span>${ok ? '<span class="lg-ok">готовий</span>' : '<span class="lg-wait">збирає…</span>'}</div>`).join('')}</div>
<div style="height:10px"></div><button class="ghost" style="width:100%">Почати зараз (для творця)</button>
<div class="lg-k"><span>Запросити</span></div><div class="lg-link"><input value="upl-30-0.vercel.app/l/kum" readonly><button class="primary">${I('share-variant')}</button></div>`);

  // 5. 5×5 — підсумок турніру
  const G = [[ME, 'Андрій', 4, 1, 0, 13], ['player:1290', 'Вітя', 3, 1, 1, 10], ['player:5521', 'Ігор', 2, 2, 1, 8], ['player:8812', 'Сашко', 2, 0, 3, 6], ['player:6619', 'Кум', 1, 1, 3, 4], ['player:3301', 'Оля', 0, 1, 4, 1]];
  files.lg_5_result5 = P('5×5 — підсумок', `<div class="lg-h" style="text-align:left"><h1 style="font-size:22px">Кубок кума <span class="lg-tag f5" style="vertical-align:4px">5×5</span></h1></div>
<p class="muted" style="font-size:13px">Турнір зіграно · 21:00, 30.09</p>
<div class="lg-champ">${icon('trophy')}<b>Андрій</b><span>чемпіон · фінал з Вітею 2:2, пенальті 4:3</span></div>
<div class="lg-k"><span>Фінал</span></div>
<div class="lg-br"><div class="lg-m"><span class="w">Андрій</span><b>2 : 2</b><span>Вітя</span><small>пенальті 4:3</small></div></div>
<div class="lg-k"><span>Група · кожен з кожним</span></div>
<div class="lg-tbl"><div class="lg-tr g5 hd"><span>#</span><span></span><span>Гравець</span><span>В</span><span>Н</span><span>П</span><span style="text-align:right">Оч</span></div>
${G.map(([id, n, w, d, l, p], i) => `<div class="lg-tr g5${id === ME ? ' me' : ''}"><span class="n">${i + 1}</span>${av(id)}<span>${n}</span><span class="x">${w}</span><span class="x">${d}</span><span class="x">${l}</span><span class="v">${p}</span></div>`).join('')}</div>
<div class="lg-k"><span>Мої матчі</span></div>
<div class="lg-br"><div class="lg-m"><span class="w">Андрій</span><b>3 : 1</b><span>Ігор</span></div><div class="lg-m"><span>Андрій</span><b>1 : 1</b><span>Вітя</span></div><div class="lg-m"><span class="w">Андрій</span><b>2 : 0</b><span>Сашко</span></div></div>
<div style="height:14px"></div><button class="lg-big">Реванш — та сама компанія</button>`);

  // 6. 5×5 — матч
  const ev = (m, side, html, cls = '') => `<div class="lg-ev${side ? ' r' : ''}${cls ? ' ' + cls : ''}"><span class="mn">${m}'</span><span>${html}</span></div>`;
  files.lg_6_match5 = P('5×5 — матч', `<p class="muted" style="font-size:13px;margin-top:18px;text-align:center">Кубок кума · фінал</p>
<div class="lg-score"><div>${av(ME, 44)}Андрій</div><b>2 : 2</b><div>${av('player:1290', 44)}Вітя</div></div>
<p class="lg-hint" style="margin-top:2px">пенальті 4 : 3</p>
<div class="lg-seg" style="margin-top:12px"><span class="on">Наживо</span><span>Одразу підсумок</span></div>
<div class="lg-feed">
${ev(7, 0, '⚽ <b>Шевченко</b><small>асист: Ребров</small>')}
${ev(19, 1, '⚽ <b>Ярмоленко</b><small>асист: Коноплянка</small>')}
${ev(31, 0, '<span class="tg p">ПЕН</span>Суддя призначив пенальті у ворота Віті<small>фол на Реброві</small>', 'pen')}
${ev(32, 0, '<span class="tg">VAR</span>Суддя йде до монітора…<small>Рішення скасовано — симуляція. Жовта картка Реброву.</small>', 'var')}
${ev(44, 1, '⚽ <b>Коноплянка</b>')}
${ev(58, 0, '<span class="tg p">ПЕН</span>Суддя призначив пенальті<small>гра рукою</small>', 'pen')}
${ev(59, 0, '<span class="tg">VAR</span>Пенальті підтверджено', 'var')}
${ev(60, 0, '⚽ <b>Шевченко</b> з пенальті')}
${ev(90, 0, 'Кінець матчу 2:2 — серія пенальті')}
${ev('П', 0, 'Андрій: ✓ ✓ ✗ ✓ ✓ · Вітя: ✓ ✗ ✓ ✓ ✗<small><b>Андрій виграв 4:3</b></small>')}
</div>`);
  return files;
};

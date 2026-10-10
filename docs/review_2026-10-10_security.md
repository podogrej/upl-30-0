# Проверка безопасности 30-0 УПЛ — 10.10.2026 (ветка `test`, 60c7269)

**Вывод.** Утечек секретов и дыр в доступе к базе нет: RLS включён на всех таблицах, внутренние функции закрыты, у всех `security definer` задан `search_path`, вебхук бота и cron без секрета отвечают 401. Главная проблема — честность результатов. Сервер не проверяет, что состав в обычной игре собран с колеса, и даёт сколько угодно seed, а исход сезона браузер знает до сохранения. Поэтому таблица «За весь час», лиги чатов, лиги с друзьями и «Виклик другу» подделываются без взлома, одним devtools. Второе по важности: анонимный ключ читает Telegram ID и имена игроков, ID и названия Telegram-групп.

Проверено только чтением. Код и базу не трогал, в прод ушёл один запрос `curl -I` (только заголовки). SQL для основной сессии — в конце.

---

## КРИТИЧНО

### К-1. Состав в обычной игре сервер не сверяет с колесом («dream team»)
- **Где:** `api/seed.js:25-47` (проверяется только `xi.length === 11`), `api/verify.js:59-80` (проверяется, что игрок был в клуб-сезоне, рейтинг и схема). Колесо проверяется только для драфта дня (`verify.js:81-87`, `row.day`) и для виклика дня (`api/_vd.js:25-47`). Колесо обычной игры крутится в браузере (`src/template.html:1659`, `spin`, `Math.random`).
- **Атака:** взять из публичного `pool.*.js` 11 сильнейших карточек под схему (рейтинг `r` = `effRating`, его считает тот же движок), `POST /api/seed {device_id, secret, xi, formation, mode:'normal', format:'classic', year:LEAGUE_LEGENDS, league:true}`, локально `E.run(...)` с выданным seed, потом `POST /api/save {kind:'season', row:{...результат симуляции, seed_id}}`. Сервер честно пересчитывает сезон и ставит `verified=true`.
- **Затронуто:** таблица всех времён (`template.html:2341`, только `verified=is.true`), лиги чатов (`_league.js:126` `leagueFree`), лиги с друзьями 11×11 (`fl_record`), страница игрока.
- **Исправление:** колесо выдаёт сервер, как в виклике дня. Новый «старт драфта» в `/api/seed` (тело с `draft:'start'`) возвращает `seed_id` с серверным случайным seed колеса. Season seed выдаётся только составу, который проходит `checkXi`-подобную проверку: клуб-сезоны из `wheelSeq(hash(seed_id|wheel))` в пределах окна и разрешённых перекруток для режима (derby/oneclub/anti/legends/эпоха/«Вибір сезону» — свои пулы). Код `api/_vd.js` (`wheelOf`, `checkXi`) почти готов к переиспользованию. **Объём:** M–L, 2–3 дня с тестами `cheat.js` по каждому режиму. Нужен `determinism` и, вероятно, колонка `season_seeds.wheel_id` (SQL аддитивный).

### К-2. Перебор seed: исход известен до сохранения, несохранённый сезон ничего не стоит
- **Где:** `api/seed.js:46` (seed без ограничений, 20/мин на устройство, 80/мин на IP), `api/verify.js:40-43` (достаточно, что seed был выдан этому устройству). `sql/v081_leave_leagues.sql:181-184`: `fl_record` считает попытки лиги с друзьями только по **сохранённым** сезонам. В лигах чатов это закрыто: несохранённый seed сжигает попытку, `_league.js:134-142`, DECISIONS п. 11.
- **Атака:** цикл «запросить seed → `E.run` локально → если не 30-0, выбросить». Около 28 тыс. seed в сутки на одно устройство. С К-1 30-0 выпадает быстро. В лиге с друзьями `tries=1` превращается в «лучший из сотен».
- **Исправление (лучшее):** считать сезон на сервере в момент выдачи seed (`E.run` идёт миллисекунды, движок уже в `lib/engine.js`), класть результат в `season_seeds` и отдавать браузеру для анимации. `/api/save` тогда только публикует серверный результат, и любой выданный seed — сыгранный сезон. **Минимум:** для лиг с друзьями помечать seed как попытку при выдаче (`season_seeds.fl_id`, браузер уже знает `S.league`) и считать первые `tries` seed дня, как `DAY_N` в лигах чатов. **Объём:** минимум S (полдня + SQL), полный вариант M.

---

## ВЫСОКО

### В-1. 5×5 в лиге с друзьями: составы соперников видны до дедлайна, seed турнира предсказуем
- **Где:** `fl_get` отдаёт всем (anon) `fives` с составами (`sql/v081_leave_leagues.sql:49-52`) и `deadline`. Seed турнира — `E.hashStr(`${L.id}|${L.deadline}`)` (`api/fl5.js:28`), движок публичный (`lib/five_core.js` = `src/five_core.js`).
- **Атака:** последний участник читает `rpc/fl_get` (составы и дедлайн), перебирает свою пятёрку через `f5Tournament(teams, mulberry32(seed))` и отправляет выигрышную `fl5_submit`. Владелец может ещё и сдвинуть дедлайн (`fl5_start`).
- **Исправление:** до `result` возвращать в `fives` только свой состав (и число собранных), чужие — после турнира. Seed брать `crypto.randomInt` в `api/fl5.js` в момент игры (он и так сохраняется в `result.seed`, проверяемость остаётся). **Объём:** S (функция `fl_get` с той же сигнатурой + 1 строка в `fl5.js`).

### В-2. «Виклик другу»: цифры принимаются без проверки, seed вызова публичный
- **Где:** `api/save.js:84-97`: `kind:'challenge'` и `'chal_result'` берут любые `w/d/l/gf/ga/place`, проверяется только `w+d+l=30`. `challenges.seed` читается анонимно (`new_db_part_A.sql:212-213`). В аудите 0.53 это записано как «не вошло», но не исправлено.
- **Атака:** `POST /api/save {kind:'chal_result', row:{challenge_id, w:30,d:0,l:0,pts:90,place:1,gf:99,ga:0}}`. Честнее, но тоже нечестно: seed вызова известен, состав подбирается офлайн (К-1).
- **Исправление:** результат вызова — только из проверенного сезона (`season_id`, seed = seed вызова, состав с колеса вызова: `challenge.js` уже строит `wheelSeq(seed)`, значит проверка как в `_vd.js`). **Объём:** M.

### В-3. Анонимный ключ читает персональные данные: Telegram ID и имена, группы и их участников
- **Где:** политики `using (true)` без ограничения колонок: `seasons` (`device_id, tg_user_id, tg_name, user_id, seed, seed_id`), `daily_results`, `trophies` (`tg_user_id, tg_name`), `leagues` (`chat_id, title, created_by`), `league_results` (`chat_id, tg_user_id, name`), `players` (все колонки). Файлы `sql/new_db_part_A.sql:28,63,84,186,188`, `v039_part_B.sql:339`.
- **Атака:** `curl "$SB/rest/v1/seasons?select=tg_user_id,tg_name,player_id&tg_user_id=not.is.null&apikey=sb_publishable_…"` — список реальных Telegram-аккаунтов игроков с именами, связанный с профилем. `league_results?select=chat_id,tg_user_id,name` + `leagues?select=chat_id,title` — какие люди состоят в каких закрытых группах. Это спам и деанонимизация. `privacy.html:37` обещает показывать только «нік (або ім'я з Telegram), результат і склад».
- **Исправление (по п. 13 DECISIONS, в 2 шага):** 1) клиент читает через view или RPC с безопасными колонками (`seasons_pub` без `device_id/tg_*/user_id/seed*`; доски лиг — через `/api/league`, который уже отдаёт только имя и `u`); `openView` перестаёт делать `select=*`; 2) через 7 дней `revoke select on seasons, daily_results, trophies, league_results, leagues from anon, authenticated` + `grant select (безопасные колонки)` или view. **Объём:** M.

### В-4. Telegram-личность берётся из шаблона email, его можно занять заранее (условно: если в Supabase включена регистрация по почте)
- **Где:** `api/auth.js:43,47,50`: email `tg-<id>@users.upl-30-0.vercel.app`; если пользователь уже есть, сервер просто выдаёт magic link на этот адрес. `sql/v060_one_player.sql:121`: `link_account` достаёт tg id регуляркой из `auth.users.email`. В клиенте осталась ветка «пошту» (`src/account.js:170`).
- **Атака (если провайдер Email разрешает регистрацию):** `supabase.auth.signUp({email:'tg-<ID жертвы>@users.upl-30-0.vercel.app', password:'…'})`. Пользователь с паролем атакующего создан. Когда жертва входит через Telegram, `admin/users` падает («уже есть»), `generate_link` выдаёт вход в **этот же** аккаунт и подтверждает почту. Пароль атакующего продолжает работать — общий аккаунт (pre-account takeover). Если подтверждение почты выключено, атакующий сразу получает `tg`-привязку жертвы через `link_account`.
- **Исправление:** Supabase → Authentication → Providers → Email: выключить «Allow new users to sign up», если почтой не входят. В `auth.js` класть tg id в `app_metadata` (меняет только admin), `link_account` читает `raw_app_meta_data->>'tg_id'`, а не email. Если существующий пользователь с таким email имеет пароль или не-email identity — отказ. **Объём:** S. Проверка — SQL №12 ниже.

---

## СРЕДНЕ

| # | Что | Где | Атака | Исправление | Объём |
|---|---|---|---|---|---|
| С-1 | Трофеи заявляет сам браузер | `api/save.js:78-83`, `trophyIds` пропускает любой `[A-Za-z0-9_]{1,24}` | `POST /api/save {kind:'trophies', ids:[все id, включая скрытые]}` — витрина, редкость в `trophy_stats` и на странице игрока искажены | Белый список id на сервере (из `src/trophies.js` → `lib/`); трофеи за сезон считать на сервере из проверенного сезона | S / M |
| С-2 | Непроверяемые сезоны сохраняются и видны | `verify.js:34` (`version` не текущая и не из `PREV_VERSIONS` → `null`); `player_profile` берёт `verified is not false` (`v060:316`); `/r/<id>` и `?s=` показывают любой сезон (`api/r.js:12`, `template.html:2403`) | `save {row:{version:'0.01', w:30,…}}` → `verified=null`, сезон в профиле («чемпіон», «30-0»); ссылка `upl30.com.ua/r/<id>` с превью «30-0!» | На `save` отклонять `v===null` для новых записей (или не показывать `null` в профиле, превью и просмотре без пометки) | S |
| С-3 | Привязка seed к режиму обходится пустыми полями | `seed.js:47` пишет `''`/`null`; `verify.js:45-46` пропускает `null`/`''` | Seed с `mode:'', format:'', year:0` подходит к любому режиму и формату: один seed+состав пробуется везде, сохраняется лучший | В `seed.js` требовать `E.MODES[mode]`, `E.FORMATS[format]`, `E.FORMATIONS[formation]`, `year` по `yearOk` | S |
| С-4 | Гонка повторного использования seed | `verify.js:43` читает `used_by`, потом `:147-149` пишет без условия | Два параллельных `/api/save` с одним `seed_id` → оба `verified=true` (два зачёта в лиге с друзьями при `tries=3`) | Атомарно: `PATCH season_seeds?id=eq.X&used_by=is.null` с `return=representation`; пусто → `false` | S |
| С-5 | Виклик дня: всё колесо известно заранее, окно 24 вместо ~14 | `_vd.js:23-24,42-46`; колесо = `wheelSeq(hashStr(seed_id+'|wheel'))`, `seed_id` приходит на `start` | Скрипт видит 24 позиции колеса и собирает лучший по условию состав с полной информацией | Окно = 11 + перекрутки + точное число пропусков (повторить правило `eligible` на сервере) или раскрывать позиции по одной с сервера | S–M |
| С-6 | «Це ти?» на общем устройстве | `v061:194-212` (`merge_answer` → `merge_players_logged`, `prev_state`) | Кто имеет доступ к общему iPad (секрет устройства) и свой аккаунт: вход → «Так» → чужая история, её `auth`/`tg`-привязки и `user_state` переезжают к нему | «Так» только при доказанном входе в старый аккаунт (повторная авторизация src в этой же сессии) или без переноса чужих `auth`/`tg`-ссылок. Это решение владельца (DECISIONS п. 16), риск принят осознанно? | M |
| С-7 | Токены во фрагменте URL при работающем Clarity | `build.py:45-46` грузит Clarity и в Mini App; `#tgWebAppData` = initData (вход на 24 ч через `/api/auth`, `_lib.js:31`); Google-вход `flowType:'implicit'` → `#access_token` (`account.js:22`) | Если Clarity записывает полный URL, учётные данные уходят третьей стороне | Не грузить Clarity, пока в `location.hash` есть `tgWebApp`/`access_token` (или маскировать URL); `flowType:'pkce'`; срок initData для `/api/auth` — 1 ч | S |
| С-8 | Нет заголовков безопасности | `vercel.json` (`curl -I`: только HSTS без `includeSubDomains`) | Любая будущая XSS сразу уносит `upl30_dsecret` и сессию Supabase из localStorage; сайт можно встроить во фрейм | Добавить в `vercel.json` `headers` для `/(.*)`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, CSP сначала `Content-Security-Policy-Report-Only` с `frame-ancestors 'self' https://web.telegram.org` (Telegram Web встраивает Mini App во фрейм, поэтому `X-Frame-Options: DENY` нельзя), `script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://telegram.org https://www.clarity.ms`, `connect-src 'self' https://*.supabase.co https://*.clarity.ms` | S–M |
| С-9 | Вход через бота можно выманить | `bot.js:102-107`, `auth.js:30-41` | Атакующий шлёт жертве `t.me/upl30_bot?start=login_<свой токен>`. Если жертва нажмёт «Підтвердити вхід», браузер атакующего получает её сессию. Есть предупреждение, но это социальная инженерия | В сообщении бота показывать короткий код, который сайт показал у себя («на сайті має бути код 4821»), или время и устройство запроса | S |
| С-10 | Спам игроков и захват имён прямыми RPC | `player_hello`/`set_player_name` доступны anon без лимита (`v039_part_B.sql:482-483`); любой новый uuid создаёт строку `players` | Скрипт создаёт тысячи устройств и занимает все хорошие ники (имя уникально) | Вызовы через сервер с `rateLimit`, или в `set_player_name` требовать хотя бы один сезон | S–M |

## НИЗКО

- **Н-1. Текстовые поля проверенного сезона не сверяются.** `xi[].n`, `tbl[].n`, `g/a/rt/f` (`save.js:23-25`, `verify.js` сверяет только `id/slot/c/y/r/r0`). В «проверенном» сезоне можно написать любое имя игрока (до 60 символов): оно выводится экранированным в просмотре, «улюблений гравець» (`player_profile`) и черновике еженедельного поста («Найчастіше брали», `_channel.js:220`; пост одобряет админ). Исправление: в verify перезаписывать `n` из пула, `tbl` и статистику — из симуляции. S.
- **Н-2. Правила честности только в браузере.** Флаг `show_r` и правило лиги «рейтинги по пам'яті». S, после К-1.
- **Н-3. Ответы с ошибками раскрывают внутренности.** `crash at <stage>: db 4xx: <тело PostgREST>`: `save.js:100`, `seed.js:63`, `verify.js:168`, `auth.js:22,48,52,55`, `league.js:82`, `card.js:103`. Логировать на сервере, клиенту — общий текст. S.
- **Н-4. У `/api/league` нет лимита запросов.** GET/POST без `rateLimit`; GET без `card=1` вычитывает всю историю лиги (`sbAll`, до 100 страниц). Кэш CDN обходится лишним параметром `&x=1`. Добавить `rateLimit` и игнорировать лишние параметры. S.
- **Н-5. `/api/card` хранит любые картинки от имени бота.** Любой пользователь Telegram (валидный initData) заливает до 3,5 МБ в публичный bucket `cards` и в служебный канал `TG_CARDS_CHAT`, подпись тоже любая. Это хостинг и спам от имени бота. Проверять сигнатуру JPEG/PNG и размеры, лимит по tg id, подпись собирать на сервере. S.
- **Н-6. Отзывы в боте без лимита.** Любой пользователь пересылает админу сколько угодно сообщений (`bot.js:28-44`). Лимит, например 20 в час на tg id. S.
- **Н-7. Старые таблицы 5×5 открыты на запись.** `f5_rooms`/`f5_players`/`f5_picks` (`v039_part_B.sql:312-327`): anon может insert/update, сайт ими больше не пользуется. Снять политики (в 2 шага). S.
- **Н-8. `/r/<id>` строит ссылки из заголовка запроса.** Хост берётся из `x-forwarded-host` (`r.js:41`), ответ кэшируется на сутки. Использовать белый список (`upl30.com.ua`, `upl-30-0.vercel.app`). S.
- **Н-9. Внешние скрипты без SRI.** `supabase-js@2.45.4` с jsdelivr (`account.js:15`) подключён без `integrity`. Добавить `sri`. S.
- **Н-10. Мелочи конфигурации.**
  - HSTS без `includeSubDomains; preload`.
  - `ipOf` (`_device.js:42`) берёт первый адрес из `x-forwarded-for`; надёжнее `x-real-ip` или `x-vercel-forwarded-for`.
  - В workflow нет блока `permissions: contents: read`.
  - Сравнение подписи initData не постоянно по времени (`_lib.js:30`), практически неважно.
- **Н-11. Тестовое окружение держит боевой ключ бота.** Тестовый Vercel хранит боевой `TG_TOKEN` (один бот на две базы, `bot.js:86-90`). Достаточно держать доступ к Preview-переменным узким.

## Проверено — в порядке
- **Секреты.** В файлах и во всей истории git (412 коммитов) нет `sb_secret_`, JWT service_role, токена бота, `GOCSPX-`, `ghp_`. В коде только публичные `sb_publishable_…` и адреса баз — это допустимо. Workflow CI на `pull_request` без секретов. `channel.yml` берёт `CHANNEL_SECRET` из secrets.
- **Сервер.**
  - Вебхук бота сверяет `x-telegram-bot-api-secret-token` через `timingSafeEqual`; без `TG_SECRET` отвечает 401 (`bot.js:58-60`).
  - `/api/cron` и `/api/backup` требуют `CRON_SECRET` и без него закрыты (fail closed); `?task=channel` — `CHANNEL_SECRET`.
  - Команды канала проверяют `OWNER_TG_ID`, кнопка подтверждения входа — только в своём личном чате.
  - Подпись initData проверяется правильно (HMAC `WebAppData`, срок).
  - Вход в лигу группы — только участнику группы (`getChatMember`).
- **Инъекции в фильтры PostgREST.** Все подставляемые значения проверены заранее: uuid по `uuidRe`, даты по `dayRe`, `login_token` — hex, `chat` в `/api/league` — только цифры, `season_id`/`id` — числа, `seed_id` — `encodeURIComponent`. Инъекций не нашёл.
- **База.**
  - RLS включён на всех 33 таблицах из `sql/`. Новые таблицы созданы без политик и с `revoke all`.
  - Все `security definer` функции имеют `set search_path = public`.
  - Служебные функции закрыты от anon/authenticated: `device_check`, `device_ok`, `merge_players*`, `player_for_*`, `fl_record`, `fl5_store`, `rate_hit`, `vd_mine`.
  - Записи доступны anon только через RPC с секретом устройства.
  - Секрет устройства — 192 бита из `crypto.getRandomValues`, в базе хранится его sha256.
  - К6 (захват старого устройства) закрыт.
- **Клиент (XSS).** Выборочно проверены места, где в `innerHTML` идут данные из базы:
  - `viewHtml` и `pitchHtml`, доски, лиги, страница игрока, 5×5 — везде `esc()` или `numOr0`/`Number`, в остальных местах `textContent`.
  - Атрибутов в одинарных кавычках с подстановкой нет (`esc` не экранирует `'`, но это и не нужно).
  - В текстах Telegram с HTML-разметкой имена проходят через `esc`; `/api/r` экранирует.
  - Открытых редиректов и `postMessage` не нашёл.
- **CORS.** У API нет CORS-заголовков, поэтому чужой сайт не прочитает ответ. Простые POST без секрета или initData ничего не дают.

---

## SQL для основной сессии (только чтение; сначала тестовая база, потом основная)

```sql
-- 1. RLS on all tables and views in public
select c.relname, c.relkind, c.relrowsecurity rls, c.relforcerowsecurity force_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p','v','m') order by c.relrowsecurity, c.relname;

-- 2. All policies (public and storage)
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname in ('public','storage') order by 1, 2, 3;

-- 3. Table grants to anon / authenticated / PUBLIC (RLS without policies still blocks, but this shows the attack surface)
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) privs
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated','PUBLIC')
group by 1, 2 order by 1, 2;

-- 4. Column-level grants (do sensitive columns stay readable)
select table_name, column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and grantee in ('anon','authenticated')
  and column_name in ('device_id','tg_user_id','tg_name','user_id','seed','seed_id','secret_hash','email','chat_id','created_by')
order by 1, 2, 3;

-- 5. Functions: who can execute, security definer, search_path, owner
select p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef secdef, p.proconfig,
       has_function_privilege('anon', p.oid, 'execute') anon_x,
       has_function_privilege('authenticated', p.oid, 'execute') auth_x,
       pg_get_userbyid(p.proowner) owner, p.provolatile
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by anon_x desc, auth_x desc, p.proname;

-- 6. Security definer functions without search_path (expected: empty)
select p.oid::regprocedure
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');

-- 7. Functions callable by anon that are not in the expected list (expected: game_stats, trophy_stats, player_hello,
--    set_player_name, set_player_auto_name, set_player_contact, delete_player, player_profile, player_profile_pub,
--    fl_get, fl_mine, tg_leagues_mine, tg_league_leave + helper name_* / fl_today / anon_name)
select p.oid::regprocedure, p.prosecdef
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
  and p.prorettype <> 'trigger'::regtype
  and p.proname not in ('game_stats','trophy_stats','player_hello','set_player_name','set_player_auto_name','set_player_contact',
                        'delete_player','player_profile','player_profile_pub','fl_get','fl_mine','tg_leagues_mine','tg_league_leave',
                        'name_key','name_translit','name_problem','name_clean','name_blocked','fl_today','anon_name')
order by 1;

-- 8. Default privileges (what new tables/functions get automatically)
select pg_get_userbyid(defaclrole) role, defaclnamespace::regnamespace schema, defaclobjtype, defaclacl from pg_default_acl;

-- 9. Views in public and their security_invoker
select c.relname, c.reloptions from pg_class c where c.relkind = 'v' and c.relnamespace = 'public'::regnamespace;

-- 10. Storage: buckets and object policies
select id, public, file_size_limit, allowed_mime_types from storage.buckets;
select policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'storage' and tablename = 'objects';

-- 11. Sequences open to anon
select c.relname, has_sequence_privilege('anon', c.oid, 'usage') anon_usage
from pg_class c where c.relkind = 'S' and c.relnamespace = 'public'::regnamespace order by 2 desc, 1;

-- 12. (V-4) Telegram accounts with a password or a non-email identity: should be 0
select count(*) filter (where coalesce(u.encrypted_password, '') <> '') with_password,
       count(*) filter (where u.email_confirmed_at is null) unconfirmed,
       count(*) total
from auth.users u where u.email like 'tg-%@users.upl-30-0.vercel.app';
select i.provider, count(*) from auth.identities i group by 1 order by 2 desc;

-- 13. (C-1/C-2) Signs of seed shopping: many seeds per device per day, few saved seasons
select device_id, day, count(*) issued, count(used_by) used
from season_seeds where vd_day is null and created_at > now() - interval '14 days'
group by 1, 2 having count(*) >= 30 order by 3 desc limit 30;

-- 14. (C-1) Signs of a "dream team": verified seasons with an unusually high average rating
select s.id, s.created_at::date, s.w, s.pts, s.player_id,
       (select round(avg((x->>'r')::numeric), 1) from jsonb_array_elements(s.xi) x where (x->>'r') ~ '^\d+(\.\d+)?$') avg_r
from seasons s where s.verified and not s.practice and s.created_at > now() - interval '30 days'
order by avg_r desc nulls last limit 30;

-- 15. (C-2 issue) Unverifiable seasons with high results (counted in the player profile)
select count(*) n, count(*) filter (where w = 30) perfect
from seasons where verified is null and created_at > '2026-10-01';

-- 16. (S-4) One seed in several verified seasons (expected: empty)
select seed_id, count(*) from seasons where verified and seed_id is not null group by 1 having count(*) > 1 limit 20;

-- 17. (V-2) Challenge results without a match to a verified season (all of them now)
select count(*) from challenge_results where created_at > now() - interval '30 days';

-- 18. (S-10) Players with no history at all (spam via player_hello)
select count(*) from players p
where not exists (select 1 from seasons s where s.player_id = p.id) and p.created_at > now() - interval '30 days';

-- 19. (N-7) Is anyone using the old f5_* tables
select (select max(created_at) from f5_rooms) last_room, (select count(*) from f5_rooms) rooms;

-- 20. Devices without a secret (K6: the remaining risk of claiming them)
select count(*) filter (where secret_hash is null) no_secret, count(*) total from player_links where kind = 'device';
```

Не через SQL (в панели Supabase): Authentication → Providers → Email («Allow new users to sign up», «Confirm email»), Anonymous sign-ins (должно быть выключено), Auth → URL Configuration (Redirect URLs — только свои домены).

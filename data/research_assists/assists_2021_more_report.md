# Асисти УПЛ 2021/22 — 14 клубів (assists_2021_more): звіт

Дата: 2026-09-29. **Результат: 0 з 14 клубів. Рядків записано: 0** (у `assists_2021_more.csv` лише заголовок).
Чисел не вигадували. Жодне джерело з асистами 2021/22 для цих клубів не вдалося відкрити в межах ліміту в 6 пошуків.

## Підсумок по клубах

Усі 14 клубів — **MISSING**. Джерела немає, збігів 0, перевірку голів не проводили.

| club | наших гравців | сума наших голів (для майбутньої перевірки) | статус |
|---|---|---|---|
| chornomorets-odesa | 26 | 20 | missing |
| desna-chernihiv | 24 | 22 | missing |
| dnipro-1 | 22 | 34 | missing |
| inhulets-petrove | 23 | 13 | missing |
| kolos-kovalivka | 27 | 14 | missing |
| metalist-1925 | 27 | 16 | missing |
| minaj | 23 | 12 | missing |
| oleksandriya | 24 | 19 | missing |
| pfk-lviv | 25 | 13 | missing |
| rukh-lviv | 28 | 15 | missing |
| shakhtar-donetsk | 27 | 48 | missing |
| veres-rivne | 20 | 15 | missing |
| vorskla-poltava | 26 | 27 | missing |
| zorya-luhansk | 25 | 37 | missing |

## Що перевірили (6 пошуків використано)

1. **Сторінка статистики турніру sports.ru** `https://www.sports.ru/football/tournament/upl/stat/`. Відкривається, id сезонів у селекторі є: **2021/2022 = `?s=8716`** (2020/21 = 8113, 2022/23 = 327209). Але і `?s=8716`, і `?season=8716` сервер ігнорує: завжди показує 2026/27. До того ж там лише топ-10.
2. **Бомбардири sports.ru** `https://www.sports.ru/upl/bombardiers/`. Відкривається. Повна таблиця на 50 рядків на сторінку, зі стовпцем передач, сортування `s=goal_and_pass`. Сезон у селекторі — `https://www.sports.ru/football/tournament/upl/bombardiers/?season=8716`, але:
   - `/upl/bombardiers/?season=8716` (і `?p=1&s=goals&d=1&season=8716`) показує 2026/27, бо параметр губиться на редиректі або ігнорується;
   - шлях `/football/tournament/upl/bombardiers/` не пропускає provenance.
   Якщо цей шлях з'явиться у видачі WebSearch, **одна-дві сторінки дадуть асисти всієї ліги 2021/22** (лише для гравців, які є в списку бомбардирів/Г+П).
3. **Клубні сторінки sports.ru.** `https://www.sports.ru/shakhtar/stat/` відкривається, але показує поточний сезон, і `?season=` ігнорується. Сезон задається шляхом `/football/club/shakhtar/stat/2021-2022/1047796/?tid=53`, а цей шлях provenance відхиляє. `…/kolos-kovalivka/stat/2022/` — це насправді поточний сезон (6 турів, Тахірі, Ндукве), не 2021/22. `…/dynamo-kiev/stat/2021-2022/` відкривається й досі (відомий з минулої сесії).
4. **soccer365.** `https://soccer365.ru/competitions/14/2021-2022/` є у видачі, але редиректить на загальний індекс змагань. Сторінки клубів `clubs/<id>/&tab=players` для цих 14 клубів у видачу не потрапили.
5. **Provenance:** URL, які з'являються лише у **виводі WebFetch**, *не* відкриваються (перевірено на bombardiers `?season=8716` і `football/club/desna/stat/`). Відкривається тільки те, що повернув WebSearch (або вже відоме в сесії).

## Що потрібно, щоб добрати дані

Найдешевший варіант — **1 пошук**, який поверне `https://www.sports.ru/football/tournament/upl/bombardiers/` (або `…/upl/bombardiers/2021-2022/`). Далі міняти лише query: `?season=8716&s=goal_and_pass&d=1&p=1..N`. Так з'являться асисти всіх результативних гравців ліги. Гравцям без Г+П можна ставити 0, коли сума асистів клубу зійдеться.

Інакше — по одному пошуку (або URL, вставленому користувачем) на клуб: `https://www.sports.ru/football/club/<slug>/stat/2021-2022/`. Підтверджені slug-и: `shakhtar`, `zorya`, `vorskla`, `oleksandria`, `desna`, `kolos-kovalivka` (Дніпро-1 на sports.ru є лише як тег `/tags/161065674/`). Slug-и Руху, Інгульця, Миная, Вереса, Чорноморця, Металіста 1925, ПФК Львів не перевірені.

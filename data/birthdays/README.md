Дати народження всіх гравців пулу (4547 осіб, після склейки P.alias): `player_birthdays.csv`.
Колонки: person_id, name_uk, date_of_birth, source, confidence, note, upl_apps. high = точна дата; low = лише рік/часткова дата/конфлікт.
Джерела по порядку: id вигляду `w:YYYY-MM-DD:slug` (дата вже в пулі), Wikidata (P2446, SPARQL, пачки по 150), сторінки Transfermarkt (≤1 запит/с) для решти.
Конфлікти Wikidata і TM пишуться в колонку note (перевірялися лише ті, кого брали з обох джерел).
Покриття: див. останній рядок виводу `collect.py` (exact = точних дат); решта без дати — у CSV з порожнім date_of_birth.
Перезапуск: `python3 data/birthdays/collect.py` (етапи wd|tm|csv|all); прогрес у `.cache/*.json`, повторний запуск продовжує.
Код гри скрипт не змінює, читає лише `pool.*.js` у корені.

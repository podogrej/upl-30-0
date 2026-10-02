-- 0.68 (владелець 02.10: «Мої ліги» порожні, хоча ліги створено): fl_mine позначено stable, тож PostgREST
-- запускає її в транзакції лише для читання, а device_check усередині робить SELECT … FOR UPDATE / INSERT →
-- «cannot execute SELECT FOR UPDATE in a read-only transaction». Сайт ловив помилку й показував порожній список
-- (і на сторінці гравця, і в «Ліга з друзями»). Лікування — volatile, як у всіх RPC з device_check.
-- Можна запускати повторно; попередню версію сайту не ламає (тіло й параметри функції ті самі).
alter function public.fl_mine(uuid, text) volatile;

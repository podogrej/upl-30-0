#!/bin/bash
# пересоздать тестовую базу со всеми SQL до players.sql и старыми данными
cd /home/claude/upl-dataset/game
P="psql -h /tmp -p 5439 -U postgres -q"
$P -c "drop database if exists t1" -c "create database t1" >/dev/null 2>&1
$P -d t1 -v ON_ERROR_STOP=1 -f /var/tmp/pgtest/stub.sql >/dev/null 2>&1
for f in seasons daily telegram trophies accounts leagues challenges anticheat tg_login five; do $P -d t1 -v ON_ERROR_STOP=1 -f sql/$f.sql >/dev/null 2>/var/tmp/pgtest/err.txt || { echo "FAIL $f"; cat /var/tmp/pgtest/err.txt | grep -v NOTICE; }; done
$P -d t1 -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into auth.users(id,email) values ('11111111-1111-1111-1111-111111111111','tg-555@users.upl-30-0.vercel.app'),('22222222-2222-2222-2222-222222222222','a@gmail.com');
insert into seasons(device_id,nickname,mode,format,formation,w,d,l,pts,place,gf,ga,created_at) values
 ('aaaaaaaa-0000-0000-0000-000000000001','Andrii','normal','classic','4-4-2',20,5,5,65,2,60,30,now()-interval '2 day'),
 ('aaaaaaaa-0000-0000-0000-000000000001','Andrii P','normal','classic','4-4-2',22,5,3,71,1,65,20,now()-interval '1 day'),
 ('bbbbbbbb-0000-0000-0000-000000000002',null,'hard','classic','4-3-3',15,5,10,50,5,40,35,now()-interval '3 day'),
 ('cccccccc-0000-0000-0000-000000000003','Tg Guy','normal','classic','4-3-3',25,5,0,80,1,80,10,now());
update seasons set user_id='11111111-1111-1111-1111-111111111111' where device_id in ('bbbbbbbb-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003');
insert into daily_results(day,device_id,nickname,w,d,l,pts,place,gf,ga) values ((now() at time zone 'Europe/Kyiv')::date,'aaaaaaaa-0000-0000-0000-000000000001','Andrii',20,5,5,65,2,60,30);
insert into leagues(chat_id,title) values (-100,'G');
insert into league_results(chat_id,day,tg_user_id,name,w,d,l,pts,place,gf,ga) values (-100,'2026-09-28',555,'Tg Guy',20,5,5,65,2,50,20);
SQL

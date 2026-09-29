# Розтягування верху шкали рейтингу (90+). Раніше найкращий у кожному (сезон, лінія) автоматично отримував 99 — 136 карток «99», а 97–98 не було взагалі.
# Тепер картки з рейтингом ≥90 перераховуються за «перевагою над своїм сезоном»: z-оцінка сирого бала (raw_score) всередині (сезон, лінія),
# і розкладаються за цільовою гістограмою: 99 — 10 карток, 98 — 15, 97 — 25 … 90 — решта. Кількість карток 90+ не змінюється.
import json, collections, pandas as pd, numpy as np
ROOT='/home/claude/upl-dataset'
d=json.load(open(f'{ROOT}/game/pool.json'))
r=pd.read_csv(f'{ROOT}/data_v2/ratings_player_seasons.csv')
r['E']=r.groupby(['season','position_group']).raw_score.transform(lambda s:(s-s.mean())/s.std(ddof=0))
r['w']=(r.apps.fillna(0)/8).clip(upper=1)
by_id={(int(a.season),a.canonical_id,a.person_id):a for a in r.itertuples()}
by_nm={(int(a.season),a.canonical_id,a.display_uk):a for a in r.itertuples()}
tail=[]
for c in d['clubs']:
  for p in c['pl']:
    if p[2]>=90:
      a=by_id.get((c['y'],c['c'],p[5])) or by_nm.get((c['y'],c['c'],p[0].split(' (')[0]))
      S=(a.E*a.w) if a is not None and pd.notna(a.E) else (p[2]-90)/4
      tail.append((S,p[2],c,p))
TARGET=[(99,10),(98,15),(97,25),(96,35),(95,50),(94,65),(93,85),(92,110),(91,140)]
# квоти — окремо для кожної лінії (ВР/ЗХ/ПЗ/НП) пропорційно до її частки у верху, інакше всі 99 забирають нападники (у них найдовший «хвіст» голів)
N=len(tail);cum=[];s=0
for rt,n in TARGET: s+=n;cum.append((rt,s/N))
grp=collections.defaultdict(list)
for t in tail: grp[t[3][1]].append(t)
out=[]
for g,items in grp.items():
  items.sort(key=lambda t:(-t[0],-t[1]));m=len(items)
  for k,t in enumerate(items):
    q=(k+0.5)/m;rt=next((rt for rt,c in cum if q<=c),90);out.append((rt,t))
before=collections.Counter(t[1] for t in tail)
for rt,(S,old,c,p) in out: p[2]=rt
after=collections.Counter(rt for rt,_ in out)
json.dump(d,open(f'{ROOT}/game/pool.json','w'),ensure_ascii=False,separators=(',',':'))
print('tail',len(tail),'before',dict(sorted(before.items(),reverse=True)))
print('after',dict(sorted(after.items(),reverse=True)))
print('top 99:',[(p[0],c['n'],c['y'],p[6]) for rt,(S,old,c,p) in out if rt==99])

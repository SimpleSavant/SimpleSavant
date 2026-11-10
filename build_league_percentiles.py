"""Generate comparable league percentiles for ERA/WHIP from supplied MLB season data.
Only pitchers with >=30 IP are compared; lower ERA/WHIP is better.
"""
from pathlib import Path
from bisect import bisect_left, bisect_right
import json, math
root=Path(__file__).resolve().parent
index=json.loads((root/'data/players.json').read_text(encoding='utf8'))
players=[]
for entry in index:
    try: players.append(json.loads((root/'data/players'/f"{entry['id']}.json").read_text(encoding='utf8')))
    except (FileNotFoundError, ValueError): pass
for year in sorted({year for p in players for year in p.get('seasons',{})}):
    records=[]
    for p in players:
        pitching=p.get('seasons',{}).get(year,{}).get('pitching') or {}
        try:
            ip=float(pitching.get('inningsPitched','0').replace('.1','.3333').replace('.2','.6667'))
        except (TypeError,ValueError,AttributeError): ip=0
        if ip<30: continue
        values={}
        for key in ('era','whip'):
            try:
                n=float(pitching[key])
                if math.isfinite(n):values[key]=n
            except (KeyError,TypeError,ValueError):pass
        if values: records.append((p['id'],values))
    sorted_values={key:sorted(vals[key] for _,vals in records if key in vals) for key in ('era','whip')}
    values={}
    for pid,stats in records:
        result={}
        for key,v in stats.items():
            group=sorted_values[key]
            if len(group)<2:continue
            # 0 best? NO: lower ERA/WHIP should be higher percentile.
            lower=bisect_left(group,v); upper=bisect_right(group,v)
            result[key]=round(100*(len(group)-(lower+upper)/2)/(len(group)-1))
            result[key]=max(0,min(100,result[key]))
        values[pid]=result
    (root/'data'/f'league-percentiles-{year}.json').write_text(json.dumps(values,separators=(',',':')),encoding='utf8')
    print(year, len(records),'eligible pitchers')

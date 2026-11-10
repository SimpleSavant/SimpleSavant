"""Add REAL season-level Baseball Savant metric values to SimpleSavant JSON.

Run inside SimpleSavant (after extracting the website ZIP):
  py -3.11 -m pip install requests
  py -3.11 enrich_raw_stats.py --start 2021 --end 2026

Uses Baseball Savant's Custom Leaderboard CSV, not pitch-by-pitch downloads.
Matches strictly by MLBAM player_id. Never treats percentiles as raw values.
All downloaded values remain missing if Baseball Savant does not return them.
"""
import argparse
import csv
import io
import json
import math
import statistics
import time
from collections import defaultdict
from pathlib import Path

import requests

BASE = 'https://baseballsavant.mlb.com/leaderboard/custom'
HERE = Path(__file__).resolve().parent
PLAYER_DIR = HERE / 'data' / 'players'
FIELDS = {
    'batting': [
        'xslg', 'barrel_batted_rate', 'hard_hit_percent',
        'xba', 'xwoba', 'squared_up_swing', 'oz_swing_percent',
        'k_percent', 'bb_percent', 'whiff_percent',
        'avg_swing_speed', 'exit_velocity_avg',
    ],
    'pitching': [
        'xera', 'xba', 'exit_velocity_avg', 'hard_hit_percent',
        'barrel_batted_rate', 'groundballs_percent',
        'oz_swing_percent', 'k_percent', 'bb_percent',
        'whiff_percent', 'velocity', 'release_extension',
    ],
}
PERCENT_FIELDS = {
    'barrel_batted_rate', 'hard_hit_percent', 'squared_up_swing',
    'oz_swing_percent', 'k_percent', 'bb_percent', 'whiff_percent',
    'groundballs_percent',
}


def number(text):
    if text is None:
        return None
    s = str(text).strip().replace(',', '').replace('%', '')
    if not s or s.lower() in {'null', 'none', 'nan', 'n/a', '--', '-', '.---'}:
        return None
    try:
        n = float(s)
        return n if math.isfinite(n) else None
    except ValueError:
        return None


def download(session, role, year):
    params = {
        'type': 'pitcher' if role == 'pitching' else 'batter',
        'year': year,
        'filter': '',
        'min': 1,  # Include lower-workload players where the source has data.
        'selections': ','.join(FIELDS[role]),
        'chart': 'false',
        'csv': 'true',
    }
    last_exc = None
    for attempt in range(1, 4):
        try:
            response = session.get(BASE, params=params, timeout=75)
            response.raise_for_status()
            body = response.text.lstrip('\ufeff\n\r ')
            if body.lower().startswith('<!doctype') or body.lower().startswith('<html'):
                raise RuntimeError('Source returned HTML instead of CSV')
            reader = csv.DictReader(io.StringIO(body))
            if not reader.fieldnames or 'player_id' not in reader.fieldnames:
                raise RuntimeError(f'Unexpected CSV headers: {reader.fieldnames}')
            rows = list(reader)
            if not rows:
                raise RuntimeError('No CSV rows returned')
            return rows
        except (requests.RequestException, RuntimeError) as exc:
            last_exc = exc
            print(f'    Attempt {attempt}/3 failed: {exc}', flush=True)
            if attempt < 3:
                time.sleep(attempt * 3)
    raise RuntimeError(f'Failed downloading {year} {role}: {last_exc}')


def parse_rows(rows, role):
    """CSV headers use the same snake_case keys as Savant selection names."""
    parsed = {}
    for row in rows:
        player_id = str(row.get('player_id', '')).strip()
        if not player_id.isdigit():
            continue
        values = {}
        for field in FIELDS[role]:
            n = number(row.get(field))
            if n is not None:
                values[field] = n
        parsed[player_id] = values

    # Some CSV versions return rate fractions (0.25) rather than 25.0%; use
    # the distribution across *all rows* to detect that representation.
    for field in PERCENT_FIELDS.intersection(FIELDS[role]):
        samples = [v[field] for v in parsed.values() if field in v and v[field] > 0]
        if len(samples) >= 10 and statistics.median(samples) < 1:
            for entry in parsed.values():
                if field in entry:
                    entry[field] = round(entry[field] * 100, 4)
    return parsed


def percentile_rank(value, reference):
    if not reference or value is None:
        return None
    # Midrank with ties. 0 and 100 are possible, higher values rank higher.
    lower = sum(other < value for other in reference)
    equal = sum(other == value for other in reference)
    return round(100 * (lower + (equal - 1) / 2) / (len(reference) - 1)) if len(reference) > 1 else None


def enrich(role, year, raw_by_id):
    changed=0
    loaded = {}
    for player_id, new_data in raw_by_id.items():
        path = PLAYER_DIR / f'{player_id}.json'
        if not path.is_file():
            continue
        player = json.loads(path.read_text(encoding='utf-8'))
        record = player.get('seasons', {}).get(str(year))
        if not record or role not in record:
            continue
        old = record.setdefault(role + '_raw', {})
        before = dict(old)
        old.update(new_data)
        if old != before:
            loaded[player_id] = (path, player)
            changed += 1

    if role == 'pitching':
        # Ground-ball rate and extension do not occur in standard Savant
        # percentile JSON. Derive *separate*, clearly labeled league ranks,
        # using >=30 IP pitchers as a reference cohort. No invented raw data.
        for field, score_key in [('groundballs_percent', 'gb'), ('release_extension', 'extension')]:
            cohort = []
            for pid, raw in raw_by_id.items():
                if field not in raw: continue
                path = PLAYER_DIR / f'{pid}.json'
                if not path.exists(): continue
                p = loaded[pid][1] if pid in loaded else json.loads(path.read_text(encoding='utf-8'))
                ip = p['seasons'].get(str(year), {}).get('pitching', {}).get('outs')
                if number(ip) is not None and number(ip) >= 90:
                    cohort.append(raw[field])
            if len(cohort) < 10:
                print(f'    Skipped derived {score_key} percentile: too few qualified pitchers')
                continue
            for pid, raw in raw_by_id.items():
                if field not in raw: continue
                path = PLAYER_DIR / f'{pid}.json'
                if not path.exists(): continue
                p = loaded[pid][1] if pid in loaded else json.loads(path.read_text(encoding='utf-8'))
                rec = p['seasons'].get(str(year), {})
                ip_outs = number(rec.get('pitching', {}).get('outs'))
                if not rec.get('pitching') or ip_outs is None or ip_outs < 90:
                    continue
                extra = rec.setdefault('pitching_extra_percentiles', {})
                rank = percentile_rank(raw[field], cohort)
                if rank is not None and extra.get(score_key) != rank:
                    extra[score_key] = rank
                    loaded[pid] = (path,p)
    for path,player in loaded.values():
        path.write_text(json.dumps(player,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    return changed,len(loaded)


def main():
    parser = argparse.ArgumentParser(description='Download actual Baseball Savant stats for SimpleSavant')
    parser.add_argument('--start', type=int, default=2021)
    parser.add_argument('--end', type=int, default=2026)
    args = parser.parse_args()
    if args.end < args.start:
        parser.error('--end must be >= --start')
    if not PLAYER_DIR.exists():
        parser.error(f'Missing {PLAYER_DIR}; run from your extracted website folder')
    session = requests.Session()
    session.headers.update({'User-Agent':'SimpleSavant educational student project (statcast CSV download)', 'Accept':'text/csv,*/*'})
    failures=[]
    for year in range(args.start,args.end+1):
        for role in ('batting','pitching'):
            print(f'Fetching actual {year} {role} values from Baseball Savant...',flush=True)
            try:
                rows=download(session,role,year)
                parsed=parse_rows(rows,role)
                changed,updated=enrich(role,year,parsed)
                print(f'  {len(rows)} CSV rows; {changed} player-seasons enriched; {updated} files updated.',flush=True)
            except Exception as exc:
                failures.append(f'{year} {role}: {exc}')
                print(f'  ERROR: {exc}',flush=True)
            time.sleep(.7)
    if failures:
        print('\nSome downloads failed:\n'+'\n'.join(failures))
        raise SystemExit(1)
    print('\nDone. Reload your website to see real advanced-stat values.')

if __name__=='__main__':
    main()

#!/usr/bin/env python3
"""Batch-clean station CSV variants and replace data/stations.csv with a fixed UTF-8 quoted file.

Behavior:
- Look for known station CSV files: `data/stations.utf8.csv`, `data/stations.csv`, `data/stations.clean.csv`.
- For the first existing file, parse lines defensively (handle extra commas in `long_name`) and write `data/stations.fixed.csv` (UTF-8, quoted).
- Backup existing `data/stations.csv` to `data/stations.csv.bak` (if present) before overwriting.
"""
from pathlib import Path
import csv
import shutil
import sys

DATA = Path('data')
CANDIDATES = [DATA / 'stations.utf8.csv', DATA / 'stations.csv', DATA / 'stations.clean.csv']
SRC = None
for p in CANDIDATES:
    if p.exists():
        SRC = p
        break

if SRC is None:
    print('No source stations CSV found among candidates:', CANDIDATES)
    sys.exit(1)

DST = DATA / 'stations.fixed.csv'
print('Cleaning', SRC, '->', DST)
rows = []
with SRC.open('r', encoding='utf-8', errors='replace') as fh:
    header = fh.readline().strip()
    for line in fh:
        line = line.rstrip('\n\r')
        if not line.strip():
            continue
        parts = line.split(',')
        if len(parts) < 6:
            parts += [''] * (6 - len(parts))
        code = parts[0]
        region = parts[1]
        short_name = parts[-3]
        latitude = parts[-2]
        longitude = parts[-1]
        long_name = ','.join(parts[2:-3])
        rows.append([code, region, long_name, short_name, latitude, longitude])

with DST.open('w', encoding='utf-8', newline='') as out:
    w = csv.writer(out, quoting=csv.QUOTE_MINIMAL)
    w.writerow(['code', 'region', 'long_name', 'short_name', 'latitude', 'longitude'])
    w.writerows(rows)

print(f'Wrote {len(rows)} stations to {DST}')
# Backup existing data/stations.csv if present
ORIG = DATA / 'stations.csv'
if ORIG.exists():
    backup = DATA / ('stations.csv.bak')
    shutil.copy2(ORIG, backup)
    print('Backed up', ORIG, 'to', backup)
# Replace original
shutil.copy2(DST, ORIG)
print('Replaced', ORIG, 'with', DST)

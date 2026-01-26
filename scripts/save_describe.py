#!/usr/bin/env python3
"""Load train CSVs for a date range, compute describe(), and save CSV/JSON outputs.

Usage:
    python scripts/save_describe.py --start 2025-03-27 --end 2025-10-26

Webapp dataset example:
    python scripts/save_describe.py --start 2024-08-16 --end 2025-10-25 \
        --data-root webapp/data --stations webapp/data/stations.csv --out-dir webapp/data/outputs

By default it looks for train CSVs under `data/railway-opendata/YYYY-MM-DD/trains.csv`.
Outputs are written to `data/outputs/describe_<start>_<end>.(csv|json)`.
"""
from pathlib import Path
from datetime import datetime
import argparse
import pandas as pd
import sys
from pathlib import Path as _P
# ensure repo root on sys.path so `src` package is importable
repo_root = _P(__file__).resolve().parents[1]
sys.path.insert(0, str(repo_root))
from src.analysis.load_data import read_station_csv

parser = argparse.ArgumentParser()
parser.add_argument('--start', required=True)
parser.add_argument('--end', required=True)
parser.add_argument('--stations', default='data/stations.csv')
parser.add_argument('--data-root', default='data/railway-opendata')
parser.add_argument('--out-dir', default='data/outputs')
args = parser.parse_args()

DATA_ROOT = Path(args.data_root)
OUT_DIR = Path(args.out_dir)
OUT_DIR.mkdir(parents=True, exist_ok=True)

start = datetime.fromisoformat(args.start)
end = datetime.fromisoformat(args.end)

# collect train csv files between dates
files = []
for d in sorted(DATA_ROOT.iterdir()):
    if not d.is_dir():
        continue
    try:
        ddate = datetime.fromisoformat(d.name)
    except Exception:
        continue
    if start <= ddate <= end:
        p = d / 'trains.csv'
        if p.exists():
            files.append(p)

print(f'Found {len(files)} trains.csv files')

# load only the numeric columns we need to reduce peak memory usage
frames = []
usecols = [
    "stop_number",
    "arrival_delay",
    "departure_delay",
    "crowding",
    "phantom",
    "trenord_phantom",
    "day",
]
for f in files:
    # read only necessary columns
    part = pd.read_csv(f, usecols=[c for c in usecols if c in pd.read_csv(f, nrows=0).columns])
    # filter phantom flags if present
    if "phantom" in part.columns:
        part = part.loc[part.phantom == False]
        part = part.drop(columns=["phantom"], errors="ignore")
    if "trenord_phantom" in part.columns:
        part = part.loc[part.trenord_phantom == False]
        part = part.drop(columns=["trenord_phantom"], errors="ignore")
    frames.append(part)

if not frames:
    raise SystemExit("No train data found for the given range")

df = pd.concat(frames, axis=0, ignore_index=True)
_ = read_station_csv(Path(args.stations))

# ensure day is datetime and filter by date range
df["day"] = pd.to_datetime(df["day"], errors="coerce")
mask = (df.day >= pd.to_datetime(start)) & (df.day <= pd.to_datetime(end))
df = df.loc[mask]

# compute describe
desc = df[['stop_number', 'arrival_delay', 'departure_delay', 'crowding']].describe()
# save
start_s = start.date().isoformat()
end_s = end.date().isoformat()
csv_out = OUT_DIR / f'describe_{start_s}_{end_s}.csv'
json_out = OUT_DIR / f'describe_{start_s}_{end_s}.json'

desc.to_csv(csv_out)
desc.to_json(json_out, orient='split')

print('Wrote', csv_out)
print('Wrote', json_out)

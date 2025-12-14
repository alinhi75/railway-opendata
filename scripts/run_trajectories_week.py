#!/usr/bin/env python3
"""Load train CSVs for a given date range, fix missing category/client fields, and build the folium trajectories map.

Usage:
  python scripts/run_trajectories_week.py --start 2025-03-27 --end 2025-04-02

This script uses the existing `src.analysis` functions but ensures `category` is a string
to avoid runtime errors when building marker icons.
"""
import sys
from pathlib import Path
import argparse
import pandas as pd

# make repo importable
repo_root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(repo_root))

from src.analysis.load_data import read_station_csv, read_train_csv
from src.analysis.trajectories_map import build_map

parser = argparse.ArgumentParser()
parser.add_argument('--start', required=True)
parser.add_argument('--end', required=True)
parser.add_argument('--stations', default='data/stations.csv')
args = parser.parse_args()

start = pd.to_datetime(args.start)
end = pd.to_datetime(args.end)
ROOT = Path('data/railway-opendata')

files = []
for d in sorted(ROOT.iterdir()):
    if not d.is_dir():
        continue
    try:
        ddate = pd.to_datetime(d.name)
    except Exception:
        continue
    if start <= ddate <= end:
        p = d / 'trains.csv'
        if p.exists():
            files.append(p)

print(f'Found {len(files)} train CSVs')

frames = []
for f in files:
    df = read_train_csv(f)
    frames.append(df)

if not frames:
    raise SystemExit('No train data found for the given range')

df = pd.concat(frames, axis=0, ignore_index=True)

# Fix missing category or client_code types
if 'category' in df.columns:
    df['category'] = df['category'].fillna('').astype(str)
else:
    df['category'] = ''

if 'client_code' in df.columns:
    # ensure client_code is string for icon selection
    df['client_code'] = df['client_code'].astype(str)
else:
    df['client_code'] = 'unknown'

# Load stations
stations = read_station_csv(Path(args.stations))

print('Building map (this will open in your default browser when ready)...')
build_map(stations, df)
print('Done')

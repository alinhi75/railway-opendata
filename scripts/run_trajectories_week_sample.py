#!/usr/bin/env python3
"""Build a sampled trajectories map for a given date range to avoid memory spikes.

This script samples a subset of trains (by `train_hash`) across the range and
builds the folium map using `src.analysis.trajectories_map.build_map`.

Usage:
  python scripts/run_trajectories_week_sample.py --start 2025-03-27 --end 2025-04-02 --sample 0.1
"""
import sys
from pathlib import Path
import argparse
import pandas as pd
import numpy as np

# make repo importable
repo_root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(repo_root))

from src.analysis.load_data import read_station_csv, read_train_csv
from src.analysis.trajectories_map import build_map

parser = argparse.ArgumentParser()
parser.add_argument('--start', required=True)
parser.add_argument('--end', required=True)
parser.add_argument('--stations', default='data/stations.csv')
parser.add_argument('--sample', type=float, default=0.1, help='Fraction of trains to sample (0-1) or absolute count if >=1')
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

# Fix missing category and client_code types
if 'category' in df.columns:
    df['category'] = df['category'].fillna('').astype(str)
else:
    df['category'] = ''

if 'client_code' in df.columns:
    df['client_code'] = df['client_code'].astype(str)
else:
    df['client_code'] = 'unknown'

# Sample train_hash set
unique_trains = df['train_hash'].unique()
if args.sample >= 1:
    k = int(min(len(unique_trains), args.sample))
else:
    k = int(max(1, round(len(unique_trains) * args.sample)))

np.random.seed(0)
sampled = set(np.random.choice(unique_trains, size=k, replace=False))
print(f'Sampling {k} trains out of {len(unique_trains)} (~{k/len(unique_trains):.2%})')

df_sample = df.loc[df.train_hash.isin(sampled)].copy()

# Load stations
stations = read_station_csv(Path(args.stations))

print('Building sampled map (this will open in your default browser when ready)...')
build_map(stations, df_sample)
print('Done')

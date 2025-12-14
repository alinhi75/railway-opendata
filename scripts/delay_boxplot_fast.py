#!/usr/bin/env python3
"""Memory-efficient delay boxplot: per-day per-file aggregation.

This script processes each `data/railway-opendata/YYYY-MM-DD/trains.csv` file independently,
selects the last stop per `train_hash` in that file, then concatenates the per-train rows
and produces a seaborn boxplot of `arrival_delay` and `departure_delay`.

Usage:
  python scripts/delay_boxplot_fast.py --start 2025-03-27 --end 2025-10-26 --out data/outputs/delay_boxplot.png
"""
from pathlib import Path
import argparse
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

parser = argparse.ArgumentParser()
parser.add_argument('--start', required=True)
parser.add_argument('--end', required=True)
parser.add_argument('--out', required=True)
args = parser.parse_args()

ROOT = Path('data/railway-opendata')
start = pd.to_datetime(args.start)
end = pd.to_datetime(args.end)

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

print(f'Found {len(files)} files')

per_train_rows = []
usecols = ['train_hash','stop_number','arrival_delay','departure_delay','phantom','trenord_phantom']
for f in files:
    try:
        df = pd.read_csv(f, usecols=[c for c in usecols if c in pd.read_csv(f, nrows=0).columns])
    except Exception as e:
        print('Failed to read', f, e)
        continue
    # Drop phantom flags if present
    if 'phantom' in df.columns:
        df = df.loc[df.phantom == False]
    if 'trenord_phantom' in df.columns:
        df = df.loc[df.trenord_phantom == False]
    # If stop_number present, use it to pick last stop, otherwise use last row
    if 'stop_number' in df.columns:
        grouped = df.sort_values('stop_number').groupby('train_hash', sort=False).last().reset_index()
    else:
        grouped = df.groupby('train_hash', sort=False).last().reset_index()
    per_train_rows.append(grouped[['train_hash','arrival_delay','departure_delay']])

if not per_train_rows:
    raise SystemExit('No train data found in the requested range')

trains = pd.concat(per_train_rows, axis=0, ignore_index=True)
# Convert delays to numeric
trains['arrival_delay'] = pd.to_numeric(trains['arrival_delay'], errors='coerce')
trains['departure_delay'] = pd.to_numeric(trains['departure_delay'], errors='coerce')

# Melt for plotting
melt = trains.melt(id_vars=['train_hash'], value_vars=['arrival_delay','departure_delay'], var_name='variable', value_name='value')

sns.set_theme(style='whitegrid')
plt.figure(figsize=(10,6))
ax = sns.boxplot(x='variable', y='value', data=melt, showfliers=False)
ax.set(xlabel='Variable', ylabel='Delay (minutes)', title=f'Delay boxplot {args.start} → {args.end}')
plt.tight_layout()

out = Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
plt.savefig(out)
print('Saved', out)

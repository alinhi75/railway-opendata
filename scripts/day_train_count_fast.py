#!/usr/bin/env python3
"""Memory-efficient daily train count grouped by client_code.

Processes each `data/railway-opendata/YYYY-MM-DD/trains.csv` file independently,
counts unique `train_hash` per `client_code` per day, and plots a grouped bar chart.

Usage:
  python scripts/day_train_count_fast.py --start 2025-03-27 --end 2025-10-26 --out data/outputs/day_train_count_2025-03-27_2025-10-26.png
"""
from pathlib import Path
import argparse
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

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
            files.append((ddate.date().isoformat(), p))

print(f'Found {len(files)} files')

rows = []
for day_str, f in files:
    try:
        # read minimal columns
        sample_cols = pd.read_csv(f, nrows=0).columns.tolist()
        usecols = [c for c in ['train_hash', 'client_code', 'phantom', 'trenord_phantom'] if c in sample_cols]
        df = pd.read_csv(f, usecols=usecols)
    except Exception as e:
        print('Failed to read', f, e)
        continue
    # filter phantoms
    if 'phantom' in df.columns:
        df = df.loc[df.phantom == False]
    if 'trenord_phantom' in df.columns:
        df = df.loc[df.trenord_phantom == False]
    # ensure client_code exists
    if 'client_code' not in df.columns:
        df['client_code'] = 'unknown'
    # count unique trains per client
    grouped = df.groupby('client_code', sort=False)['train_hash'].nunique().reset_index()
    grouped['day'] = day_str
    grouped = grouped.rename(columns={'train_hash': 'train_count'})
    rows.append(grouped)

if not rows:
    raise SystemExit('No data found for the requested range')

all_df = pd.concat(rows, axis=0, ignore_index=True)
# convert day to datetime for sorting
all_df['day'] = pd.to_datetime(all_df['day'])
all_df = all_df.sort_values('day')
all_df['day_str'] = all_df['day'].dt.date.astype(str)

# Plot grouped barplot (day x train_count, hue=client_code)
sns.set_theme(style='whitegrid')
plt.figure(figsize=(14,6))
ax = sns.barplot(data=all_df, x='day_str', y='train_count', hue='client_code')
ax.set(xlabel='Day', ylabel='Unique train count')
plt.xticks(rotation=45)
plt.title(f'Daily train count by client_code ({args.start} → {args.end})', loc='left')
plt.tight_layout()

out = Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
plt.savefig(out)
print('Saved', out)

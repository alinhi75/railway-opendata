#!/usr/bin/env python3
"""Precompute describe stats for the *webapp* local dataset.

Mirrors the CLI behavior:
  --start-date ... --end-date ... --stat describe

Reads train CSVs from:
  webapp/data/YYYY-MM-DD/trains.csv

Writes CSV + JSON outputs to:
  webapp/data/outputs/describe_<start>_<end>.(csv|json)

Usage (Windows PowerShell):
  python scripts/webapp_describe_fast.py --start 2024-08-16 --end 2025-10-25
"""

from pathlib import Path
import argparse
import pandas as pd
import numpy as np


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    parser.add_argument("--data-root", default="webapp/data")
    parser.add_argument("--out-dir", default="webapp/data/outputs")
    args = parser.parse_args()

    root = Path(args.data_root)
    out_dir = Path(args.out_dir)
    start = pd.to_datetime(args.start)
    end = pd.to_datetime(args.end)

    files = []
    for d in sorted(root.iterdir()):
        if not d.is_dir():
            continue
        try:
            ddate = pd.to_datetime(d.name)
        except Exception:
            continue
        if start <= ddate <= end:
            p = d / "trains.csv"
            if p.exists():
                files.append(p)

    print(f"Found {len(files)} files in range {args.start} → {args.end}")

    # Incrementally collect numeric values to avoid loading all data at once
    numeric_cols = ["stop_number", "arrival_delay", "departure_delay", "crowding"]
    all_values = {col: [] for col in numeric_cols}

    for i, f in enumerate(files):
        try:
            header_cols = pd.read_csv(f, nrows=0).columns.tolist()
            cols = [c for c in (numeric_cols + ["phantom", "trenord_phantom"]) if c in header_cols]
            if not cols:
                continue
            df = pd.read_csv(f, usecols=cols)
        except Exception as e:
            print(f"  Skipped {f.name}: {e}")
            continue

        # Filter phantoms
        if "phantom" in df.columns:
            df = df.loc[df.phantom != True]
        if "trenord_phantom" in df.columns:
            df = df.loc[df.trenord_phantom != True]

        # Collect numeric values
        for col in numeric_cols:
            if col in df.columns:
                vals = pd.to_numeric(df[col], errors="coerce").dropna()
                all_values[col].extend(vals.tolist())

        if (i + 1) % 50 == 0:
            print(f"  Processed {i + 1}/{len(files)} files...")

    if not any(all_values.values()):
        raise SystemExit("No numeric data found in the requested range")

    print("Computing describe statistics...")
    
    # Compute statistics on collected values using numpy
    describe_data = {}
    for col, values in all_values.items():
        if not values:
            continue
        arr = np.array(values, dtype=np.float64)
        describe_data[col] = {
            'count': len(arr),
            'mean': float(np.mean(arr)),
            'std': float(np.std(arr)),
            'min': float(np.min(arr)),
            '25%': float(np.percentile(arr, 25)),
            '50%': float(np.percentile(arr, 50)),
            '75%': float(np.percentile(arr, 75)),
            'max': float(np.max(arr)),
        }

    # Convert to DataFrame
    desc = pd.DataFrame(describe_data)

    # Save outputs
    out_dir.mkdir(parents=True, exist_ok=True)
    start_s = pd.to_datetime(args.start).date().isoformat()
    end_s = pd.to_datetime(args.end).date().isoformat()

    csv_out = out_dir / f"describe_{start_s}_{end_s}.csv"
    json_out = out_dir / f"describe_{start_s}_{end_s}.json"

    desc.to_csv(csv_out)
    desc.to_json(json_out, orient="split")

    print(f"✓ Saved {csv_out}")
    print(f"✓ Saved {json_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

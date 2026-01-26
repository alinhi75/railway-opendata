#!/usr/bin/env python3
"""Precompute delay boxplot (last stop per train) for the *webapp* local dataset.

This mirrors the CLI behavior:
  --group-by train_hash --agg-func last --stat delay_box_plot

It reads train CSVs from:
  webapp/data/YYYY-MM-DD/trains.csv
and writes the PNG into:
  webapp/data/outputs/

Usage (Windows PowerShell):
  python scripts/webapp_delay_boxplot_fast.py --start 2024-08-16 --end 2024-09-16

Optional:
  --out webapp/data/outputs/delay_boxplot_<start>_<end>.png
"""

from __future__ import annotations

from pathlib import Path
import argparse
import pandas as pd
import seaborn as sns
import matplotlib


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    parser.add_argument("--data-root", default="webapp/data")
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    root = Path(args.data_root)
    start = pd.to_datetime(args.start)
    end = pd.to_datetime(args.end)

    files: list[Path] = []
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

    print(f"Found {len(files)} files")

    per_train_rows = []
    usecols = ["train_hash", "stop_number", "arrival_delay", "departure_delay", "phantom", "trenord_phantom"]

    for f in files:
        try:
            header_cols = pd.read_csv(f, nrows=0).columns.tolist()
            cols = [c for c in usecols if c in header_cols]
            if not cols:
                continue
            df = pd.read_csv(f, usecols=cols)
        except Exception as e:
            print("Failed to read", f, e)
            continue

        if "phantom" in df.columns:
            df = df.loc[df.phantom == False]
        if "trenord_phantom" in df.columns:
            df = df.loc[df.trenord_phantom == False]

        if "train_hash" not in df.columns:
            continue

        if "stop_number" in df.columns:
            grouped = df.sort_values("stop_number").groupby("train_hash", sort=False).last().reset_index()
        else:
            grouped = df.groupby("train_hash", sort=False).last().reset_index()

        keep_cols = [c for c in ["train_hash", "arrival_delay", "departure_delay"] if c in grouped.columns]
        per_train_rows.append(grouped[keep_cols])

    if not per_train_rows:
        raise SystemExit("No train data found in the requested range")

    trains = pd.concat(per_train_rows, axis=0, ignore_index=True)

    for c in ["arrival_delay", "departure_delay"]:
        if c in trains.columns:
            trains[c] = pd.to_numeric(trains[c], errors="coerce")

    value_vars = [c for c in ["arrival_delay", "departure_delay"] if c in trains.columns]
    if not value_vars:
        raise SystemExit("No delay columns found")

    melt = trains.melt(
        id_vars=["train_hash"],
        value_vars=value_vars,
        var_name="variable",
        value_name="value",
    )

    matplotlib.use("Agg", force=True)
    import matplotlib.pyplot as plt

    sns.set_theme(style="whitegrid")
    plt.figure(figsize=(10, 6))
    ax = sns.boxplot(x="variable", y="value", data=melt, showfliers=False)
    ax.set(xlabel="Variable", ylabel="Delay (minutes)", title=f"Delay boxplot (last stop) {args.start} → {args.end}")
    plt.tight_layout()

    if args.out:
        out = Path(args.out)
    else:
        out = Path("webapp/data/outputs") / f"delay_boxplot_{pd.to_datetime(args.start).date().isoformat()}_{pd.to_datetime(args.end).date().isoformat()}.png"

    out.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(out)
    print("Saved", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

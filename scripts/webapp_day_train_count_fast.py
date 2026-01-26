#!/usr/bin/env python3
"""Precompute daily train count for the *webapp* local dataset.

Mirrors the CLI behavior:
  --group-by client_code --stat day_train_count

Reads train CSVs from:
  webapp/data/YYYY-MM-DD/trains.csv

Writes PNG to:
  webapp/data/outputs/day_train_count_<start>_<end>.png

Usage (Windows PowerShell):
  python scripts/webapp_day_train_count_fast.py --start 2024-08-16 --end 2025-10-25
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

    files: list[tuple[str, Path]] = []
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
                files.append((ddate.date().isoformat(), p))

    print(f"Found {len(files)} files in range {args.start} → {args.end}")

    rows: list[pd.DataFrame] = []
    for day_str, f in files:
        try:
            sample_cols = pd.read_csv(f, nrows=0).columns.tolist()
            usecols = [c for c in ["train_hash", "client_code", "phantom", "trenord_phantom"] if c in sample_cols]
            if not usecols:
                continue
            df = pd.read_csv(f, usecols=usecols)
        except Exception as e:
            print(f"  Skipped {f.name}: {e}")
            continue

        # Filter phantoms
        if "phantom" in df.columns:
            df = df.loc[df.phantom == False]
        if "trenord_phantom" in df.columns:
            df = df.loc[df.trenord_phantom == False]

        if "train_hash" not in df.columns:
            continue

        # Ensure client_code exists
        if "client_code" not in df.columns:
            df["client_code"] = "unknown"

        # Count unique trains per client
        grouped = df.groupby("client_code", sort=False)["train_hash"].nunique().reset_index()
        grouped["day"] = day_str
        grouped = grouped.rename(columns={"train_hash": "train_count"})
        rows.append(grouped)

    if not rows:
        raise SystemExit("No data found in the requested range")

    print(f"Concatenating {len(rows)} days of data...")
    all_df = pd.concat(rows, axis=0, ignore_index=True)

    # Convert day to datetime for sorting
    all_df["day"] = pd.to_datetime(all_df["day"])
    all_df = all_df.sort_values("day")
    all_df["day_str"] = all_df["day"].dt.date.astype(str)

    # Plot grouped barplot
    matplotlib.use("Agg", force=True)
    import matplotlib.pyplot as plt

    sns.set_theme(style="whitegrid")
    plt.figure(figsize=(16, 7))
    ax = sns.barplot(data=all_df, x="day_str", y="train_count", hue="client_code")
    ax.set(xlabel="Day", ylabel="Unique train count")
    
    # Show only every Nth label to avoid overlap (for 391 days, show ~26 labels = every 15 days)
    tick_spacing = max(1, len(all_df["day_str"].unique()) // 26)
    for i, label in enumerate(ax.get_xticklabels()):
        if i % tick_spacing != 0:
            label.set_visible(False)
    
    plt.xticks(rotation=45, ha="right")
    plt.title(f"Daily train count by client_code ({args.start} → {args.end})", loc="left")
    plt.tight_layout()

    if args.out:
        out = Path(args.out)
    else:
        start_s = pd.to_datetime(args.start).date().isoformat()
        end_s = pd.to_datetime(args.end).date().isoformat()
        out = Path("webapp/data/outputs") / f"day_train_count_{start_s}_{end_s}.png"

    out.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(out)
    print(f"✓ Saved {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

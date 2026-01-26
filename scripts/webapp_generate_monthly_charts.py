#!/usr/bin/env python3
"""Generate monthly day_train_count and delay_boxplot charts for the webapp.

This script processes the webapp dataset month-by-month and creates separate
charts for each month, making it easier to view and filter in the UI.

Usage:
  python scripts/webapp_generate_monthly_charts.py --start 2024-08-16 --end 2025-10-25
"""

from pathlib import Path
import argparse
import pandas as pd
import seaborn as sns
import matplotlib
matplotlib.use("Agg", force=True)
import matplotlib.pyplot as plt
from datetime import datetime
from collections import defaultdict


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

    # Collect files grouped by month
    files_by_month = defaultdict(list)
    
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
                month_key = ddate.strftime("%Y-%m")
                files_by_month[month_key].append((ddate.date().isoformat(), p))

    print(f"Found {len(files_by_month)} months to process")

    # Process each month
    for month_key, files in sorted(files_by_month.items()):
        print(f"\nProcessing {month_key} ({len(files)} days)...")
        
        # Create month directory
        month_dir = out_dir / "day_train_count" / month_key
        month_dir.mkdir(parents=True, exist_ok=True)
        
        # Collect data for this month
        rows = []
        per_train_rows = []
        
        for day_str, f in files:
            try:
                sample_cols = pd.read_csv(f, nrows=0).columns.tolist()
                
                # For day_train_count
                usecols_count = [c for c in ["train_hash", "client_code", "phantom", "trenord_phantom"] if c in sample_cols]
                if usecols_count:
                    df = pd.read_csv(f, usecols=usecols_count)
                    
                    # Filter phantoms
                    if "phantom" in df.columns:
                        df = df.loc[df.phantom != True]
                    if "trenord_phantom" in df.columns:
                        df = df.loc[df.trenord_phantom != True]
                    
                    if "train_hash" in df.columns:
                        if "client_code" not in df.columns:
                            df["client_code"] = "unknown"
                        
                        grouped = df.groupby("client_code", sort=False)["train_hash"].nunique().reset_index()
                        grouped["day"] = day_str
                        grouped = grouped.rename(columns={"train_hash": "train_count"})
                        rows.append(grouped)
                
                # For delay_boxplot
                usecols_delay = [c for c in ["train_hash", "stop_number", "arrival_delay", "departure_delay", "phantom", "trenord_phantom"] if c in sample_cols]
                if usecols_delay:
                    df_delay = pd.read_csv(f, usecols=usecols_delay)
                    
                    if "phantom" in df_delay.columns:
                        df_delay = df_delay.loc[df_delay.phantom != True]
                    if "trenord_phantom" in df_delay.columns:
                        df_delay = df_delay.loc[df_delay.trenord_phantom != True]
                    
                    if "train_hash" in df_delay.columns:
                        if "stop_number" in df_delay.columns:
                            grouped_delay = df_delay.sort_values("stop_number").groupby("train_hash", sort=False).last().reset_index()
                        else:
                            grouped_delay = df_delay.groupby("train_hash", sort=False).last().reset_index()
                        
                        keep_cols = [c for c in ["train_hash", "arrival_delay", "departure_delay"] if c in grouped_delay.columns]
                        per_train_rows.append(grouped_delay[keep_cols])
                        
            except Exception as e:
                print(f"  Skipped {f.name}: {e}")
                continue
        
        # Generate day_train_count chart for this month
        if rows:
            try:
                all_df = pd.concat(rows, axis=0, ignore_index=True)
                all_df["day"] = pd.to_datetime(all_df["day"])
                all_df = all_df.sort_values("day")
                all_df["day_str"] = all_df["day"].dt.date.astype(str)
                
                sns.set_theme(style="whitegrid")
                plt.figure(figsize=(14, 6))
                ax = sns.barplot(data=all_df, x="day_str", y="train_count", hue="client_code")
                ax.set(xlabel="Day", ylabel="Unique train count")
                plt.xticks(rotation=45, ha="right")
                plt.title(f"Daily train count by company ({month_key})", loc="left")
                plt.tight_layout()
                
                out_png = month_dir / f"day_train_count_{month_key}.png"
                plt.savefig(out_png)
                plt.close()
                print(f"  ✓ Saved {out_png}")
            except Exception as e:
                print(f"  Failed to generate day_train_count: {e}")
        
        # Generate delay_boxplot for this month
        if per_train_rows:
            try:
                trains = pd.concat(per_train_rows, axis=0, ignore_index=True)
                
                for c in ["arrival_delay", "departure_delay"]:
                    if c in trains.columns:
                        trains[c] = pd.to_numeric(trains[c], errors="coerce")
                
                value_vars = [c for c in ["arrival_delay", "departure_delay"] if c in trains.columns]
                if value_vars:
                    melt = trains.melt(
                        id_vars=["train_hash"],
                        value_vars=value_vars,
                        var_name="variable",
                        value_name="value",
                    )
                    
                    sns.set_theme(style="whitegrid")
                    plt.figure(figsize=(10, 6))
                    ax = sns.boxplot(x="variable", y="value", data=melt, showfliers=False)
                    ax.set(xlabel="Variable", ylabel="Delay (minutes)", title=f"Delay boxplot (last stop) {month_key}")
                    plt.tight_layout()
                    
                    boxplot_png = month_dir / f"delay_boxplot_{month_key}.png"
                    plt.savefig(boxplot_png)
                    plt.close()
                    print(f"  ✓ Saved {boxplot_png}")
            except Exception as e:
                print(f"  Failed to generate delay_boxplot: {e}")

    print(f"\n✓ Generated charts for {len(files_by_month)} months")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

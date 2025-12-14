#!/usr/bin/env python3
"""Clean stations CSV that may contain unescaped commas in the `long_name` field.
Writes `data/stations.fixed.csv` encoded as UTF-8 with proper CSV quoting.
"""
import csv
from pathlib import Path

SRC = Path("data/stations.utf8.csv")
DST = Path("data/stations.fixed.csv")

if not SRC.exists():
    raise SystemExit(f"Source file not found: {SRC}")

rows = []
with SRC.open("r", encoding="utf-8", errors="replace") as fh:
    header = fh.readline().strip()
    # ensure header columns
    # expected header: code,region,long_name,short_name,latitude,longitude
    for line in fh:
        line = line.rstrip("\n\r")
        if not line.strip():
            continue
        parts = line.split(",")
        # Ensure we have at least 6 elements by padding
        if len(parts) < 6:
            parts += [""] * (6 - len(parts))
        # Reconstruct fields: code, region, long_name (may contain commas), short_name, latitude, longitude
        code = parts[0]
        region = parts[1]
        short_name = parts[-3]
        latitude = parts[-2]
        longitude = parts[-1]
        long_name = ",".join(parts[2:-3])
        rows.append([code, region, long_name, short_name, latitude, longitude])

# write cleaned CSV with header
with DST.open("w", encoding="utf-8", newline="") as out:
    w = csv.writer(out, quoting=csv.QUOTE_MINIMAL)
    w.writerow(["code", "region", "long_name", "short_name", "latitude", "longitude"])
    w.writerows(rows)

print(f"Wrote {len(rows)} stations to {DST}")

"""Fix station CSV encoding by trying common encodings and writing UTF-8 output.

Usage:
  .venv\Scripts\python.exe scripts\fix_station_encoding.py --input data\stations.csv --output data\stations.utf8.csv
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd


COMMON_ENCODINGS = [
    "utf-8",
    "utf-8-sig",
    "cp1252",
    "latin-1",
    "iso-8859-1",
    "cp1250",
]


def try_load(path: Path, enc: str):
    try:
        df = pd.read_csv(path, index_col=None, encoding=enc)
        return df
    except Exception as e:
        return e


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--input", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args(argv)

    inp: Path = args.input
    out: Path = args.output

    if not inp.exists():
        print(f"Input not found: {inp}")
        return 2

    for enc in COMMON_ENCODINGS:
        print(f"Trying encoding: {enc}")
        res = try_load(inp, enc)
        if isinstance(res, Exception):
            print(f"Failed with {enc}: {res}")
            continue
        df = res
        print(f"Success with encoding {enc}; writing UTF-8 output to {out}")
        df.to_csv(out, index=False, encoding="utf-8")
        return 0

    print("All encodings failed; you may need to inspect the file manually.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
import sys
fn = r'data\\stations.csv'
encs = ['utf-8','cp1252','latin-1','iso-8859-1']
with open(fn,'rb') as f:
    b = f.read()
success = None
for e in encs:
    try:
        s = b.decode(e)
        success = e
        break
    except Exception:
        pass
if not success:
    print('No encoding succeeded',file=sys.stderr)
    sys.exit(1)
out = r'data\\stations.utf8.csv'
with open(out,'w',encoding='utf-8') as f:
    f.write(s)
print('Detected', success, '-> wrote', out)

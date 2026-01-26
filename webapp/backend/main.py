
# Ensure src is importable regardless of working directory
import sys
from pathlib import Path
sys.path.append(str((Path(__file__).parent.parent.parent).resolve()))

"""
Railway OpenData - FastAPI Backend
Serves precomputed statistics and data for the frontend
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import hashlib
import json
import csv
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from datetime import date
from enum import Enum
import typing as t
import numpy as np
# import src.scraper.train as tr
from src.const import RailwayCompany
# Data directories (patched to use webapp/data as the canonical source)
WEBAPP_DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR = WEBAPP_DATA_DIR / "outputs"
DATA_RAW_DIR = WEBAPP_DATA_DIR
STATIONS_CSV_PATH = WEBAPP_DATA_DIR / "stations.csv"
REGION_CODE_TO_NAME: Dict[int, str] = {
    1: "Lombardia",
    2: "Liguria",
    3: "Piemonte",
    4: "Valle d'Aosta",
    5: "Trentino-Alto Adige",
    6: "Veneto",
    7: "Friuli Venezia Giulia",
    8: "Emilia-Romagna",
    9: "Toscana",
    10: "Umbria",
    11: "Marche",
    12: "Lazio",
    13: "Abruzzo",
    14: "Molise",
    15: "Campania",
    16: "Puglia",
    17: "Basilicata",
    18: "Calabria",
    19: "Sicilia",
    20: "Sardegna",
}

# --- LIVE DATA VERSION: Fetch stations from ViaggiaTreno API ---
import sys
from pathlib import Path
sys.path.append(str((Path(__file__).parent.parent.parent).resolve()))
from src.scraper.station import Station

app = FastAPI()

# CORS middleware (allow all origins for simplicity)
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.get("/stations_live")
def get_stations_live(
    q: Optional[str] = None,
    limit: int = 0,
    with_coords_only: bool = False,
    region: Optional[int] = None,
):
    """
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        railway_companies: Optional[str] = None,
        regions: Optional[str] = None,
        station_query: Optional[str] = None,
        recompute: bool = False,
    Get station data (GeoJSON, live from ViaggiaTreno API)
    For map markers and station selection

    Query params:
    - q: optional substring match on station name/short_name/code
    - limit: max returned features (0 means no limit; useful for typeahead dropdowns)
    - with_coords_only: if true, only return stations that have coordinates
    - region: optional region code (int) to filter stations
    """
    try:
        stations: list = []
        region_codes = [region] if region is not None else list(REGION_CODE_TO_NAME.keys())
        for reg_code in region_codes:
            try:
                stations.extend(Station.by_region(reg_code))
            except Exception:
                continue
        # Filter by query
        if q:
            needle = q.strip().lower()
            stations = [s for s in stations if needle in (s.name or '').lower() or needle in (s.short_name or '').lower() or needle in (s.code or '').lower()]
        # Filter by coordinates
        if with_coords_only:
            stations = [s for s in stations if s.position and all(s.position)]
        # Limit
        if limit > 0:
            stations = stations[:limit]
        # Convert to GeoJSON FeatureCollection
        features = []
        for s in stations:
            if not s.position or not all(s.position):
                coords = None
            else:
                coords = [s.position[1], s.position[0]]  # [lon, lat]
            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": coords} if coords else None,
                "properties": {
                    "code": s.code,
                    "name": s.name,
                    "short_name": s.short_name,
                    "region_code": s.region_code,
                },
            })
        return {"type": "FeatureCollection", "features": features}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching stations (live): {str(e)}")

RUNTIME_DIR = DATA_DIR / "runtime"
RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

# Safety: on-demand generation can be expensive. Keep a sane default bound.
MAX_RANGE_DAYS = 366

# In-memory cache for station index (to support region/station filtering).
_STATIONS_CACHE: Dict[str, Any] = {"mtime": None, "by_code": None, "codes_by_region_name": None}


def _read_csv_rows(path: Path) -> Iterable[Dict[str, str]]:
    # Try common encodings, including BOM.
    encodings = ["utf-8-sig", "utf-8", "cp1252", "latin-1"]
    last_err: Optional[Exception] = None
    for enc in encodings:
        try:
            with open(path, "r", encoding=enc, newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    yield row
            return
        except Exception as e:
            last_err = e
    raise last_err or RuntimeError("Unable to read CSV")


def _parse_iso_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid date format '{value}'. Expected YYYY-MM-DD")


def _validate_range(s: date, e: date, max_days: int = MAX_RANGE_DAYS) -> None:
    if e < s:
        raise HTTPException(status_code=400, detail="end_date must be >= start_date")
    if (e - s).days > max_days:
        raise HTTPException(
            status_code=400,
            detail=f"Date range too large ({(e - s).days} days). Max allowed is {max_days} days.",
        )


def _infer_available_date_range() -> tuple[date, date]:
    dates: list[date] = []
    if not DATA_RAW_DIR.exists():
        raise HTTPException(status_code=404, detail=f"Missing raw data dir: {str(DATA_RAW_DIR)}")
    for d in DATA_RAW_DIR.iterdir():
        if not d.is_dir():
            continue
        try:
            dates.append(date.fromisoformat(d.name))
        except Exception:
            continue
    if not dates:
        raise HTTPException(status_code=404, detail="No dated subfolders found under webapp/data")
    return (min(dates), max(dates))


def _available_range_hint() -> Optional[str]:
    """Return a human-friendly available range hint or None."""
    try:
        min_d, max_d = _infer_available_date_range()
        return f"Available data range: {min_d.isoformat()} → {max_d.isoformat()}"
    except Exception:
        return None


def _parse_csv_list(value: Optional[str]) -> List[str]:
    if not value:
        return []
    items = [v.strip() for v in value.split(",")]
    return [v for v in items if v]


def _cache_suffix(payload: Dict[str, Any]) -> str:
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:12]


def _list_train_csv_files(s: date, e: date) -> List[Path]:
    if not DATA_RAW_DIR.exists():
        raise HTTPException(status_code=404, detail=f"Missing raw data dir: {str(DATA_RAW_DIR)}")

    # Fast path: iterate directories that look like dates.
    files: List[Path] = []
    for d in sorted(DATA_RAW_DIR.iterdir()):
        if not d.is_dir():
            continue
        try:
            ddate = date.fromisoformat(d.name)
        except Exception:
            continue
        if s <= ddate <= e:
            p = d / "trains.csv"
            if p.exists():
                files.append(p)
    if not files:
        hint = _available_range_hint()
        detail = "No trains.csv files found for the selected date range"
        if hint:
            detail = f"{detail}. {hint}"
        raise HTTPException(status_code=404, detail=detail)
    return files


def _load_stations_index() -> Dict[str, Any]:
    """Load stations.csv into an index used for region/station filtering.

    Returns:
      {
        by_code: {code: {name, short_name, region_code(int|None), region_name(str|None)}},
        codes_by_region_name: {normalized_region_name: set(codes)}
      }
    """
    if not STATIONS_CSV_PATH.exists():
        return {"by_code": {}, "codes_by_region_name": {}}

    mtime = STATIONS_CSV_PATH.stat().st_mtime
    if _STATIONS_CACHE.get("mtime") == mtime and _STATIONS_CACHE.get("by_code") is not None:
        return {"by_code": _STATIONS_CACHE["by_code"], "codes_by_region_name": _STATIONS_CACHE["codes_by_region_name"]}

    by_code: Dict[str, Dict[str, Any]] = {}
    codes_by_region_name: Dict[str, set] = {}

    for row in _read_csv_rows(STATIONS_CSV_PATH):
        code = (row.get("code") or "").strip()
        if not code:
            continue
        long_name = (row.get("long_name") or row.get("longName") or row.get("name") or "").strip()
        short_name = (row.get("short_name") or row.get("shortName") or "").strip()
        region_raw = (row.get("region") or "").strip()

        region_code: Optional[int] = None
        if region_raw != "":
            try:
                region_code = int(region_raw)
            except ValueError:
                region_code = None
        region_name = REGION_CODE_TO_NAME.get(region_code) if region_code else None

        by_code[code] = {
            "name": long_name or short_name or code,
            "short_name": short_name,
            "region_code": region_code,
            "region_name": region_name,
        }

        if region_name:
            key = region_name.strip().lower()
            codes_by_region_name.setdefault(key, set()).add(code)

    _STATIONS_CACHE["mtime"] = mtime
    _STATIONS_CACHE["by_code"] = by_code
    _STATIONS_CACHE["codes_by_region_name"] = codes_by_region_name
    return {"by_code": by_code, "codes_by_region_name": codes_by_region_name}


def _resolve_station_codes(query: str, stations_index: Dict[str, Any]) -> set:
    needle = (query or "").strip().lower()
    if not needle:
        return set()

    by_code: Dict[str, Dict[str, Any]] = stations_index.get("by_code") or {}
    matches = set()
    for code, meta in by_code.items():
        name = str(meta.get("name") or "")
        short_name = str(meta.get("short_name") or "")
        hay = f"{code} {name} {short_name}".lower()
        if needle in hay:
            matches.add(code)
    return matches


def _load_trains_df(
    s: date,
    e: date,
    railway_companies: List[str],
    regions: List[str],
    station_query: Optional[str],
) -> "Any":
    """Load raw trains.csv rows for a date range and apply filters.

    Notes:
      - Requires pandas/numpy available in the environment.
      - Filters are applied on stop rows (stop_station_code).
    """
    import pandas as pd
    import numpy as np

    files = _list_train_csv_files(s, e)
    if not files:
        raise HTTPException(status_code=404, detail="No trains.csv files found for the selected date range")

    usecols = [
        "train_hash",
        "stop_number",
        "arrival_delay",
        "departure_delay",
        "crowding",
        "day",
        "stop_station_code",
        "client_code",
        "phantom",
        "trenord_phantom",
    ]

    frames = []
    for f in files:
        header_cols = pd.read_csv(f, nrows=0).columns.tolist()
        cols = [c for c in usecols if c in header_cols]
        if not cols:
            continue
        part = pd.read_csv(f, usecols=cols)
        frames.append(part)

    if not frames:
        raise HTTPException(status_code=404, detail="No readable train data found for the selected date range")

    df = pd.concat(frames, axis=0, ignore_index=True)

    # Filter phantom flags
    if "phantom" in df.columns:
        df = df.loc[df.phantom == False].drop(columns=["phantom"], errors="ignore")
    if "trenord_phantom" in df.columns:
        df = df.loc[df.trenord_phantom == False].drop(columns=["trenord_phantom"], errors="ignore")

    # Normalize day
    if "day" in df.columns:
        df["day"] = pd.to_datetime(df["day"], errors="coerce")
        df = df.loc[df["day"].notna()]

    # Normalize company code to enum-like strings (TRENITALIA_REG, ...)
    def _map_company(v):
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return "OTHER"
        if isinstance(v, (int, np.integer)):
            return RailwayCompany.from_code(int(v))
        s = str(v).strip()
        if s == "":
            return "OTHER"
        if s.lstrip("-").isdigit():
            return RailwayCompany.from_code(int(s))
        # if it already looks like an enum member, keep it
        return s

    if "client_code" in df.columns:
        df["client_code"] = df["client_code"].apply(_map_company)

    # Apply company filter
    if railway_companies:
        df = df.loc[df["client_code"].isin(railway_companies)]

    # Resolve region/station constraints to station-code sets
    stations_index = _load_stations_index()
    allowed_codes: Optional[set] = None

    if regions:
        region_keys = [r.strip().lower() for r in regions if r and r.strip()]
        codes_by_region_name: Dict[str, set] = stations_index.get("codes_by_region_name") or {}
        region_codes = set()
        for rk in region_keys:
            region_codes |= set(codes_by_region_name.get(rk) or set())
        allowed_codes = region_codes

    if station_query:
        station_codes = _resolve_station_codes(station_query, stations_index)
        allowed_codes = station_codes if allowed_codes is None else (allowed_codes & station_codes)

    if allowed_codes is not None:
        if "stop_station_code" not in df.columns:
            # No station information available, so this filter eliminates all rows.
            return df.iloc[0:0]
        df = df.loc[df["stop_station_code"].isin(list(allowed_codes))]

    return df

# Mount static files (for serving PNGs, HTMLs, etc.)
if DATA_DIR.exists():
    app.mount("/files", StaticFiles(directory=DATA_DIR), name="files")


@app.get("/")
def root():
    """Root endpoint"""
    return {
        "message": "Railway OpenData API",
        "docs": "/docs",
        "version": "0.1.0"
    }


@app.get("/stats/describe")
def get_describe_stats(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    railway_companies: Optional[str] = None,
    regions: Optional[str] = None,
    station_query: Optional[str] = None,
    recompute: bool = False,
    default_window_days: int = 30,
):
    """Get descriptive statistics from the local webapp dataset.

    Reads `webapp/data/YYYY-MM-DD/trains.csv` and computes describe() on numeric fields.
    Returns a backward-compatible summary at top-level for the dashboard.
    """
    # Determine the date range
    if start_date and end_date:
        s = _parse_iso_date(start_date)
        e = _parse_iso_date(end_date)
        used_default_window = False
        available_min = None
        available_max = None
    elif start_date or end_date:
        raise HTTPException(status_code=400, detail="Provide both start_date and end_date, or neither")
    else:
        # Dashboard calls this endpoint without params; computing the whole dataset can be slow.
        available_min_d, available_max_d = _infer_available_date_range()
        available_min = available_min_d.isoformat()
        available_max = available_max_d.isoformat()

        # Clamp default window to the available range.
        if default_window_days < 1:
            default_window_days = 30
        s = max(available_min_d, available_max_d.replace() - __import__("datetime").timedelta(days=(default_window_days - 1)))
        e = available_max_d
        used_default_window = True

    # Keep describe bounded to avoid hanging the UI.
    _validate_range(s, e, max_days=366)

    companies_list = _parse_csv_list(railway_companies)
    regions_list = _parse_csv_list(regions)

    suffix = _cache_suffix(
        {
            "s": s.isoformat(),
            "e": e.isoformat(),
            "railway_companies": companies_list,
            "regions": regions_list,
            "station_query": (station_query or "").strip(),
        }
    )
    cache_json = RUNTIME_DIR / f"describe_{s.isoformat()}_{e.isoformat()}_{suffix}.json"

    if (not recompute) and cache_json.exists():
        with open(cache_json, "r", encoding="utf-8") as f:
            return json.load(f)

    df = _load_trains_df(
        s,
        e,
        railway_companies=companies_list,
        regions=regions_list,
        station_query=station_query,
    )

    import pandas as pd

    numeric_cols = [c for c in ["stop_number", "arrival_delay", "departure_delay", "crowding"] if c in df.columns]
    if not numeric_cols:
        raise HTTPException(status_code=404, detail="No numeric columns found to describe")

    desc_df = df[numeric_cols].describe(include="all")
    table = desc_df.to_dict()  # {col: {stat: value}}

    # Backward-compatible top-level summary for the dashboard.
    # Prefer arrival_delay; fall back to the first numeric column.
    preferred_col = "arrival_delay" if "arrival_delay" in table else numeric_cols[0]
    summary = table.get(preferred_col, {})

    def _as_number(v: Any) -> Any:
        if v is None:
            return None
        try:
            # pandas/numpy scalars
            if isinstance(v, (np.integer,)):
                return int(v)
            if isinstance(v, (np.floating,)):
                return float(v)
            if isinstance(v, (int, float)):
                return v
            # strings that look like numbers
            s = str(v)
            if s.strip() == "":
                return None
            return float(s)
        except Exception:
            return None

    payload: Dict[str, Any] = {
        "available_min_date": available_min,
        "available_max_date": available_max,
        "used_default_window": used_default_window,
        "default_window_days": default_window_days if used_default_window else None,
        "start_date": s.isoformat(),
        "end_date": e.isoformat(),
        "column": preferred_col,
        "count": _as_number(summary.get("count")),
        "mean": _as_number(summary.get("mean")),
        "std": _as_number(summary.get("std")),
        "min": _as_number(summary.get("min")),
        "25%": _as_number(summary.get("25%")),
        "50%": _as_number(summary.get("50%")),
        "75%": _as_number(summary.get("75%")),
        "max": _as_number(summary.get("max")),
        "describe": {k: {sk: _as_number(sv) for sk, sv in (v or {}).items()} for k, v in table.items()},
    }

    with open(cache_json, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)

    return payload



@app.get("/stats/delay-boxplot")
def get_delay_boxplot(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    railway_companies: Optional[str] = None,
    regions: Optional[str] = None,
    station_query: Optional[str] = None,
    recompute: bool = False,
    default_window_days: int = 30,
):
    """
    Get delay boxplot information (US-2: Delay Patterns)
    Returns path to precomputed PNG from delay_boxplot_fast.py
    """
    # If no dates are provided, prefer latest precomputed PNG under webapp/data/outputs.
    if not (start_date or end_date):
        boxplot_files = list(DATA_DIR.glob("delay_boxplot_*.png"))
        if boxplot_files:
            boxplot_file = sorted(boxplot_files)[-1]
            return {"file_path": f"/files/{boxplot_file.name}", "filename": boxplot_file.name}

    # Determine date range
    if start_date and end_date:
        s = _parse_iso_date(start_date)
        e = _parse_iso_date(end_date)
    elif start_date or end_date:
        raise HTTPException(status_code=400, detail="Provide both start_date and end_date, or neither")
    else:
        available_min_d, available_max_d = _infer_available_date_range()
        if default_window_days < 1:
            default_window_days = 30
        s = max(
            available_min_d,
            available_max_d.replace() - __import__("datetime").timedelta(days=(default_window_days - 1)),
        )
        e = available_max_d

    _validate_range(s, e)

    companies_list = _parse_csv_list(railway_companies)
    regions_list = _parse_csv_list(regions)

    suffix = _cache_suffix(
        {
            "s": s.isoformat(),
            "e": e.isoformat(),
            "railway_companies": companies_list,
            "regions": regions_list,
            "station_query": (station_query or "").strip(),
        }
    )
    out_png = RUNTIME_DIR / f"delay_boxplot_{s.isoformat()}_{e.isoformat()}_{suffix}.png"

    if (not recompute) and out_png.exists():
        return {"file_path": f"/files/runtime/{out_png.name}", "filename": out_png.name}

    import pandas as pd
    import seaborn as sns
    import matplotlib
    matplotlib.use("Agg", force=True)
    import matplotlib.pyplot as plt

    df = _load_trains_df(
        s,
        e,
        railway_companies=companies_list,
        regions=regions_list,
        station_query=station_query,
    )
    if df.empty:
        raise HTTPException(status_code=404, detail="No data found for the selected filters")

    needed = [c for c in ["train_hash", "stop_number", "arrival_delay", "departure_delay"] if c in df.columns]
    if "train_hash" not in needed:
        raise HTTPException(status_code=500, detail="Missing required column 'train_hash' in raw data")

    sub = df[needed].copy()
    if "stop_number" in sub.columns:
        sub = sub.sort_values("stop_number")
        per_train = sub.groupby("train_hash", sort=False).last().reset_index()
    else:
        per_train = sub.groupby("train_hash", sort=False).last().reset_index()

    for c in ["arrival_delay", "departure_delay"]:
        if c in per_train.columns:
            per_train[c] = pd.to_numeric(per_train[c], errors="coerce")

    value_vars = [c for c in ["arrival_delay", "departure_delay"] if c in per_train.columns]
    if not value_vars:
        raise HTTPException(status_code=404, detail="No delay columns found for boxplot")

    melt = per_train.melt(
        id_vars=["train_hash"],
        value_vars=value_vars,
        var_name="variable",
        value_name="value",
    )

    sns.set_theme(style="whitegrid")
    plt.figure(figsize=(10, 6))
    ax = sns.boxplot(x="variable", y="value", data=melt, showfliers=False)
    ax.set(xlabel="Variable", ylabel="Delay (minutes)", title=f"Delay boxplot (last stop) {s.isoformat()} → {e.isoformat()}")
    plt.tight_layout()
    plt.savefig(out_png)
    plt.close()

    return {"file_path": f"/files/runtime/{out_png.name}", "filename": out_png.name}


@app.get("/stats/day-train-count/monthly")
def get_day_train_count_monthly(
    year: int,
    month: int,
):
    """
    Get daily train count data for a specific month (US-3: Service Frequency)
    Returns path to precomputed monthly PNG from webapp_generate_monthly_charts.py
    """
    month_key = f"{year:04d}-{month:02d}"
    month_dir = DATA_DIR / "day_train_count" / month_key
    png_file = month_dir / f"day_train_count_{month_key}.png"
    
    if not png_file.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No precomputed chart found for {month_key}. Run webapp_generate_monthly_charts.py first."
        )
    
    return {
        "file_path": f"/files/day_train_count/{month_key}/day_train_count_{month_key}.png",
        "filename": png_file.name,
        "year": year,
        "month": month,
    }


@app.get("/stats/delay-boxplot/monthly")
def get_delay_boxplot_monthly(
    year: int,
    month: int,
):
    """
    Get delay boxplot for a specific month
    Returns path to precomputed monthly PNG from webapp_generate_monthly_charts.py
    """
    month_key = f"{year:04d}-{month:02d}"
    month_dir = DATA_DIR / "day_train_count" / month_key
    png_file = month_dir / f"delay_boxplot_{month_key}.png"
    
    if not png_file.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No precomputed boxplot found for {month_key}. Run webapp_generate_monthly_charts.py first."
        )
    
    return {
        "file_path": f"/files/day_train_count/{month_key}/delay_boxplot_{month_key}.png",
        "filename": png_file.name,
        "year": year,
        "month": month,
    }


@app.get("/stats/available-months")
def get_available_months():
    """
    Get list of available months for monthly statistics
    """
    day_train_count_dir = DATA_DIR / "day_train_count"
    if not day_train_count_dir.exists():
        return {"months": []}
    
    months = []
    for month_dir in sorted(day_train_count_dir.iterdir()):
        if month_dir.is_dir():
            try:
                # Parse YYYY-MM format
                parts = month_dir.name.split("-")
                if len(parts) == 2:
                    year, month = int(parts[0]), int(parts[1])
                    # Check if PNG exists
                    png_file = month_dir / f"day_train_count_{month_dir.name}.png"
                    if png_file.exists():
                        months.append({"year": year, "month": month, "key": month_dir.name})
            except (ValueError, IndexError):
                continue
    
    return {"months": months}


@app.get("/stats/day-train-count")
def get_day_train_count(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    railway_companies: Optional[str] = None,
    regions: Optional[str] = None,
    station_query: Optional[str] = None,
    recompute: bool = False,
    default_window_days: int = 30,
):
    """
    Get daily train count data (US-3: Service Frequency)
    Returns path to precomputed PNG from day_train_count_fast.py
    """
    # Determine date range
    if start_date and end_date:
        s = _parse_iso_date(start_date)
        e = _parse_iso_date(end_date)
    elif start_date or end_date:
        raise HTTPException(status_code=400, detail="Provide both start_date and end_date, or neither")
    else:
        available_min_d, available_max_d = _infer_available_date_range()
        if default_window_days < 1:
            default_window_days = 30
        s = max(
            available_min_d,
            available_max_d.replace() - __import__("datetime").timedelta(days=(default_window_days - 1)),
        )
        e = available_max_d

    _validate_range(s, e)

    companies_list = _parse_csv_list(railway_companies)
    regions_list = _parse_csv_list(regions)

    suffix = _cache_suffix(
        {
            "s": s.isoformat(),
            "e": e.isoformat(),
            "railway_companies": companies_list,
            "regions": regions_list,
            "station_query": (station_query or "").strip(),
        }
    )
    out_png = RUNTIME_DIR / f"day_train_count_{s.isoformat()}_{e.isoformat()}_{suffix}.png"

    if (not recompute) and out_png.exists():
        return {"file_path": f"/files/runtime/{out_png.name}", "filename": out_png.name}

    import pandas as pd
    import seaborn as sns
    import matplotlib
    matplotlib.use("Agg", force=True)
    import matplotlib.pyplot as plt

    df = _load_trains_df(
        s,
        e,
        railway_companies=companies_list,
        regions=regions_list,
        station_query=station_query,
    )
    if df.empty:
        raise HTTPException(status_code=404, detail="No data found for the selected filters")

    if "train_hash" not in df.columns:
        raise HTTPException(status_code=500, detail="Missing required column 'train_hash' in raw data")
    if "client_code" not in df.columns:
        df["client_code"] = "unknown"

    # Use the parsed day if present; otherwise, infer from date range (single-day case)
    if "day" not in df.columns:
        df["day"] = pd.to_datetime(s.isoformat())

    grouped = (
        df.groupby(["day", "client_code"], sort=False)["train_hash"]
        .nunique()
        .reset_index()
        .rename(columns={"train_hash": "train_count"})
    )
    grouped = grouped.sort_values("day")
    grouped["day_str"] = pd.to_datetime(grouped["day"]).dt.date.astype(str)

    # Get unique dates for x-axis label spacing
    unique_dates = grouped["day_str"].unique()
    num_dates = len(unique_dates)
    
    # Calculate tick spacing to show ~20-26 labels max
    tick_spacing = max(1, num_dates // 26)

    sns.set_theme(style="whitegrid")
    fig_width = max(14, num_dates * 0.15)  # Scale width with number of days
    plt.figure(figsize=(fig_width, 6))
    ax = sns.barplot(data=grouped, x="day_str", y="train_count", hue="client_code")
    ax.set(xlabel="Day", ylabel="Unique train count")
    
    # Apply label spacing to avoid overlap
    for i, label in enumerate(ax.get_xticklabels()):
        if i % tick_spacing != 0:
            label.set_visible(False)
    
    plt.xticks(rotation=45, ha="right")
    plt.title(f"Daily train count by company ({s.isoformat()} → {e.isoformat()})", loc="left")
    plt.tight_layout()
    plt.savefig(out_png)
    plt.close()

    return {"file_path": f"/files/runtime/{out_png.name}", "filename": out_png.name}


# --- LIVE DATA VERSION: No direct API for trajectories, return error or placeholder ---
@app.get("/map/trajectories")
def get_trajectories():
    """
    Get train trajectories for map (US-4: Interactive Map)
    Not available from live API; local file usage removed.
    """
    raise HTTPException(
        status_code=501,
        detail="Live train trajectories are not available from the public API. This endpoint no longer uses local files."
    )


@app.get("/stations")
def get_stations(
    q: Optional[str] = None,
    limit: int = 0,
    with_coords_only: bool = False,
):
    """
    Get station data (GeoJSON or CSV)
    For map markers and station selection

    Query params:
    - q: optional substring match on station name/short_name/code
    - limit: max returned features (0 means no limit; useful for typeahead dropdowns)
    - with_coords_only: if true, only return stations that have coordinates
    """
    # Source files live in data/ (DATA_DIR is data/outputs)
    stations_csv = WEBAPP_DATA_DIR / "stations.csv"
    stations_csv_clean = WEBAPP_DATA_DIR / "stations.clean.csv"
    stations_geojson = WEBAPP_DATA_DIR / "stations.geojson"
    
    def _normalize_feature_collection(obj: Dict[str, Any]) -> Dict[str, Any]:
        # Some generators may omit the 'type' field; normalize to a valid FeatureCollection.
        if isinstance(obj, dict) and "features" in obj and obj.get("type") is None:
            obj = {**obj, "type": "FeatureCollection"}
        return obj

    def _matches(feature: Dict[str, Any], needle: str) -> bool:
        props = feature.get("properties") or {}
        # Concatenate all string property values for substring search
        haystack = " ".join(
            str(v).lower() for v in props.values() if isinstance(v, str)
        )
        return needle in haystack

    def _filter_and_limit(fc: Dict[str, Any]) -> Dict[str, Any]:
        features = fc.get("features") or []
        if q:
            needle = q.strip().lower()
            if needle:
                features = [f for f in features if _matches(f, needle)]
        if with_coords_only:
            features = [f for f in features if f.get("geometry") and (f.get("geometry") or {}).get("type") == "Point"]
        if limit and limit > 0:
            features = features[: min(limit, len(features))]
        return {"type": "FeatureCollection", "features": features}

    def _read_csv_rows(path: Path) -> Iterable[Dict[str, str]]:
        # Try common encodings, including BOM.
        encodings = ["utf-8-sig", "utf-8", "cp1252", "latin-1"]
        last_err: Optional[Exception] = None
        for enc in encodings:
            try:
                with open(path, "r", encoding=enc, newline="") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        yield row
                return
            except Exception as e:
                last_err = e
        raise last_err or RuntimeError("Unable to read CSV")

    def _csv_to_feature_collection(path: Path) -> Dict[str, Any]:
        # Convert stations CSV into GeoJSON FeatureCollection.
        # Keep ALL rows (even without coordinates) so dropdowns can show all stations.
        features: List[Dict[str, Any]] = []
        seen = set()

        for row in _read_csv_rows(path):
            code = (row.get("code") or "").strip()
            region = (row.get("region") or "").strip()

            region_code: Optional[int] = None
            if region != "":
                try:
                    region_code = int(region)
                except ValueError:
                    region_code = None
            region_name = REGION_CODE_TO_NAME.get(region_code) if region_code else None

            long_name = (row.get("long_name") or row.get("longName") or row.get("name") or "").strip()
            short_name = (row.get("short_name") or row.get("shortName") or "").strip()

            # Prefer long_name for display; fall back to short_name or code.
            display_name = long_name or short_name or code

            lat_raw = (row.get("latitude") or row.get("lat") or "").strip()
            lon_raw = (row.get("longitude") or row.get("lon") or "").strip()

            geometry = None
            if lat_raw and lon_raw:
                try:
                    lat = float(lat_raw)
                    lon = float(lon_raw)
                    geometry = {"type": "Point", "coordinates": [lon, lat]}
                except ValueError:
                    geometry = None

            # Deduplicate common repeats (station codes are not globally unique, but this helps the UI).
            dedupe_key = (code, display_name, short_name, region)
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)

            features.append(
                {
                    "type": "Feature",
                    "geometry": geometry,
                    "properties": {
                        "code": code,
                        "name": display_name,
                        "long_name": long_name,
                        "short_name": short_name,
                        "region": region,
                        "region_name": region_name,
                    },
                }
            )

        return {"type": "FeatureCollection", "features": features}

    # Prefer stations.csv as the canonical source for “all stations”.
    if stations_csv.exists():
        try:
            return _filter_and_limit(_csv_to_feature_collection(stations_csv))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error reading stations.csv: {str(e)}")

    if stations_csv_clean.exists():
        try:
            return _filter_and_limit(_csv_to_feature_collection(stations_csv_clean))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error reading stations.clean.csv: {str(e)}")

    if stations_geojson.exists():
        try:
            with open(stations_geojson, "r", encoding="utf-8") as f:
                data = json.load(f)
            data = _normalize_feature_collection(data)
            if not isinstance(data, dict) or "features" not in data:
                raise HTTPException(status_code=500, detail="stations.geojson is not a valid GeoJSON FeatureCollection")
            return _filter_and_limit(data)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error reading stations.geojson: {str(e)}")
    
    else:
        raise HTTPException(
            status_code=404,
            detail="No station data found. Expected data/stations.csv (or stations.clean.csv or stations.geojson)"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

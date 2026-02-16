
# Ensure src is importable regardless of working directory
import sys
from pathlib import Path
sys.path.append(str((Path(__file__).parent.parent.parent).resolve()))

"""
Railway OpenData - FastAPI Backend
Serves precomputed statistics and data for the frontend
"""

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import hashlib
import json
import csv
import os
from pathlib import Path
import shutil
import tempfile
import zipfile
from typing import Any, Dict, Iterable, List, Optional
from datetime import date, datetime, timedelta
import numpy as np
from src.const import RailwayCompany


def sanitize_for_json(obj: Any) -> Any:
    """Recursively convert NaN and Inf values to None for JSON serialization."""
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_for_json(v) for v in obj]
    elif isinstance(obj, float):
        try:
            if np.isnan(obj) or np.isinf(obj):
                return None
        except (TypeError, ValueError):
            pass
        return obj
    return obj
# Data directories (patched to use webapp/data as the canonical source)
WEBAPP_DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR = WEBAPP_DATA_DIR / "outputs"
DATA_RAW_DIR = WEBAPP_DATA_DIR
STATIONS_CSV_PATH = WEBAPP_DATA_DIR / "stations.csv"
DEFAULT_DATA_DIR = WEBAPP_DATA_DIR / "_default"
DATASET_META_FILENAME = "dataset.meta.json"
DEFAULT_ARCHIVE_STAMP = "_default"
CURRENT_ARCHIVE_STAMP = "_current"
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

app = FastAPI()

# CORS middleware (allow all origins for simplicity)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RUNTIME_DIR = DATA_DIR / "runtime"
RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

# Safety: on-demand generation can be expensive. Keep a sane default bound.
MAX_RANGE_DAYS = 366

# In-memory cache for station index (to support region/station filtering).
_STATIONS_CACHE: Dict[str, Any] = {"mtime": None, "by_code": None, "codes_by_region_name": None}
_TRAINSTATS_STATION_CACHE: Dict[str, Any] = {"ts": None, "by_norm": None, "list": None}


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


def _is_date_dir_name(name: str) -> bool:
    try:
        date.fromisoformat(name)
        return True
    except Exception:
        return False


def _safe_relpath(path_value: str) -> str:
    raw = (path_value or "").replace("\\", "/").lstrip("/")
    parts = [p for p in raw.split("/") if p]
    if any(p == ".." for p in parts):
        raise HTTPException(status_code=400, detail="Invalid path in upload payload")
    return "/".join(parts)


def _write_upload_files(root: Path, files: List[UploadFile], paths: Optional[List[str]]) -> None:
    if paths and len(paths) != len(files):
        raise HTTPException(status_code=400, detail="Upload paths count does not match files count")

    for idx, f in enumerate(files):
        rel = paths[idx] if paths else f.filename
        rel = _safe_relpath(rel or "")
        if not rel:
            continue
        if rel.endswith("/"):
            continue
        target = root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        with open(target, "wb") as out:
            shutil.copyfileobj(f.file, out)


def _safe_extract_zip(zip_path: Path, dest: Path) -> None:
    with zipfile.ZipFile(zip_path, "r") as zf:
        for info in zf.infolist():
            name = info.filename.replace("\\", "/")
            if name.startswith("/"):
                raise HTTPException(status_code=400, detail="Invalid zip entry path")
            if name.startswith("__MACOSX/") or name.endswith(".DS_Store"):
                continue
            if any(p == ".." for p in Path(name).parts):
                raise HTTPException(status_code=400, detail="Invalid zip entry path")
            if info.is_dir():
                continue
            target = dest / name
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, open(target, "wb") as out:
                shutil.copyfileobj(src, out)


def _find_dataset_root(root: Path) -> Path:
    """Find the root directory containing YYYY-MM-DD/trains.csv folders.
    
    stations.csv is optional here since it may be uploaded separately.
    We just need at least one date folder with trains.csv.
    """
    candidates: List[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        candidate = Path(dirpath)
        has_train_dir = False
        for child in candidate.iterdir():
            if child.is_dir() and _is_date_dir_name(child.name) and (child / "trains.csv").exists():
                has_train_dir = True
                break
        if has_train_dir:
            candidates.append(candidate)

    if not candidates:
        raise HTTPException(
            status_code=400,
            detail="ZIP must include at least one YYYY-MM-DD folder with trains.csv",
        )

    candidates.sort(key=lambda p: len(p.parts))
    return candidates[0]


def _archive_existing_dataset() -> Optional[Path]:
    archive_root = WEBAPP_DATA_DIR / "_archive"
    archive_root.mkdir(parents=True, exist_ok=True)
    stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    archive_dir = archive_root / stamp

    moved = False
    for item in WEBAPP_DATA_DIR.iterdir():
        if item.name.startswith("_"):
            continue
        if item.is_dir() and _is_date_dir_name(item.name):
            archive_dir.mkdir(parents=True, exist_ok=True)
            shutil.move(str(item), archive_dir / item.name)
            moved = True
            continue
        if item.is_file() and item.name in {"stations.csv", "stations.clean.csv", "stations.geojson"}:
            archive_dir.mkdir(parents=True, exist_ok=True)
            shutil.move(str(item), archive_dir / item.name)
            moved = True
            continue
        if item.is_file() and item.name == DATASET_META_FILENAME:
            archive_dir.mkdir(parents=True, exist_ok=True)
            shutil.move(str(item), archive_dir / item.name)
            moved = True

    if DATA_DIR.exists():
        archive_dir.mkdir(parents=True, exist_ok=True)
        shutil.move(str(DATA_DIR), archive_dir / "outputs")
        moved = True

    return archive_dir if moved else None


def _dataset_has_content(root: Path) -> bool:
    if not root.exists():
        return False
    if any((root / name).exists() for name in [
        "stations.csv",
        "stations.clean.csv",
        "stations.geojson",
    ]):
        return True
    for item in root.iterdir():
        if item.is_dir() and _is_date_dir_name(item.name):
            return True
    return False


def _write_dataset_meta(dest_dir: Path, name: Optional[str]) -> None:
    if not name:
        return
    meta = {
        "name": str(name).strip(),
        "created_at": datetime.utcnow().isoformat(),
    }
    try:
        with open(dest_dir / DATASET_META_FILENAME, "w", encoding="utf-8") as f:
            json.dump(meta, f)
    except Exception:
        pass


def _read_dataset_meta(meta_path: Path) -> Dict[str, Any]:
    try:
        with open(meta_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return {}


def _copy_dataset_contents(src: Path, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    for item in src.iterdir():
        if item.name.startswith("_"):
            continue
        if item.is_file() and item.name in {"stations.csv", "stations.clean.csv", "stations.geojson"}:
            shutil.copy2(item, dest / item.name)
            continue
        if item.is_dir() and _is_date_dir_name(item.name):
            shutil.copytree(item, dest / item.name)
            continue
        if item.is_dir() and item.name == "outputs":
            shutil.copytree(item, dest / "outputs")
        if item.is_file() and item.name == DATASET_META_FILENAME:
            shutil.copy2(item, dest / item.name)


def _clear_current_dataset() -> None:
    for item in WEBAPP_DATA_DIR.iterdir():
        if item.name in {"_archive", "_default"}:
            continue
        if item.is_dir():
            shutil.rmtree(item)
        else:
            item.unlink()


def _ensure_default_dataset() -> None:
    if _dataset_has_content(DEFAULT_DATA_DIR):
        return
    if not _dataset_has_content(WEBAPP_DATA_DIR):
        return
    DEFAULT_DATA_DIR.mkdir(parents=True, exist_ok=True)
    _copy_dataset_contents(WEBAPP_DATA_DIR, DEFAULT_DATA_DIR)


def _list_archives() -> List[Path]:
    archive_root = WEBAPP_DATA_DIR / "_archive"
    if not archive_root.exists():
        return []
    return sorted([p for p in archive_root.iterdir() if p.is_dir()], key=lambda p: p.name)


def _default_archive_entry() -> Optional[Dict[str, Any]]:
    if not _dataset_has_content(DEFAULT_DATA_DIR):
        return None
    meta = _read_dataset_meta(DEFAULT_DATA_DIR / DATASET_META_FILENAME)
    name = meta.get("name") or "Bundled dataset"
    return {
        "stamp": DEFAULT_ARCHIVE_STAMP,
        "path": str(DEFAULT_DATA_DIR),
        "name": name,
        "is_default": True,
        "is_current": False,
    }


def _current_dataset_entry() -> Optional[Dict[str, Any]]:
    if not _dataset_has_content(WEBAPP_DATA_DIR):
        return None
    meta = _read_dataset_meta(WEBAPP_DATA_DIR / DATASET_META_FILENAME)
    name = meta.get("name")
    if not name:
        try:
            min_d, max_d = _infer_available_date_range()
            name = f"{min_d.isoformat()} → {max_d.isoformat()}"
        except Exception:
            name = "Current dataset"
    return {
        "stamp": CURRENT_ARCHIVE_STAMP,
        "path": str(WEBAPP_DATA_DIR),
        "name": name,
        "is_default": False,
        "is_current": True,
    }


def _restore_archive(stamp: Optional[str] = None) -> Path:
    """Restore a previously archived dataset into webapp/data.

    - Archives the current dataset first (so revert is reversible).
    - Restores stations, date folders, and precomputed outputs if present.
    """
    archive_root = WEBAPP_DATA_DIR / "_archive"

    if stamp == DEFAULT_ARCHIVE_STAMP:
        if not _dataset_has_content(DEFAULT_DATA_DIR):
            raise HTTPException(status_code=404, detail="Default dataset not available")
        target = DEFAULT_DATA_DIR
    elif stamp == CURRENT_ARCHIVE_STAMP:
        raise HTTPException(status_code=400, detail="Current dataset is already active")
    else:
        archives = _list_archives()
        if not archives:
            raise HTTPException(status_code=404, detail="No archived datasets to restore")

        if stamp:
            candidate = archive_root / stamp
            if not candidate.exists():
                raise HTTPException(status_code=404, detail=f"Archive {stamp} not found")
            target = candidate
        else:
            target = archives[-1]

    # Preserve current dataset by archiving it first.
    _ensure_default_dataset()
    _archive_existing_dataset()

    # Clean current data dir (except _archive/_default) before restore.
    _clear_current_dataset()

    # Copy archived contents back.
    for item in target.iterdir():
        dest = WEBAPP_DATA_DIR / item.name
        if item.is_dir():
            shutil.copytree(item, dest)
        else:
            shutil.copy2(item, dest)

    _STATIONS_CACHE["mtime"] = None
    _STATIONS_CACHE["by_code"] = None
    _STATIONS_CACHE["codes_by_region_name"] = None
    return target


def _apply_archive(stamp: str) -> Path:
    """Apply an archived dataset as the current dataset without creating a backup.

    - Simply loads the specified archive as current data.
    - Does NOT archive the current dataset first.
    - Useful for quickly switching between datasets without backup overhead.
    """
    archive_root = WEBAPP_DATA_DIR / "_archive"
    if stamp == DEFAULT_ARCHIVE_STAMP:
        if not _dataset_has_content(DEFAULT_DATA_DIR):
            raise HTTPException(status_code=404, detail="Default dataset not available")
        candidate = DEFAULT_DATA_DIR
    elif stamp == CURRENT_ARCHIVE_STAMP:
        raise HTTPException(status_code=400, detail="Current dataset is already active")
    else:
        candidate = archive_root / stamp
        if not candidate.exists():
            raise HTTPException(status_code=404, detail=f"Archive {stamp} not found")

    # Clean current data dir (except _archive/_default) before applying.
    _clear_current_dataset()

    # Copy archived contents to current location.
    for item in candidate.iterdir():
        dest = WEBAPP_DATA_DIR / item.name
        if item.is_dir():
            shutil.copytree(item, dest)
        else:
            shutil.copy2(item, dest)

    _STATIONS_CACHE["mtime"] = None
    _STATIONS_CACHE["by_code"] = None
    _STATIONS_CACHE["codes_by_region_name"] = None
    return candidate


def _copy_dataset_into_webapp(dataset_root: Path) -> None:
    for item in dataset_root.iterdir():
        if item.is_file() and item.name in {"stations.csv", "stations.clean.csv", "stations.geojson"}:
            shutil.copy2(item, WEBAPP_DATA_DIR / item.name)
            continue
        if item.is_dir() and _is_date_dir_name(item.name):
            shutil.copytree(item, WEBAPP_DATA_DIR / item.name)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

    _STATIONS_CACHE["mtime"] = None
    _STATIONS_CACHE["by_code"] = None
    _STATIONS_CACHE["codes_by_region_name"] = None


def _pick_precompute_range() -> tuple[date, date, bool]:
    min_d, max_d = _infer_available_date_range()
    total_days = (max_d - min_d).days + 1
    if total_days > MAX_RANGE_DAYS:
        start = max_d - timedelta(days=MAX_RANGE_DAYS - 1)
        return start, max_d, True
    return min_d, max_d, False


def _precompute_default_outputs() -> Dict[str, Any]:
    start_d, end_d, clamped = _pick_precompute_range()
    get_describe_stats(
        start_date=start_d.isoformat(),
        end_date=end_d.isoformat(),
        recompute=True,
    )
    get_delay_boxplot(
        start_date=start_d.isoformat(),
        end_date=end_d.isoformat(),
        recompute=True,
    )
    get_day_train_count(
        start_date=start_d.isoformat(),
        end_date=end_d.isoformat(),
        recompute=True,
    )
    return {
        "start_date": start_d.isoformat(),
        "end_date": end_d.isoformat(),
        "clamped_to_max_range": clamped,
    }


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


@app.get("/meta/regions")
def meta_regions():
    """Return all known Italian regions (names) used by the UI filters."""
    # Keep a stable order by region code.
    return {"regions": [REGION_CODE_TO_NAME[k] for k in sorted(REGION_CODE_TO_NAME.keys())]}


@app.get("/meta/companies")
def meta_companies():
    """Return all railway company codes used by the dataset and analyzer."""
    # Include a UI-only sentinel for “no filter”.
    companies = [{"code": "ALL", "label": "Generale"}]
    for member in RailwayCompany:
        # RailwayCompany.from_code maps numeric client_code -> member.name
        companies.append({"code": member.name, "label": member.name})
    return {"companies": companies}


@app.get("/health")
def health():
    """Simple health check used by the frontend/dev tooling."""
    return {"status": "ok"}


@app.get("/data/info")
def get_data_info():
    """Return info about the current local dataset."""
    try:
        min_d, max_d = _infer_available_date_range()
        meta = _read_dataset_meta(WEBAPP_DATA_DIR / DATASET_META_FILENAME)
        return {
            "available_min_date": min_d.isoformat(),
            "available_max_date": max_d.isoformat(),
            "data_root": str(WEBAPP_DATA_DIR),
            "dataset_name": meta.get("name"),
        }
    except HTTPException as exc:
        raise exc
    except Exception:
        return {
            "available_min_date": None,
            "available_max_date": None,
            "data_root": str(WEBAPP_DATA_DIR),
            "dataset_name": None,
        }


@app.get("/data/archives")
def list_archived_datasets():
    """List available archived datasets (newest last)."""
    archives: List[Dict[str, Any]] = []

    current_entry = _current_dataset_entry()
    if current_entry:
        archives.append(current_entry)

    default_entry = _default_archive_entry()
    if default_entry:
        archives.append(default_entry)

    archives.extend([
        {
            "stamp": p.name,
            "path": str(p),
            "name": (_read_dataset_meta(p / DATASET_META_FILENAME).get("name") or None),
            "is_default": False,
            "is_current": False,
        }
        for p in _list_archives()
    ])

    return {"archives": archives}


@app.post("/data/revert")
def revert_to_archive(stamp: Optional[str] = Form(None)):
    """Restore the most recent (or specified) archived dataset."""
    restored = _restore_archive(stamp)
    return {
        "status": "ok",
        "restored_from": restored.name,
    }


@app.post("/data/apply-archive")
def apply_archive_dataset(stamp: str = Form(...)):
    """Apply (load) a specific archived dataset as current without creating a backup.
    
    This allows quick switching between datasets without the overhead of 
    creating a new archive entry.
    """
    try:
        applied = _apply_archive(stamp)
        meta = _read_dataset_meta(applied / DATASET_META_FILENAME)
        min_d, max_d = _infer_available_date_range()
        
        return {
            "status": "ok",
            "applied_from": applied.name,
            "dataset_name": meta.get("name"),
            "available_min_date": min_d.isoformat(),
            "available_max_date": max_d.isoformat(),
        }
    except HTTPException as exc:
        raise exc
    except Exception as e:
        print(f"[ERROR] Failed to apply archive: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to apply archive: {str(e)}")


@app.post("/data/delete-archive")
def delete_archive(stamp: str = Form(...)):
    """Delete a specific archived dataset."""
    if stamp in {DEFAULT_ARCHIVE_STAMP, CURRENT_ARCHIVE_STAMP}:
        raise HTTPException(status_code=400, detail="Selected dataset cannot be deleted")

    archive_root = WEBAPP_DATA_DIR / "_archive"
    archive_path = archive_root / stamp
    
    if not archive_path.exists():
        raise HTTPException(status_code=404, detail=f"Archive {stamp} not found")
    
    try:
        shutil.rmtree(archive_path)
        print(f"[INFO] Archive {stamp} deleted successfully")
        return {
            "status": "ok",
            "message": f"Archive {stamp} deleted successfully",
            "deleted_stamp": stamp,
        }
    except Exception as e:
        print(f"[ERROR] Failed to delete archive {stamp}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete archive: {str(e)}")


@app.post("/data/clear-archives")
def clear_all_archives():
    """Delete all archived datasets. Only removes temporary backups in _archive, not current data."""
    archive_root = WEBAPP_DATA_DIR / "_archive"

    _ensure_default_dataset()

    if archive_root.exists():
        try:
            # Reset current data to default before clearing archives.
            if _dataset_has_content(DEFAULT_DATA_DIR):
                _clear_current_dataset()
                _copy_dataset_contents(DEFAULT_DATA_DIR, WEBAPP_DATA_DIR)

            shutil.rmtree(archive_root)
            print("[INFO] All archives cleared successfully")
        except Exception as e:
            print(f"[ERROR] Failed to clear archives: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to clear archives: {str(e)}")
    
    return {
        "status": "ok",
        "message": "All archives cleared successfully",
    }


@app.post("/data/upload")
async def upload_data(
    background_tasks: BackgroundTasks,
    upload_mode: Optional[str] = Form(None),
    precompute: bool = Form(True),
    dataset_name: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    files: Optional[List[UploadFile]] = File(None),
    paths: Optional[List[str]] = Form(None),
    stations_file: Optional[UploadFile] = File(None),
    zip_file: Optional[UploadFile] = File(None),
):
    """Upload a dataset (ZIP or folder contents) and replace the local webapp dataset."""
    mode = (upload_mode or "").strip().lower()
    if mode not in {"zip", "folder", "stations", "full", ""}:
        raise HTTPException(status_code=400, detail="upload_mode must be 'zip', 'folder', 'stations', or 'full'")

    upload_stats = {}
    _ensure_default_dataset()
    archive_stamp: Optional[str] = None

    # Handle "full" mode - both stations and ZIP files
    if mode == "full":
        if zip_file:
            if not (zip_file.filename or "").lower().endswith(".zip"):
                raise HTTPException(status_code=400, detail="ZIP file must be .zip")
            with tempfile.TemporaryDirectory() as tmpdir:
                tmp_root = Path(tmpdir)
                zip_path = tmp_root / "upload.zip"
                with open(zip_path, "wb") as out:
                    shutil.copyfileobj(zip_file.file, out)
                extract_root = tmp_root / "extracted"
                extract_root.mkdir(parents=True, exist_ok=True)
                _safe_extract_zip(zip_path, extract_root)
                dataset_root = _find_dataset_root(extract_root)

                archived_dir = _archive_existing_dataset()
                if archived_dir:
                    archive_stamp = archived_dir.name
                _copy_dataset_into_webapp(dataset_root)
                
                # Compute upload stats from imported data
                train_dates = []
                for item in WEBAPP_DATA_DIR.iterdir():
                    if item.is_dir() and _is_date_dir_name(item.name):
                        train_dates.append(item.name)
                train_dates.sort()
                if train_dates:
                    upload_stats["train_dates"] = train_dates
                    upload_stats["date_range"] = {
                        "start": train_dates[0],
                        "end": train_dates[-1]
                    }

        # Write stations.csv AFTER archiving/copying ZIP contents so it remains active.
        if stations_file:
            if not (stations_file.filename or "").lower().endswith(".csv"):
                raise HTTPException(status_code=400, detail="Stations file must be .csv")
            stations_path = STATIONS_CSV_PATH
            with open(stations_path, "wb") as out:
                shutil.copyfileobj(stations_file.file, out)
            upload_stats["stations_uploaded"] = True

        if not stations_file and not zip_file:
            raise HTTPException(status_code=400, detail="At least one file (stations or ZIP) required")

        # Clear cache after stations upload (if no zip_file, otherwise _copy_dataset_into_webapp handles it)
        if stations_file and not zip_file:
            _STATIONS_CACHE["mtime"] = None
            _STATIONS_CACHE["by_code"] = None
            _STATIONS_CACHE["codes_by_region_name"] = None

        _write_dataset_meta(WEBAPP_DATA_DIR, dataset_name)

        precompute_range = None
        if precompute and zip_file:
            precompute_range = _pick_precompute_range()
            background_tasks.add_task(_precompute_default_outputs)

        return {
            "status": "ok",
            "precompute": bool(precompute and zip_file),
            "upload_stats": upload_stats,
            "precompute_range": {
                "start_date": precompute_range[0].isoformat(),
                "end_date": precompute_range[1].isoformat(),
                "clamped_to_max_range": precompute_range[2],
            } if precompute_range else None,
            "archived_stamp": archive_stamp,
        }

    if mode == "stations":
        if not file:
            raise HTTPException(status_code=400, detail="Missing upload file")
        if not (file.filename or "").lower().endswith(".csv"):
            raise HTTPException(status_code=400, detail="Stations upload requires a .csv file")
        # Save stations.csv directly to the data directory
        stations_path = STATIONS_CSV_PATH
        with open(stations_path, "wb") as out:
            shutil.copyfileobj(file.file, out)
        
        # Clear cache after stations file upload
        _STATIONS_CACHE["mtime"] = None
        _STATIONS_CACHE["by_code"] = None
        _STATIONS_CACHE["codes_by_region_name"] = None
        
        _write_dataset_meta(WEBAPP_DATA_DIR, dataset_name)
        return {
            "status": "ok",
            "precompute": False,
            "precompute_range": None,
            "archived_stamp": archive_stamp,
        }

    if mode == "zip" or (mode == "" and file is not None):
        if not file:
            raise HTTPException(status_code=400, detail="Missing upload file")
        if not (file.filename or "").lower().endswith(".zip"):
            raise HTTPException(status_code=400, detail="ZIP upload requires a .zip file")
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_root = Path(tmpdir)
            zip_path = tmp_root / "upload.zip"
            with open(zip_path, "wb") as out:
                shutil.copyfileobj(file.file, out)
            extract_root = tmp_root / "extracted"
            extract_root.mkdir(parents=True, exist_ok=True)
            _safe_extract_zip(zip_path, extract_root)
            dataset_root = _find_dataset_root(extract_root)

            archived_dir = _archive_existing_dataset()
            if archived_dir:
                archive_stamp = archived_dir.name
            _copy_dataset_into_webapp(dataset_root)
            _write_dataset_meta(WEBAPP_DATA_DIR, dataset_name)
    else:
        if not files:
            raise HTTPException(status_code=400, detail="Missing upload files")
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_root = Path(tmpdir)
            upload_root = tmp_root / "extracted"
            upload_root.mkdir(parents=True, exist_ok=True)
            _write_upload_files(upload_root, files, paths)
            dataset_root = _find_dataset_root(upload_root)

            archived_dir = _archive_existing_dataset()
            if archived_dir:
                archive_stamp = archived_dir.name
            _copy_dataset_into_webapp(dataset_root)
        _write_dataset_meta(WEBAPP_DATA_DIR, dataset_name)

    precompute_range = None
    if precompute:
        precompute_range = _pick_precompute_range()
        background_tasks.add_task(_precompute_default_outputs)

    return {
        "status": "ok",
        "precompute": bool(precompute),
        "precompute_range": {
            "start_date": precompute_range[0].isoformat(),
            "end_date": precompute_range[1].isoformat(),
            "clamped_to_max_range": precompute_range[2],
        } if precompute_range else None,
        "archived_stamp": archive_stamp,
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

    # Count unique trains instead of total rows (stops)
    unique_train_count = df['train_hash'].nunique() if 'train_hash' in df.columns else None

    payload: Dict[str, Any] = {
        "available_min_date": available_min,
        "available_max_date": available_max,
        "used_default_window": used_default_window,
        "default_window_days": default_window_days if used_default_window else None,
        "start_date": s.isoformat(),
        "end_date": e.isoformat(),
        "column": preferred_col,
        "count": unique_train_count,  # Count unique trains, not stops
        "mean": _as_number(summary.get("mean")),
        "std": _as_number(summary.get("std")),
        "min": _as_number(summary.get("min")),
        "25%": _as_number(summary.get("25%")),
        "50%": _as_number(summary.get("50%")),
        "75%": _as_number(summary.get("75%")),
        "max": _as_number(summary.get("max")),
        "describe": {k: {sk: _as_number(sv) for sk, sv in (v or {}).items()} for k, v in table.items()},
    }

    sanitized = sanitize_for_json(payload)
    with open(cache_json, "w", encoding="utf-8") as f:
        json.dump(sanitized, f, ensure_ascii=False)

    return sanitized



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

        def _norm_row(row: Dict[str, str]) -> Dict[str, str]:
            out: Dict[str, str] = {}
            for k, v in (row or {}).items():
                if k is None:
                    continue
                key = str(k).strip().lower()
                out[key] = "" if v is None else str(v)
            return out

        def _get(row: Dict[str, str], *keys: str) -> str:
            for key in keys:
                if not key:
                    continue
                v = row.get(key)
                if v is not None:
                    return str(v)
            return ""

        def _parse_coord(raw: str) -> Optional[float]:
            s = (raw or "").strip()
            if not s:
                return None
            # Handle common European decimal comma.
            if "," in s and "." not in s:
                s = s.replace(",", ".")
            # Strip degree sign if present.
            s = s.replace("°", "").strip()
            try:
                return float(s)
            except ValueError:
                return None

        for row in _read_csv_rows(path):
            r = _norm_row(row)
            code = _get(r, "code", "station_code", "stationcode", "codice", "id").strip()
            region = _get(r, "region", "region_code", "regione").strip()

            region_code: Optional[int] = None
            if region != "":
                try:
                    region_code = int(region)
                except ValueError:
                    region_code = None
            region_name = REGION_CODE_TO_NAME.get(region_code) if region_code else None

            long_name = _get(r, "long_name", "longname", "name", "nome", "denominazione").strip()
            short_name = _get(r, "short_name", "shortname", "short", "abbr", "abbrev").strip()

            # Prefer long_name for display; fall back to short_name or code.
            display_name = long_name or short_name or code

            lat_raw = _get(r, "latitude", "lat", "latitudine").strip()
            lon_raw = _get(r, "longitude", "lon", "lng", "longitudine").strip()

            geometry = None
            if lat_raw and lon_raw:
                lat = _parse_coord(lat_raw)
                lon = _parse_coord(lon_raw)
                if lat is not None and lon is not None and (-90.0 <= lat <= 90.0) and (-180.0 <= lon <= 180.0):
                    geometry = {"type": "Point", "coordinates": [lon, lat]}

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
    
    # No station file exists: return an empty FeatureCollection so the UI can show an empty state.
    return {"type": "FeatureCollection", "features": []}


@app.get("/stats/external-station/{station_code}")
def get_external_station_stats(station_code: str, date: Optional[str] = None):
    """
    Fetch station statistics from external TrainStats API.
    Example: /stats/external-station/ABBASANTA?date=08_02_2026
    Date format: DD_MM_YYYY (default: yesterday)
    """
    try:
        import requests
        from bs4 import BeautifulSoup
        import json
        import re
        from datetime import datetime, timedelta
        
        # Default to yesterday if no date provided
        if not date:
            yesterday = datetime.now() - timedelta(days=1)
            date = yesterday.strftime("%d_%m_%Y")
        
        # TrainStats API is case-sensitive - convert to uppercase
        station_code_upper = station_code.upper()
        
        url = "https://trainstats.altervista.org/speciali/stazioni/"
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

        # Use query params so station names with spaces/apostrophes are encoded correctly.
        response = requests.get(
            url,
            params={"n": station_code_upper, "data": date},
            headers=headers,
            timeout=10,
        )
        if response.status_code != 200:
            raise HTTPException(status_code=404, detail=f"Station {station_code} not found on TrainStats")
        
        response.encoding = 'utf-8'
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Extract station name from title
        title_tag = soup.find('title')
        station_name = 'Unknown'
        if title_tag:
            parts = title_tag.text.split('-')
            if len(parts) > 1:
                station_name = parts[-1].strip()
        
        # Extract JSON data from JavaScript - more robust approach
        scripts = soup.find_all('script')
        data = None
        
        for script in scripts:
            if script.string is None:
                continue
            script_str = script.string
            if 'var datastring' not in script_str:
                continue
                
            # Look for the pattern: var datastring = '...'
            try:
                # Find where the JSON starts (after the opening quote)
                start_marker = "var datastring = '"
                start_pos = script_str.find(start_marker)
                if start_pos == -1:
                    continue
                    
                start_pos += len(start_marker)
                
                # Find the ending quote - look for }' pattern
                # The JSON ends with }';" or just }'
                end_pos = script_str.find("'", start_pos)
                
                # Search backwards from end_pos to find the real JSON end
                while end_pos > start_pos:
                    # Check if this is preceded by a closing brace
                    if end_pos > 0 and script_str[end_pos - 1] == '}':
                        json_str = script_str[start_pos:end_pos]
                        try:
                            data = json.loads(json_str)
                            break
                        except json.JSONDecodeError:
                            # Try next quote
                            end_pos = script_str.find("'", end_pos + 1)
                            if end_pos == -1:
                                break
                    else:
                        end_pos = script_str.find("'", end_pos + 1)
                        if end_pos == -1:
                            break
                
                if data:
                    break
                    
            except Exception as extract_err:
                continue
        
        # Helper function to parse distribution data
        def parse_distribution(dist_string):
            """Parse the distribution string format: times##scheduled##actual"""
            if not dist_string:
                return {}
            try:
                parts = dist_string.split('##')
                if len(parts) < 3:
                    return {}
                times = parts[0].split(';')
                scheduled = [int(x) for x in parts[1].split(';')]
                actual = [int(x) for x in parts[2].split(';')]
                return {
                    'times': times,
                    'scheduled': scheduled,
                    'actual': actual
                }
            except:
                return {}
        
        # Try to get location data from local stations.csv
        location_data = None
        try:
            for row in _read_csv_rows(STATIONS_CSV_PATH):
                # Match by station name (case-insensitive)
                row_name = row.get('long_name', '') or row.get('short_name', '')
                if row_name.strip().upper() == station_code.upper():
                    lat = row.get('latitude', '')
                    lon = row.get('longitude', '')
                    region_code_str = row.get('region', '')
                    if lat and lon:
                        try:
                            region_code = int(region_code_str) if region_code_str else None
                            location_data = {
                                'latitude': float(lat),
                                'longitude': float(lon),
                                'region_code': region_code,
                                'region': REGION_CODE_TO_NAME.get(region_code, 'Unknown'),
                                'code': row.get('code', '')
                            }
                        except (ValueError, TypeError):
                            pass
                    break
        except Exception:
            pass  # If stations.csv is not available, continue without location
        
        stats = {
            'station_code': station_code,
            'station_name': station_name,
            'date': date,
            'location': location_data.copy() if location_data else None,
            'stops': {},
            'traffic_type': {},
            'distribution_departures': {},
            'distribution_arrivals': {},
            'punctuality_departure': {},
            'punctuality_arrival': {},
            'categories': {},
            'worst_trains': {}
        }
        
        if data:
            try:
                # Map trainstats data to our stats structure
                total_stops = data.get('treniMonitorati', 0)
                cancelled_stops = data.get('treniCancellati', 0)
                
                # Stops (Fermate)
                stats['stops'] = {
                    'Totali': {'value': total_stops, 'percentage': '100%'},
                    'Effettuate': {'value': total_stops - cancelled_stops, 'percentage': f'{((total_stops - cancelled_stops) / total_stops * 100):.1f}%' if total_stops > 0 else '0%'},
                    'Soppresse': {'value': cancelled_stops, 'percentage': f'{(cancelled_stops / total_stops * 100):.1f}%' if total_stops > 0 else '0%'}
                }
                
                # Traffic type (Tipo di traffico)
                arrivals = data.get('arrivi', 0)
                transits = data.get('transiti', 0)
                departures = data.get('partenze', 0)
                traffic_total = arrivals + transits + departures
                
                stats['traffic_type'] = {
                    'Arrivi': {'value': arrivals, 'percentage': f'{(arrivals / traffic_total * 100):.1f}%' if traffic_total > 0 else '0%'},
                    'Transiti': {'value': transits, 'percentage': f'{(transits / traffic_total * 100):.1f}%' if traffic_total > 0 else '0%'},
                    'Partenze': {'value': departures, 'percentage': f'{(departures / traffic_total * 100):.1f}%' if traffic_total > 0 else '0%'}
                }
                
                # Distribution of departures (Distribuzione partenze)
                stats['distribution_departures'] = parse_distribution(data.get('partenzedist', ''))
                
                # Distribution of arrivals (Distribuzione arrivi)
                stats['distribution_arrivals'] = parse_distribution(data.get('arrividist', ''))
                
                # Punctuality departure
                dep_on_time = data.get('partenzaInOrario', 0)
                dep_late = data.get('partenzaRitardo', 0)
                dep_not_detected = data.get('partenzaNonRilevata', 0)
                dep_total = dep_on_time + dep_late + dep_not_detected
                
                if dep_total > 0:
                    stats['punctuality_departure'] = {
                        'In orario': {'value': dep_on_time, 'percentage': f'{(dep_on_time / dep_total * 100):.1f}%'},
                        'In ritardo': {'value': dep_late, 'percentage': f'{(dep_late / dep_total * 100):.1f}%'},
                        'Non rilevati': {'value': dep_not_detected, 'percentage': f'{(dep_not_detected / dep_total * 100):.1f}%'}
                    }
                
                # Punctuality arrival
                arr_on_time = data.get('arrivoInOrario', 0)
                arr_late = data.get('arrivoInRitardo', 0)
                arr_early = data.get('arrivoAnticipo', 0)
                arr_not_detected = data.get('arrivoNonRilevato', 0)
                arr_total = arr_on_time + arr_late + arr_early + arr_not_detected
                
                if arr_total > 0:
                    stats['punctuality_arrival'] = {
                        'In anticipo': {'value': arr_early, 'percentage': f'{(arr_early / arr_total * 100):.1f}%'},
                        'In orario': {'value': arr_on_time, 'percentage': f'{(arr_on_time / arr_total * 100):.1f}%'},
                        'In ritardo': {'value': arr_late, 'percentage': f'{(arr_late / arr_total * 100):.1f}%'},
                        'Non rilevati': {'value': arr_not_detected, 'percentage': f'{(arr_not_detected / arr_total * 100):.1f}%'}
                    }
                
                # Train categories
                categories = {
                    'Regionali': data.get('numREG', 0),
                    'InterCity': data.get('numIC', 0),
                    'EuroCity': data.get('numEC', 0),
                    'EuroNotte': data.get('numEN', 0),
                    'Frecce': data.get('numES', 0)
                }
                
                if total_stops > 0:
                    stats['categories'] = {
                        k: {'value': v, 'percentage': f'{(v / total_stops * 100):.1f}%'} 
                        for k, v in categories.items() if v > 0
                    }
                
                # Worst trains (if available)
                worst_dep = data.get('trenoPeggioreInPartenza', '')
                worst_arr = data.get('trenoPeggioreInArrivo', '')
                delay_dep = data.get('ritardoPartenzaTrenoPeggiore', 0)
                delay_arr = data.get('ritardoArrivoTrenoPeggiore', 0)
                
                if worst_dep or worst_arr:
                    stats['worst_trains'] = {}
                    if worst_dep and delay_dep:
                        stats['worst_trains']['departure'] = {
                            'train': worst_dep,
                            'delay_minutes': delay_dep
                        }
                    if worst_arr and delay_arr:
                        stats['worst_trains']['arrival'] = {
                            'train': worst_arr,
                            'delay_minutes': delay_arr
                        }
                
            except Exception as parse_err:
                # If JSON parsing fails, keep the empty stats structure
                pass
        
        return {
            'success': True,
            'data': stats,
            'source': 'trainstats.altervista.org'
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching external station stats: {str(e)}"
        )


@app.get("/stats/external-relation")
def get_external_relation(
    stazpart: Optional[str] = None,
    stazarr: Optional[str] = None,
    departure: Optional[str] = None,
    destination: Optional[str] = None,
    debug: int = 0,
):
    """
    Fetch relation data between two stations from TrainStats.
    Accepts query params compatible with TrainStats: stazpart, stazarr.
    """
    from_station = (departure or stazpart or "").strip()
    to_station = (destination or stazarr or "").strip()

    if not from_station or not to_station:
        raise HTTPException(status_code=400, detail="Both departure and destination are required")

    try:
        import requests
        from bs4 import BeautifulSoup

        url = "https://trainstats.altervista.org/cercarelazione.php"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Referer": "https://trainstats.altervista.org/cercarelazione.php",
        }

        def _abbrev_station_name(value: str) -> List[str]:
            import re

            name = (value or "").strip().upper()
            if not name:
                return []
            name = name.replace("PORTA ", "P.")
            name = name.replace("SANTA ", "S.")
            name = name.replace("SAN ", "S.")
            name = name.replace("SANT'", "S.")
            name = " ".join(name.split())

            condensed = re.sub(r"\b([A-Z])\.\s+", r"\1.", name)

            variants = [name, condensed]
            extra = name.replace("PORTA NUOVA", "P.NUOVA")
            if extra != name:
                variants.append(extra)
            extra_condensed = condensed.replace("PORTA NUOVA", "P.NUOVA")
            if extra_condensed != condensed:
                variants.append(extra_condensed)
            return variants

        def _normalize_station_key(value: str) -> str:
            import re
            import unicodedata

            text = (value or "").strip().upper()
            if not text:
                return ""
            text = unicodedata.normalize("NFKD", text)
            text = "".join([c for c in text if not unicodedata.combining(c)])
            text = text.replace("'", " ")
            text = re.sub(r"[^A-Z0-9\.\s]", " ", text)
            text = re.sub(r"\s+", " ", text).strip()
            return text

        def _load_trainstats_station_map() -> Dict[str, str]:
            import time
            import re

            cache = _TRAINSTATS_STATION_CACHE
            now = time.time()
            if cache.get("ts") and cache.get("by_norm") and (now - cache["ts"]) < 21600:
                return cache["by_norm"]

            try:
                script_url = "https://trainstats.altervista.org/script/scriptCercaRelazioni.js?v=2"
                resp = requests.get(script_url, headers=headers, timeout=10)
                if resp.status_code != 200:
                    return cache.get("by_norm") or {}
                resp.encoding = "utf-8"
                by_norm: Dict[str, str] = {}
                raw_list = resp.text
                array_match = re.search(r"var\s+value\s*=\s*\[(.*?)\];", raw_list, flags=re.S)
                array_blob = array_match.group(1) if array_match else raw_list
                matches = re.findall(r'"([^"]+)"', array_blob)
                for raw in matches:
                    raw = (raw or "").strip()
                    if not raw:
                        continue
                    key = _normalize_station_key(raw)
                    if key and key not in by_norm:
                        by_norm[key] = raw
                    key_no_dot = key.replace(".", "")
                    if key_no_dot and key_no_dot not in by_norm:
                        by_norm[key_no_dot] = raw
                cache["ts"] = now
                cache["by_norm"] = by_norm
                return by_norm
            except Exception:
                return cache.get("by_norm") or {}

        def _map_to_trainstats_name(value: str) -> Optional[str]:
            by_norm = _load_trainstats_station_map()
            if not by_norm:
                return None
            key = _normalize_station_key(value)
            if not key:
                return None
            if key in by_norm:
                return by_norm[key]
            key_no_dot = key.replace(".", "")
            if key_no_dot in by_norm:
                return by_norm[key_no_dot]
            for cand_key, cand_value in by_norm.items():
                if key in cand_key or cand_key in key:
                    return cand_value
            return None

        def _station_name_candidates(value: str) -> List[str]:
            import re

            base = (value or "").strip()
            if not base:
                return []

            base = re.sub(r"\s*\([^)]*\)\s*$", "", base).strip()

            candidates = [base, base.upper()]

            mapped = _map_to_trainstats_name(base)
            if mapped:
                candidates.insert(0, mapped)

            try:
                stations_index = _load_stations_index()
                by_code = stations_index.get("by_code") or {}
                needle = base.strip().lower()
                for code, meta in by_code.items():
                    name = str(meta.get("name") or "")
                    short_name = str(meta.get("short_name") or "")
                    if needle == code.lower() or needle == name.lower() or needle == short_name.lower():
                        if name:
                            candidates.append(name)
                        if short_name:
                            candidates.append(short_name)
                        break
            except Exception:
                pass

            for abbrev in _abbrev_station_name(base):
                candidates.append(abbrev)

            uniq = []
            seen = set()
            for c in candidates:
                if not c:
                    continue
                key = c.strip().lower()
                if key in seen:
                    continue
                seen.add(key)
                uniq.append(c)
            return uniq

        def _parse_relation_html(html: str) -> List[Dict[str, Any]]:
            import re

            if "Fatal error" in html:
                return []

            def _normalize_cells(cells: List[str]) -> List[str]:
                category_codes = {"FR", "REG", "IC", "NCL", "EC", "EN", "ES", "FA", "FB"}
                if not cells:
                    return []
                lower_cells = " ".join([c for c in cells if c]).lower()
                if any(k in lower_cells for k in ["categoria", "n. treno", "stazione partenza", "stazione arrivo", "arrivo prog", "partenza prog"]):
                    return []
                if cells and cells[0] == "" and len(cells) > 1:
                    cells = cells[1:]
                if len(cells) > 1 and cells[0] not in category_codes and cells[1] in category_codes:
                    cells = cells[1:]
                return cells

            results = []

            try:
                soup = BeautifulSoup(html, "html.parser")
                tables = soup.find_all("table")
                for table in tables:
                    rows = table.find_all("tr")
                    for row in rows:
                        raw_cells = [c.get_text(strip=True) for c in row.find_all(["td", "th"])]
                        cells = [c for c in raw_cells if c is not None]
                        cells = _normalize_cells(cells)
                        if len(cells) < 6:
                            continue
                        results.append(cells)
            except Exception:
                results = []

            if results:
                parsed = []
                for cells in results:
                    item = {
                        "category": cells[0],
                        "train_number": cells[1] if len(cells) > 1 else None,
                        "origin": cells[2] if len(cells) > 2 else None,
                        "origin_time": cells[3] if len(cells) > 3 else None,
                        "origin_delay": cells[4] if len(cells) > 4 else None,
                        "destination": cells[5] if len(cells) > 5 else None,
                        "destination_time": cells[6] if len(cells) > 6 else None,
                        "destination_delay": cells[7] if len(cells) > 7 else None,
                        "track": cells[8] if len(cells) > 8 else None,
                        "date": cells[9] if len(cells) > 9 else None,
                        "raw": cells,
                    }
                    parsed.append(item)
                return parsed

            row_html = re.findall(r"<tr[^>]*>.*?</tr>", html, flags=re.S | re.I)
            for raw_row in row_html:
                cell_html = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", raw_row, flags=re.S | re.I)
                if not cell_html:
                    continue
                cells = []
                for cell in cell_html:
                    cleaned = re.sub(r"<[^>]+>", "", cell)
                    cleaned = re.sub(r"\s+", " ", cleaned).strip()
                    cells.append(cleaned)
                cells = _normalize_cells(cells)
                if len(cells) < 6:
                    continue
                item = {
                    "category": cells[0],
                    "train_number": cells[1] if len(cells) > 1 else None,
                    "origin": cells[2] if len(cells) > 2 else None,
                    "origin_time": cells[3] if len(cells) > 3 else None,
                    "origin_delay": cells[4] if len(cells) > 4 else None,
                    "destination": cells[5] if len(cells) > 5 else None,
                    "destination_time": cells[6] if len(cells) > 6 else None,
                    "destination_delay": cells[7] if len(cells) > 7 else None,
                    "track": cells[8] if len(cells) > 8 else None,
                    "date": cells[9] if len(cells) > 9 else None,
                    "raw": cells,
                }
                results.append(item)
            if results:
                return results

            row_html = re.findall(r"<tr[^>]*>.*?</tr>", html, flags=re.S | re.I)
            for raw_row in row_html:
                cell_html = re.findall(r"<td[^>]*>(.*?)</td>", raw_row, flags=re.S | re.I)
                if not cell_html:
                    continue
                cells = []
                for cell in cell_html:
                    cleaned = re.sub(r"<[^>]+>", "", cell)
                    cleaned = re.sub(r"\s+", " ", cleaned).strip()
                    cells.append(cleaned)
                cells = _normalize_cells(cells)
                if len(cells) < 6:
                    continue
                item = {
                    "category": cells[0],
                    "train_number": cells[1] if len(cells) > 1 else None,
                    "origin": cells[2] if len(cells) > 2 else None,
                    "origin_time": cells[3] if len(cells) > 3 else None,
                    "origin_delay": cells[4] if len(cells) > 4 else None,
                    "destination": cells[5] if len(cells) > 5 else None,
                    "destination_time": cells[6] if len(cells) > 6 else None,
                    "destination_delay": cells[7] if len(cells) > 7 else None,
                    "track": cells[8] if len(cells) > 8 else None,
                    "date": cells[9] if len(cells) > 9 else None,
                    "raw": cells,
                }
                results.append(item)
            return results

        def _fetch_relation_destinations(origin_name: str) -> List[str]:
            try:
                rel_url = "https://trainstats.altervista.org/libs/getRelazioniByCodStazione.php"
                query_url = f"{rel_url}?staz={quote(origin_name.upper())}"
                resp = session.get(query_url, timeout=10)
                if resp.status_code != 200:
                    return []
                text = (resp.text or "").strip()
                if len(text) <= 1:
                    return []
                parts = [p.strip() for p in text.split(";") if p and p.strip()]
                return parts
            except Exception:
                return []

        def _match_destination(dest_value: str, dest_list: List[str]) -> List[str]:
            key = _normalize_station_key(dest_value)
            key_no_dot = key.replace(".", "")
            matches = []
            for dest in dest_list:
                d_key = _normalize_station_key(dest)
                d_key_no_dot = d_key.replace(".", "")
                if not d_key:
                    continue
                if key == d_key or key_no_dot == d_key_no_dot:
                    matches.append(dest)
                    continue
            if matches:
                return matches
            for dest in dest_list:
                d_key = _normalize_station_key(dest)
                if key and d_key and (key in d_key or d_key in key):
                    matches.append(dest)
            return matches

        from_candidates = _station_name_candidates(from_station)
        to_candidates = _station_name_candidates(to_station)
        if not from_candidates:
            from_candidates = [from_station]
        if not to_candidates:
            to_candidates = [to_station]

        last_html = None
        from urllib.parse import quote

        session = requests.Session()
        session.headers.update(headers)

        debug_info = {
            "input": {"from": from_station, "to": to_station},
            "from_candidates": from_candidates[:6],
            "to_candidates": to_candidates[:6],
            "tried": [],
        }

        for from_name in from_candidates[:6]:
            relation_dests = _fetch_relation_destinations(from_name)
            dest_candidates = to_candidates[:6]
            dest_source = "candidates"
            if relation_dests:
                matched = _match_destination(to_station, relation_dests)
                if matched:
                    dest_candidates = matched
                    dest_source = "relation-list"
                else:
                    dest_source = "candidates-fallback"
                    if debug:
                        debug_info["tried"].append({
                            "from": from_name,
                            "to": None,
                            "status": 200,
                            "has_fatal": False,
                            "len": 0,
                            "note": "destination not in relation list; falling back to candidates",
                            "relation_list_count": len(relation_dests),
                        })

            for to_name in dest_candidates:
                origin_query = from_name.upper()
                destination_query = to_name.upper()
                query_url = (
                    f"{url}?stazpart={quote(origin_query)}&stazarr={quote(destination_query)}"
                )
                response = session.get(query_url, timeout=10)
                if debug:
                    debug_info["tried"].append(
                        {
                            "from": from_name,
                            "to": to_name,
                            "status": response.status_code,
                            "has_fatal": "Fatal error" in response.text,
                            "len": len(response.text or ""),
                            "dest_source": dest_source,
                            "query": {
                                "from": origin_query,
                                "to": destination_query,
                            },
                        }
                    )
                if response.status_code != 200:
                    continue
                response.encoding = "utf-8"
                last_html = response.text
                results = _parse_relation_html(last_html)
                if results:
                    payload = {
                        "success": True,
                        "departure": from_name,
                        "destination": to_name,
                        "count": len(results),
                        "rows": results,
                        "source": "trainstats.altervista.org",
                    }
                    if debug:
                        payload["debug"] = debug_info
                    return payload

        if last_html and "Fatal error" in last_html:
            if debug:
                raise HTTPException(status_code=404, detail={"message": "No relation data found for selected stations", "debug": debug_info})
            raise HTTPException(status_code=404, detail="No relation data found for selected stations")
        if debug:
            raise HTTPException(status_code=404, detail={"message": "No relation data found for selected stations", "debug": debug_info})
        raise HTTPException(status_code=404, detail="No relation data found for selected stations")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch relation data: {str(exc)}")


@app.get("/stats/external-relation-stations")
def get_external_relation_stations():
    """Return TrainStats station list for relation selection."""
    try:
        import requests
        import re
        import time

        cache = _TRAINSTATS_STATION_CACHE
        now = time.time()
        if cache.get("list") and cache.get("ts") and (now - cache["ts"]) < 21600:
            return {"stations": cache["list"]}

        script_url = "https://trainstats.altervista.org/script/scriptCercaRelazioni.js?v=2"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/javascript,application/javascript,*/*;q=0.8",
            "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
            "Referer": "https://trainstats.altervista.org/cercarelazione.php",
        }
        resp = requests.get(script_url, headers=headers, timeout=10)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to load TrainStats station list")
        resp.encoding = "utf-8"
        array_match = re.search(r"var\s+value\s*=\s*\[(.*?)\];", resp.text, flags=re.S)
        array_blob = array_match.group(1) if array_match else resp.text
        matches = re.findall(r'"([^"]+)"', array_blob)
        stations = sorted({(m or "").strip() for m in matches if (m or "").strip()})
        cache["ts"] = now
        cache["list"] = stations
        return {"stations": stations}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch TrainStats station list: {str(exc)}")


@app.get("/stats/external-relation-origins")
def get_external_relation_origins():
    """Return TrainStats origin list for relation selection."""
    return get_external_relation_stations()


@app.get("/stats/external-relation-destinations")
def get_external_relation_destinations(staz: str):
    """Return TrainStats destination list for a given origin station."""
    origin = (staz or "").strip()
    if not origin:
        raise HTTPException(status_code=400, detail="Origin station is required")

    try:
        import requests
        from urllib.parse import quote

        rel_url = "https://trainstats.altervista.org/libs/getRelazioniByCodStazione.php"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/plain,*/*;q=0.8",
            "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
            "Referer": "https://trainstats.altervista.org/cercarelazione.php",
        }
        query_url = f"{rel_url}?staz={quote(origin.upper())}"
        resp = requests.get(query_url, headers=headers, timeout=10)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to load TrainStats relation list")
        text = (resp.text or "").strip()
        if len(text) <= 1:
            return {"origin": origin, "destinations": []}
        destinations = sorted({p.strip() for p in text.split(";") if p and p.strip()})
        return {"origin": origin, "destinations": destinations}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch TrainStats relation list: {str(exc)}")


@app.get("/stats/external-train")
def get_external_train(
    treno: str,
    stazpart: str,
    stazarr: str,
    op: str,
    oa: str,
    ref: str = "cr",
):
    """Fetch train detail data from TrainStats cercatreno.php."""
    train_number = (treno or "").strip()
    origin = (stazpart or "").strip()
    destination = (stazarr or "").strip()
    origin_time = (op or "").strip()
    destination_time = (oa or "").strip()

    if not all([train_number, origin, destination, origin_time, destination_time]):
        raise HTTPException(status_code=400, detail="Missing required train detail parameters")

    try:
        import requests
        from bs4 import BeautifulSoup
        from urllib.parse import quote
        import re

        url = "https://trainstats.altervista.org/cercatreno.php"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Referer": "https://trainstats.altervista.org/cercarelazione.php",
        }

        query_url = (
            f"{url}?ref={quote(ref)}"
            f"&treno={quote(train_number)}"
            f"&stazpart={quote(origin)}"
            f"&stazarr={quote(destination)}"
            f"&op={quote(origin_time)}"
            f"&oa={quote(destination_time)}"
        )
        response = requests.get(query_url, headers=headers, timeout=12)
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to load TrainStats train detail")
        response.encoding = "utf-8"

        page_text = response.text

        soup = BeautifulSoup(page_text, "html.parser")

        def _table_rows(table):
            rows = []
            for row in table.find_all("tr"):
                cells = [c.get_text(" ", strip=True) for c in row.find_all(["th", "td"])]
                if cells:
                    rows.append(cells)
            return rows

        def _normalize_header(header):
            return [h.strip().lower() for h in header]

        def _normalize_cell(value: str) -> str:
            import re
            import unicodedata

            text = (value or "").strip().lower()
            if not text:
                return ""
            text = unicodedata.normalize("NFKD", text)
            text = "".join([c for c in text if not unicodedata.combining(c)])
            text = re.sub(r"[^a-z0-9\s]", " ", text)
            text = re.sub(r"\s+", " ", text).strip()
            return text

        def _clean_row(row):
            cleaned = [c.strip() for c in row if c is not None]
            if cleaned and cleaned[0] == "" and len(cleaned) > 1:
                cleaned = cleaned[1:]
            return cleaned

        def _row_contains_token(row, token):
            norm_token = _normalize_cell(token)
            for cell in row:
                if norm_token and norm_token in _normalize_cell(cell):
                    return True
            return False

        def _find_header_index(rows, required):
            required = {r.lower() for r in required}
            for idx, row in enumerate(rows):
                norm = {_normalize_cell(c) for c in row if c}
                if required.issubset(norm):
                    return idx
            return None

        def _first_non_empty(row):
            for cell in row:
                if cell and cell.strip():
                    return cell.strip()
            return ""

        def _last_non_empty(row):
            for cell in reversed(row):
                if cell and cell.strip():
                    return cell.strip()
            return ""

        def _extract_key_values(rows, valid_keys=None):
            data = {}
            keyset = {k.lower() for k in valid_keys} if valid_keys else None
            for row in rows:
                cleaned = _clean_row(row)
                key = _first_non_empty(cleaned)
                value = _last_non_empty(cleaned)
                if not key or key == value:
                    continue
                if keyset and key.lower() not in keyset:
                    continue
                data[key] = value
            return data

        def _rows_to_key_values(rows):
            data = {}
            for row in rows:
                cleaned = [c.strip() for c in row if c is not None]
                cleaned = [c for c in cleaned if c]
                if len(cleaned) < 2:
                    continue
                key = cleaned[0]
                value = cleaned[-1]
                if key:
                    data[key] = value
            return data

        regularity = {}
        punctuality_departure = {}
        punctuality_arrival = {}
        average_delay_by_day = []
        daily_records = []

        def _parse_inline_data(page_html: str):
            parsed = {
                "regularity": {},
                "punctuality_departure": {},
                "punctuality_arrival": {},
                "daily_records": [],
            }

            data_match = re.search(
                r"var\s+data\s*=\s*['\"]([^'\"]+)['\"]\s*\.split\(\s*['\"];['\"]\s*\)",
                page_html,
            )
            if data_match:
                raw_values = data_match.group(1).split(";")
                if len(raw_values) >= 9:
                    dep_on_time = raw_values[0]
                    dep_late = raw_values[1]
                    arr_early = raw_values[2]
                    arr_on_time = raw_values[3]
                    arr_late = raw_values[4]
                    regolari = raw_values[5]
                    cancellati = raw_values[6]
                    riprogrammati = raw_values[7]
                    totali = raw_values[8]

                    parsed["regularity"] = {
                        "Regolari": regolari,
                        "Riprogrammati": riprogrammati,
                        "Cancellati": cancellati,
                        "Totali": totali,
                    }
                    parsed["punctuality_departure"] = {
                        "In orario": dep_on_time,
                        "In ritardo": dep_late,
                    }
                    parsed["punctuality_arrival"] = {
                        "In anticipo": arr_early,
                        "In orario": arr_on_time,
                        "In ritardo": arr_late,
                    }

            csv_match = re.search(
                r"var\s+tabDGdataCSV\s*=\s*`(.*?)`\s*;",
                page_html,
                flags=re.S,
            )
            if csv_match:
                raw_csv = csv_match.group(1)
                flat = raw_csv.replace("\r", " ").replace("\n", " ")
                chunks = [c.strip() for c in re.split(r"\s{2,}", flat) if ";" in c]
                header_idx = None
                for idx, chunk in enumerate(chunks):
                    if chunk.strip().lower().startswith("giorno;data;"):
                        header_idx = idx
                        break

                if header_idx is not None:
                    header = chunks[header_idx].split(";")
                    header_map = {_normalize_cell(name): i for i, name in enumerate(header)}

                    def _idx_for(key: str) -> Optional[int]:
                        return header_map.get(_normalize_cell(key))

                    idx_day = _idx_for("giorno")
                    idx_date = _idx_for("data")
                    idx_origin = _idx_for("stazione partenza")
                    idx_origin_time = _idx_for("partenza prog")
                    idx_origin_delay = _idx_for("ritardo partenza")
                    idx_dest = _idx_for("stazione arrivo")
                    idx_dest_time = _idx_for("arrivo prog")
                    idx_dest_delay = _idx_for("ritardo arrivo")
                    idx_actions = _idx_for("provvedimenti")
                    idx_notes = _idx_for("variazioni")

                    for row in chunks[header_idx + 1 :]:
                        cols = [c.strip() for c in row.split(";")]
                        if len(cols) < 6:
                            continue
                        parsed["daily_records"].append(
                            {
                                "day": cols[idx_day] if idx_day is not None and idx_day < len(cols) else "",
                                "date": cols[idx_date] if idx_date is not None and idx_date < len(cols) else "",
                                "origin": cols[idx_origin] if idx_origin is not None and idx_origin < len(cols) else "",
                                "origin_time": cols[idx_origin_time] if idx_origin_time is not None and idx_origin_time < len(cols) else "",
                                "origin_delay": cols[idx_origin_delay] if idx_origin_delay is not None and idx_origin_delay < len(cols) else "",
                                "destination": cols[idx_dest] if idx_dest is not None and idx_dest < len(cols) else "",
                                "destination_time": cols[idx_dest_time] if idx_dest_time is not None and idx_dest_time < len(cols) else "",
                                "destination_delay": cols[idx_dest_delay] if idx_dest_delay is not None and idx_dest_delay < len(cols) else "",
                                "actions": cols[idx_actions] if idx_actions is not None and idx_actions < len(cols) else "",
                                "notes": cols[idx_notes] if idx_notes is not None and idx_notes < len(cols) else "",
                            }
                        )

            return parsed

        tables = soup.find_all("table")
        for table in tables:
            rows = _table_rows(table)
            if not rows:
                continue
            cleaned_rows = [_clean_row(r) for r in rows if r]
            cleaned_rows = [r for r in cleaned_rows if r]
            if not cleaned_rows:
                continue

            header = cleaned_rows[0]
            header_norm = _normalize_header(header)
            body_rows = cleaned_rows[1:] if len(cleaned_rows) > 1 else []

            reg_keys = {"regolari", "riprogrammati", "cancellati", "totali"}
            dep_keys = {"in orario", "in ritardo"}
            arr_keys = {"in anticipo", "in orario", "in ritardo"}

            treni_idx = _find_header_index(cleaned_rows, {"treni"})
            if treni_idx is not None:
                regularity = _extract_key_values(cleaned_rows[treni_idx + 1 :], reg_keys)
                if regularity:
                    continue

            partenza_idx = _find_header_index(cleaned_rows, {"partenza"})
            if partenza_idx is not None:
                punctuality_departure = _extract_key_values(cleaned_rows[partenza_idx + 1 :], dep_keys)
                if punctuality_departure:
                    continue

            arrivo_idx = _find_header_index(cleaned_rows, {"arrivo"})
            if arrivo_idx is not None:
                punctuality_arrival = _extract_key_values(cleaned_rows[arrivo_idx + 1 :], arr_keys)
                if punctuality_arrival:
                    continue

            avg_idx = _find_header_index(cleaned_rows, {"giorno", "partenza", "arrivo"})
            if avg_idx is not None:
                for row in cleaned_rows[avg_idx + 1 :]:
                    if len(row) < 3:
                        continue
                    average_delay_by_day.append({
                        "day": row[0],
                        "departure": row[1],
                        "arrival": row[2],
                    })
                if average_delay_by_day:
                    continue

            daily_idx = _find_header_index(
                cleaned_rows,
                {"giorno", "data", "stazione partenza", "partenza prog.", "ritardo partenza"},
            )
            if daily_idx is not None:
                header_row = cleaned_rows[daily_idx]
                header_map = { _normalize_cell(name): idx for idx, name in enumerate(header_row) }
                def _idx_for(key):
                    return header_map.get(_normalize_cell(key))

                idx_day = _idx_for("giorno")
                idx_date = _idx_for("data")
                idx_origin = _idx_for("stazione partenza")
                idx_origin_time = _idx_for("partenza prog")
                idx_origin_delay = _idx_for("ritardo partenza")
                idx_dest = _idx_for("stazione arrivo")
                idx_dest_time = _idx_for("arrivo prog")
                idx_dest_delay = _idx_for("ritardo arrivo")
                idx_actions = _idx_for("provvedimenti")
                idx_notes = _idx_for("variazioni")

                for row in cleaned_rows[daily_idx + 1 :]:
                    if len(row) < 5:
                        continue
                    daily_records.append({
                        "day": row[idx_day] if idx_day is not None and idx_day < len(row) else "",
                        "date": row[idx_date] if idx_date is not None and idx_date < len(row) else "",
                        "origin": row[idx_origin] if idx_origin is not None and idx_origin < len(row) else "",
                        "origin_time": row[idx_origin_time] if idx_origin_time is not None and idx_origin_time < len(row) else "",
                        "origin_delay": row[idx_origin_delay] if idx_origin_delay is not None and idx_origin_delay < len(row) else "",
                        "destination": row[idx_dest] if idx_dest is not None and idx_dest < len(row) else "",
                        "destination_time": row[idx_dest_time] if idx_dest_time is not None and idx_dest_time < len(row) else "",
                        "destination_delay": row[idx_dest_delay] if idx_dest_delay is not None and idx_dest_delay < len(row) else "",
                        "actions": row[idx_actions] if idx_actions is not None and idx_actions < len(row) else "",
                        "notes": row[idx_notes] if idx_notes is not None and idx_notes < len(row) else "",
                    })
                if daily_records:
                    continue

            if not regularity:
                regularity = _extract_key_values(cleaned_rows, reg_keys)

            if not punctuality_departure and any(_row_contains_token(r, "partenza") for r in cleaned_rows):
                punctuality_departure = _extract_key_values(cleaned_rows, dep_keys)

            if not punctuality_arrival and any(_row_contains_token(r, "arrivo") for r in cleaned_rows):
                punctuality_arrival = _extract_key_values(cleaned_rows, arr_keys)

            if header_norm and header_norm[0] == "treni":
                regularity = _rows_to_key_values(body_rows)
                continue

            if header_norm and header_norm[0] == "partenza":
                punctuality_departure = _rows_to_key_values(body_rows)
                continue

            if header_norm and header_norm[0] == "arrivo":
                punctuality_arrival = _rows_to_key_values(body_rows)
                continue

            if {"giorno", "partenza", "arrivo"}.issubset(set(header_norm)):
                for row in body_rows:
                    if len(row) < 3:
                        continue
                    average_delay_by_day.append({
                        "day": row[0],
                        "departure": row[1],
                        "arrival": row[2],
                    })
                continue

            if {"giorno", "data", "stazione partenza", "partenza prog.", "ritardo partenza"}.issubset(set(header_norm)):
                for row in body_rows:
                    if len(row) < 9:
                        continue
                    daily_records.append({
                        "day": row[0],
                        "date": row[1],
                        "origin": row[2],
                        "origin_time": row[3],
                        "origin_delay": row[4],
                        "destination": row[5],
                        "destination_time": row[6],
                        "destination_delay": row[7],
                        "actions": row[8] if len(row) > 8 else "",
                        "notes": row[9] if len(row) > 9 else "",
                    })
                continue

        inline = _parse_inline_data(page_text)
        if not regularity and inline.get("regularity"):
            regularity = inline["regularity"]
        if not punctuality_departure and inline.get("punctuality_departure"):
            punctuality_departure = inline["punctuality_departure"]
        if not punctuality_arrival and inline.get("punctuality_arrival"):
            punctuality_arrival = inline["punctuality_arrival"]
        if not daily_records and inline.get("daily_records"):
            daily_records = inline["daily_records"]

        title = (soup.title.get_text(strip=True) if soup.title else "")

        return {
            "success": True,
            "title": title,
            "train_number": train_number,
            "origin": origin,
            "destination": destination,
            "origin_time": origin_time,
            "destination_time": destination_time,
            "regularity": regularity,
            "punctuality_departure": punctuality_departure,
            "punctuality_arrival": punctuality_arrival,
            "average_delay_by_day": average_delay_by_day,
            "daily_records": daily_records,
            "source": "trainstats.altervista.org",
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch train detail: {str(exc)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

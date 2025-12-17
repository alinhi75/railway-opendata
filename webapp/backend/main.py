"""
Railway OpenData - FastAPI Backend
Serves precomputed statistics and data for the frontend

"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import json
import csv
from typing import Dict, Any, Optional, List, Iterable

# ViaggiaTreno region codes are numeric (0..22). 21/22 map to the autonomous provinces.
REGION_CODE_TO_NAME: Dict[int, str] = {
    1: "Lombardia",
    2: "Liguria",
    3: "Piemonte",
    4: "Valle d'Aosta",
    5: "Lazio",
    6: "Umbria",
    7: "Molise",
    8: "Emilia-Romagna",
    9: "Trentino-Alto Adige",
    10: "Friuli-Venezia Giulia",
    11: "Marche",
    12: "Veneto",
    13: "Toscana",
    14: "Sicilia",
    15: "Basilicata",
    16: "Puglia",
    17: "Calabria",
    18: "Campania",
    19: "Abruzzo",
    20: "Sardegna",
    21: "P.A. Trento",
    22: "P.A. Bolzano",
}

app = FastAPI(
    title="Railway OpenData API",
    description="API for Italian railway performance statistics",
    version="0.1.0"
)

# CORS - allow frontend to access API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # Alternative port
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data directory (relative to this file: ../../data/outputs/)
DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "outputs"

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


@app.get("/health")
def health():
    """Health check endpoint"""
    return {
        "status": "ok",
        "data_dir_exists": DATA_DIR.exists(),
        "data_dir": str(DATA_DIR)
    }


@app.get("/stats/describe")
def get_describe_stats() -> Dict[str, Any]:
    """
    Get descriptive statistics (US-1: Performance Statistics)
    Returns precomputed output from save_describe.py
    """
    # Look for the most recent describe JSON file
    describe_files = list(DATA_DIR.glob("describe_*.json"))
    
    if not describe_files:
        raise HTTPException(
            status_code=404,
            detail="No describe statistics found. Run scripts/save_describe.py first."
        )
    
    # Use the most recent file
    describe_file = sorted(describe_files)[-1]
    
    try:
        with open(describe_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading stats: {str(e)}")


@app.get("/stats/delay-boxplot")
def get_delay_boxplot():
    """
    Get delay boxplot information (US-2: Delay Patterns)
    Returns path to precomputed PNG from delay_boxplot_fast.py
    """
    boxplot_files = list(DATA_DIR.glob("delay_boxplot_*.png"))
    
    if not boxplot_files:
        raise HTTPException(
            status_code=404,
            detail="No delay boxplot found. Run scripts/delay_boxplot_fast.py first."
        )
    
    # Return the most recent file
    boxplot_file = sorted(boxplot_files)[-1]
    
    return {
        "file_path": f"/files/{boxplot_file.name}",
        "filename": boxplot_file.name
    }


@app.get("/stats/day-train-count")
def get_day_train_count():
    """
    Get daily train count data (US-3: Service Frequency)
    Returns path to precomputed PNG from day_train_count_fast.py
    """
    count_files = list(DATA_DIR.glob("day_train_count_*.png"))
    
    if not count_files:
        raise HTTPException(
            status_code=404,
            detail="No train count data found. Run scripts/day_train_count_fast.py first."
        )
    
    count_file = sorted(count_files)[-1]
    
    return {
        "file_path": f"/files/{count_file.name}",
        "filename": count_file.name
    }


@app.get("/map/trajectories")
def get_trajectories():
    """
    Get train trajectories for map (US-4: Interactive Map)
    Returns path to precomputed HTML from run_trajectories_week_sample.py
    """
    trajectory_files = list(DATA_DIR.glob("trajectories_map_*.html"))
    
    if not trajectory_files:
        raise HTTPException(
            status_code=404,
            detail="No trajectory map found. Run scripts/run_trajectories_week_sample.py first."
        )
    
    trajectory_file = sorted(trajectory_files)[-1]
    
    return {
        "file_path": f"/files/{trajectory_file.name}",
        "filename": trajectory_file.name
    }


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
    stations_csv = DATA_DIR.parent / "stations.csv"
    stations_csv_clean = DATA_DIR.parent / "stations.clean.csv"
    stations_geojson = DATA_DIR.parent / "stations.geojson"
    
    def _normalize_feature_collection(obj: Dict[str, Any]) -> Dict[str, Any]:
        # Some generators may omit the 'type' field; normalize to a valid FeatureCollection.
        if isinstance(obj, dict) and "features" in obj and obj.get("type") is None:
            obj = {**obj, "type": "FeatureCollection"}
        return obj

    def _matches(feature: Dict[str, Any], needle: str) -> bool:
        props = feature.get("properties") or {}
        name = str(props.get("name") or "")
        short_name = str(props.get("short_name") or props.get("shortName") or "")
        code = str(props.get("code") or "")
        region_name = str(props.get("region_name") or "")
        haystack = f"{name} {short_name} {code} {region_name}".lower()
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

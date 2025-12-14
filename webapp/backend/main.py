"""
Railway OpenData - FastAPI Backend
Serves precomputed statistics and data for the frontend

"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import json
from typing import Dict, Any

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
def get_stations():
    """
    Get station data (GeoJSON or CSV)
    For map markers and station selection
    """
    # Check for GeoJSON first, then CSV
    stations_geojson = DATA_DIR.parent / "stations.geojson"
    stations_csv = DATA_DIR.parent / "stations.clean.csv"
    
    if stations_geojson.exists():
        try:
            with open(stations_geojson, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error reading GeoJSON: {str(e)}")
    
    elif stations_csv.exists():
        return {
            "file_path": f"/files/../stations.clean.csv",
            "format": "csv",
            "note": "Consider converting to GeoJSON for better map integration"
        }
    
    else:
        raise HTTPException(
            status_code=404,
            detail="No station data found. Check data/stations.geojson or data/stations.clean.csv"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

# Web App Setup Guide (FastAPI + Vite/React + Leaflet + Plotly)

This is a step-by-step guide to scaffold and run the citizen-facing web app using FastAPI (backend) and Vite/React (frontend), reusing the existing helper scripts for data generation.

## 0) Prerequisites (Done)
- Python 3.11+ (virtualenv or conda)
- Node.js 18+ (npm or pnpm or yarn)
- Git

## 1) Repo Layout (proposed) (Done)
```
railway-opendata/
├─ scripts/                 # existing helper scripts (keep)
├─ data/outputs/            # existing outputs (JSON/CSV/PNG/HTML)
├─ webapp/
   ├─ backend/              # FastAPI app
   ├─ frontend/             # Vite + React app
   └─ README.md             # quick start for webapp
```

## 2) Backend (FastAPI) (Done)
1. Create a virtualenv:
   - `python -m venv .venv`
   - `source .venv/bin/activate` (Linux/macOS) or `.venv\Scripts\activate` (Windows)
2. Install FastAPI + Uvicorn:
   - `pip install fastapi uvicorn pydantic[dotenv] python-multipart`
3. Create `webapp/backend/main.py` with minimal API skeleton:
   - Serve health check: `GET /health`
   - Serve static files from `data/outputs/`
   - Add endpoints that read precomputed JSON/CSV/Parquet from `data/outputs/`
4. Run dev server:
   - `uvicorn main:app --reload --host 0.0.0.0 --port 8000`
5. (Optional) Add CORS for local frontend (`http://localhost:5173`).

### Suggested Endpoints (read existing outputs) 
- `GET /stats/describe` → returns JSON from `data/outputs/describe_*.json`
- `GET /stats/delay-boxplot` → returns PNG path or base64 from `delay_boxplot_fast.py` output
- `GET /stats/day-train-count` → JSON from `day_train_count_fast.py` output
- `GET /map/trajectories` → GeoJSON/JSON produced by `run_trajectories_week_sample.py`
- `GET /stations` → stations GeoJSON/CSV for map markers

### If you need fresh runs (optional)
- Wrap helper scripts with subprocess calls or refactor common logic into importable functions (later). For MVP, prefer **precomputed outputs** to keep API fast.

## 3) Frontend (Vite + React)
1. Create frontend app:
   - `cd webapp`
   - `npm create vite@latest frontend -- --template react`
   - `cd frontend`
   - `npm install`
2. Add libraries:
   - `npm install axios react-query` (data fetching/caching)
   - `npm install plotly.js react-plotly.js` (charts)
   - `npm install leaflet react-leaflet` (maps) and `npm install leaflet.markercluster` if needed
   - `npm install tailwindcss postcss autoprefixer` (optional, for styling) then `npx tailwindcss init -p`
3. Dev server:
   - `npm run dev` (defaults to http://localhost:5173)
4. Configure `.env` in `frontend/`:
   - `VITE_API_URL=http://localhost:8000`

### Frontend Pages/Components (MVP)
- **Dashboard page**: summary cards, link to stats
- **Statistics page** (US-1/2/3): charts for describe, delay distributions, train counts
- **Map page** (US-4): Leaflet map with trajectories + stations, filters
- **Filters component**: date range, company, region/station (hooked to API params)

## 4) Data Flow for MVP
1. Compute outputs either **on-demand** (recommended for correctness while iterating) or precompute (for speed).

   On-demand (real-time from your local `data/railway-opendata/YYYY-MM-DD/trains.csv`):
   - `GET /stats/describe?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&recompute=false`
   - `GET /stats/delay-boxplot?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&recompute=false`
   - `GET /stats/day-train-count?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&recompute=false`

   Notes:
   - Results are cached to `data/outputs/` by date range; use `recompute=true` to force regeneration.
   - Large date ranges can be slow; keep ranges reasonably small during development.

   Precompute (offline/cron) still works (generates the same cached files in `data/outputs/`):
   - `python scripts/save_describe.py --start YYYY-MM-DD --end YYYY-MM-DD`
   - `python scripts/delay_boxplot_fast.py --start YYYY-MM-DD --end YYYY-MM-DD --out data/outputs/delay_boxplot_YYYY-MM-DD_YYYY-MM-DD.png`
   - `python scripts/day_train_count_fast.py --start YYYY-MM-DD --end YYYY-MM-DD --out data/outputs/day_train_count_YYYY-MM-DD_YYYY-MM-DD.png`

2. Backend serves cached outputs from `data/outputs/` (and can generate them on-demand when date params are provided).
3. Frontend fetches from FastAPI and renders charts/maps.

## 5) Minimal Backend Example (outline)
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import json
from pathlib import Path

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "outputs"

app.mount("/files", StaticFiles(directory=DATA_DIR), name="files")

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/stats/describe")
def describe():
    with open(DATA_DIR / "describe_2023-05-01_2025-12-01.json", "r", encoding="utf-8") as f:
        return json.load(f)
```
(Add similar endpoints for other outputs.)
```

## 6) Minimal Frontend Fetch Example (React + axios)
```javascript
import axios from "axios";
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL });

export async function fetchDescribe() {
  const { data } = await api.get("/stats/describe");
  return data;
}
```
Use React Query for caching and loading states:
```javascript
import { useQuery } from "@tanstack/react-query";
const { data, isLoading, error } = useQuery({ queryKey: ["describe"], queryFn: fetchDescribe });
```

## 7) Map Integration (Leaflet)
- Load GeoJSON from `/map/trajectories` and stations from `/stations`.
- Use `react-leaflet` `<MapContainer>` + `<TileLayer>` + `<GeoJSON>`.
- Color code by delay; optional marker clustering for stations.

## 8) Chart Integration (Plotly)
- Delay distribution: box/violin plot from describe/delay data
- Train counts: time series line/bar from day_train_count JSON
- Summary cards: punctuality %, avg delays

## 9) Running Everything Locally
- Terminal 1: `cd webapp/backend` → `uvicorn main:app --reload --host 0.0.0.0 --port 8000`
- Terminal 2: `cd webapp/frontend` → `npm run dev`
- Open http://localhost:5173

## 10) Next Steps (after MVP)
- Add real filtering via query params (date range, company, region) and pre-filtered outputs.
- Add background jobs to refresh outputs (daily/weekly).
- Add auth only if needed (otherwise keep public).
- Dockerize backend and frontend for deployment.

## 11) What Not to Do (yet)
- Don’t run heavy analysis on-demand in API; use precomputed outputs for speed.
- Don’t expose raw large CSVs to the browser; serve aggregated/filtered JSON instead.

## 12) Quick Checklist
- [ ] Create `webapp/backend` (FastAPI) + `webapp/frontend` (Vite/React)
- [ ] Set `VITE_API_URL`
- [ ] Precompute outputs with helper scripts into `data/outputs/`
- [ ] Serve outputs via FastAPI endpoints
- [ ] Build frontend pages: Dashboard, Statistics, Map, Filters
- [ ] Verify locally (http://localhost:8000 + http://localhost:5173)
- [ ] Plan deployment (later)

That’s it—follow these steps and you’ll have a working MVP quickly.





React Router setup
Routes: Dashboard, Statistics, Map
Phase 2: Dashboard Page (Days 3-4)
Dashboard Component - src/pages/Dashboard.jsx

Summary cards showing:
Total trains analyzed
Average delay (minutes)
Punctuality rate (%)
Service regularity (%)
Quick links to detailed views
Use /stats/describe endpoint
Summary Card Component - src/components/SummaryCard.jsx

Display key metrics
Clean card design with TailwindCSS
Phase 3: Statistics Page (Days 5-7)
Statistics Page - src/pages/Statistics.jsx

US-1: Performance metrics overview
US-2: Delay distribution charts
US-3: Service frequency timeline
Describe Stats Component - src/components/DescribeStats.jsx

Show table with: count, mean, std, min, 25%, 50%, 75%, max
Data from /stats/describe endpoint
Delay Boxplot Component - src/components/DelayBoxplot.jsx

Display PNG image from /stats/delay-boxplot
Alternative: parse delay data and render with Plotly.js
Train Count Chart - src/components/TrainCountChart.jsx

Time-series chart of daily train counts
Use Plotly.js for interactivity
Data from /stats/day-train-count
Phase 4: Map Page (Days 8-10)
Map Page - src/pages/MapView.jsx

Full-screen map container
US-4: Interactive train trajectories
Map Component - src/components/Map.jsx

Leaflet map with stations (GeoJSON from /stations)
Optional: animated trajectories from /map/trajectories
Use react-leaflet for easy integration
Station Popup - src/components/StationPopup.jsx

Click station to see performance stats
Name, delay stats, train count
Phase 5: Filters (Days 11-12)
Filter Component - src/components/Filters.jsx

US-7: Date range picker (start/end dates)
US-8: Company selector (checkboxes)
US-9: Region/Station search
"Apply Filters" button
Date Picker - src/components/DatePicker.jsx

Start date / End date inputs
Quick presets: "Last 7 days", "Last month", "Custom"
Company Selector - src/components/CompanySelector.jsx

Checkboxes for: Trenitalia, Trenord, TPER, etc.
Multi-select capability
Phase 6: Integration & Polish (Days 13-14)
Hook filters to API calls

Pass filter params to endpoints (query params)
Re-fetch data when filters change
Loading states & Error handling

Show spinners while loading
Display error messages if API fails
Responsive design

Mobile-friendly layout
Test on different screen sizes





Backend Changes:

Add code to fetch data from ViaggiaTreno/Trenord APIs (see how the scraper does it in src/scraper/).
Expose new API endpoints in your backend to serve this data to the frontend.
Frontend Changes:

Update the frontend to call your new backend endpoints for live data.
(Optional) Remove or Ignore Local Data:

If local data is unreliable, stop using it for the webapp.
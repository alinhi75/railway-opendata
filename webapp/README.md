# Railway OpenData Web Application

Citizen-facing web application for Italian railway performance analysis.

## Quick Start

### Using Docker (demo-friendly)

From the `webapp/` folder:

```bash
docker compose up --build
```

- Backend: http://localhost:8000
- Frontend: http://localhost:5173

Data must be present under `webapp/data/` (see backend section below).

### Backend (FastAPI)
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # Linux/macOS

pip install -r requirements.txt
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend will run at: http://localhost:8000

### Frontend (Vite + React)
```bash
cd frontend
npm install
npm run dev
```

Frontend will run at: http://localhost:5173

## Architecture
- **Backend**: FastAPI serves precomputed data from `../data/outputs/`
- **Frontend**: React with Leaflet (maps), Plotly (charts), TailwindCSS (styling)
- **Data Flow**: Helper scripts → JSON/CSV outputs → API → Frontend

## Development
1. Precompute data using scripts in `../scripts/`
2. Start backend API
3. Start frontend dev server
4. Open browser to http://localhost:5173

## Dataset location (required)

The backend reads the local dataset from:

- `webapp/data/stations.csv`
- `webapp/data/YYYY-MM-DD/trains.csv`

If you only have the original repo `data/` folder, copy/sync the files into `webapp/data/` before running the webapp.

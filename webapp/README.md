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

### Using Docker Hub images (no build)

From the `webapp/` folder:

```bash
export DOCKERHUB_NAMESPACE=YOUR_DOCKERHUB_USER_OR_ORG
export BACKEND_TAG=latest
export FRONTEND_TAG=latest
docker compose -f docker-compose.dockerhub.yml up
```

- Backend: http://localhost:8000
- Frontend: http://localhost:5173

The dataset is mounted from `webapp/data/` into the backend container.

### Using Docker (dev hot-reload)

From the `webapp/` folder:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

- Backend auto-reloads on code changes (`uvicorn --reload`).
- Frontend uses Vite HMR and reflects changes without rebuilding.

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

## Publishing images to Docker Hub (GitHub Actions)

This repo includes a workflow that builds and pushes multi-arch images:

- `${DOCKERHUB_USERNAME}/railway-opendata-backend:<tag>`
- `${DOCKERHUB_USERNAME}/railway-opendata-frontend:<tag>`

Required GitHub repo secrets:

- `DOCKERHUB_USERNAME`: Docker Hub namespace (user or org)
- `DOCKERHUB_TOKEN`: Docker Hub access token with push permissions

Trigger:

- Push to `main` publishes `latest` and `sha-<7chars>` tags
- Manual run (`workflow_dispatch`) can publish a custom tag

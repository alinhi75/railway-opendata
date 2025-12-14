# Railway OpenData Web Application

Citizen-facing web application for Italian railway performance analysis.

## Quick Start

### Backend (FastAPI)
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # Linux/macOS

pip install fastapi uvicorn pydantic[dotenv] python-multipart
uvicorn main:app --reload --host 0.0.0.0 --port 8000
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

See [../docs/WEBAPP_SETUP_GUIDE.md](../docs/WEBAPP_SETUP_GUIDE.md) for detailed setup instructions.

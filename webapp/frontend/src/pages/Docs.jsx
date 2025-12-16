import React from 'react';
import './Docs.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const Docs = () => {
  return (
    <div className="docs">
      <div className="docs-container">
        <header className="docs-header">
          <h1>Documentation</h1>
          <p>
            Quick guide to run the web app locally and understand how data flows between
            the backend and frontend.
          </p>
        </header>

        <section className="docs-section">
          <h2>Local setup</h2>
          <div className="code">
            <div className="code-title">Backend (FastAPI)</div>
            <pre>
              <code>{`cd webapp/backend\n.venv\\Scripts\\activate\nuvicorn main:app --reload --host 0.0.0.0 --port 8000`}</code>
            </pre>
          </div>

          <div className="code">
            <div className="code-title">Frontend (Vite/React)</div>
            <pre>
              <code>{`cd webapp/frontend\nnpm install\nnpm run dev`}</code>
            </pre>
          </div>

          <p className="hint">
            Frontend: <strong>http://localhost:5173</strong> | Backend: <strong>{API_BASE}</strong>
          </p>
        </section>

        <section className="docs-section">
          <h2>Data flow (MVP)</h2>
          <ul>
            <li>Offline scripts generate precomputed outputs in <strong>data/outputs/</strong>.</li>
            <li>The backend reads those files and exposes them via API endpoints.</li>
            <li>The frontend fetches endpoints and renders pages (Dashboard/Statistics/Map).</li>
          </ul>
        </section>

        <section className="docs-section">
          <h2>Precomputed outputs</h2>
          <p>
            The backend expects precomputed files (JSON/PNG/HTML). If an endpoint returns 404,
            generate the corresponding output using the scripts in the repository.
          </p>
        </section>

        <section className="docs-section">
          <h2>Configuration</h2>
          <p>
            Frontend API base URL is read from <strong>VITE_API_URL</strong> in <strong>webapp/frontend/.env</strong>.
            If it is not set, it defaults to <strong>http://localhost:8000</strong>.
          </p>
        </section>

        <section className="docs-section">
          <h2>More</h2>
          <ul>
            <li>
              API endpoints used by the frontend: <a href="/api-docs">API Docs</a>
            </li>
            <li>
              Interactive Swagger UI (backend):{' '}
              <a href={`${API_BASE}/docs`} target="_blank" rel="noreferrer">
                {`${API_BASE}/docs`}
              </a>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
};

export default Docs;

import React from 'react';
import './ApiDocs.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const ApiDocs = () => {
  return (
    <div className="api-docs">
      <div className="api-docs-container">
        <header className="api-docs-header">
          <h1>API Docs</h1>
          <p>
            This page lists the backend endpoints used by the frontend in this project.
          </p>
          <p className="api-docs-base">
            <strong>Base URL:</strong> {API_BASE}
          </p>
        </header>

        <section className="api-docs-section">
          <h2>Health</h2>
          <div className="api-doc">
            <div className="api-doc-line">
              <span className="method">GET</span>
              <span className="path">/health</span>
            </div>
            <p>Checks that the backend is running and that the data directory exists.</p>
          </div>
        </section>

        <section className="api-docs-section">
          <h2>Statistics</h2>

          <div className="api-doc">
            <div className="api-doc-line">
              <span className="method">GET</span>
              <span className="path">/stats/describe</span>
            </div>
            <p>Returns descriptive statistics for key columns (delays, crowding, etc.).</p>
            <p className="hint">Used by: Dashboard, Statistics</p>
          </div>

          <div className="api-doc">
            <div className="api-doc-line">
              <span className="method">GET</span>
              <span className="path">/stats/delay-boxplot</span>
            </div>
            <p>Returns a JSON object with a PNG file path for delay distribution.</p>
            <p className="hint">Used by: Statistics</p>
          </div>

          <div className="api-doc">
            <div className="api-doc-line">
              <span className="method">GET</span>
              <span className="path">/stats/day-train-count</span>
            </div>
            <p>Returns a JSON object with a PNG file path for daily train counts.</p>
            <p className="hint">Used by: Statistics</p>
          </div>
        </section>

        <section className="api-docs-section">
          <h2>Map</h2>

          <div className="api-doc">
            <div className="api-doc-line">
              <span className="method">GET</span>
              <span className="path">/map/trajectories</span>
            </div>
            <p>Returns a JSON object with an HTML file path for the trajectory map.</p>
            <p className="hint">Used by: Map</p>
          </div>

          <div className="api-doc">
            <div className="api-doc-line">
              <span className="method">GET</span>
              <span className="path">/stations</span>
            </div>
            <p>Returns stations as GeoJSON (preferred) or a CSV file reference.</p>
            <p className="hint">Used by: Map, Filters (station search)</p>
          </div>
        </section>

        <section className="api-docs-section">
          <h2>Static files</h2>
          <div className="api-doc">
            <div className="api-doc-line">
              <span className="method">GET</span>
              <span className="path">/files/&lt;filename&gt;</span>
            </div>
            <p>Serves precomputed PNG/HTML outputs stored under the project data outputs folder.</p>
          </div>
        </section>

        <section className="api-docs-section">
          <h2>Filtering (query parameters)</h2>
          <p>
            The frontend sends these optional query parameters when filters are applied. The backend may
            currently ignore them (MVP), but they are part of the API contract for future work.
          </p>
          <div className="params">
            <div><strong>start_date</strong> (YYYY-MM-DD)</div>
            <div><strong>end_date</strong> (YYYY-MM-DD)</div>
            <div><strong>railway_companies</strong> (comma-separated string)</div>
            <div><strong>regions</strong> (comma-separated string)</div>
            <div><strong>station_query</strong> (string)</div>
          </div>
        </section>

        <section className="api-docs-section">
          <h2>Interactive Swagger UI</h2>
          <p>
            If the backend is running, you can also use the built-in FastAPI docs at:
          </p>
          <p>
            <a href={`${API_BASE}/docs`} target="_blank" rel="noreferrer">{API_BASE}/docs</a>
          </p>
        </section>
      </div>
    </div>
  );
};

export default ApiDocs;

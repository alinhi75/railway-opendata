import React from 'react';
import './About.css';

/**
 * About Page
 * Explains the project purpose, data source, and limitations for citizens.
 */
const About = () => {
  return (
    <div className="about">
      <div className="about-container">
        <header className="about-header">
          <h1>About Railway OpenData</h1>
          <p>
            This web app helps citizens explore railway performance through clear statistics,
            visualizations, and maps.
          </p>
        </header>

        <section className="about-section">
          <h2>What you can do here</h2>
          <ul>
            <li>Check overall performance metrics on the Dashboard.</li>
            <li>Explore delay distributions and train counts in Statistics.</li>
            <li>Inspect trajectories and stations in the Map view.</li>
          </ul>
        </section>

        <section className="about-section">
          <h2>Data & methodology (MVP)</h2>
          <p>
            The backend serves precomputed outputs generated from the project dataset.
            Filters are sent as query parameters to the API endpoints.
          </p>
          <p>
            In this MVP, some visualizations may be served as precomputed files to keep the
            experience fast and reliable.
          </p>
        </section>

        <section className="about-section">
          <h2>Notes & limitations</h2>
          <ul>
            <li>Results depend on data availability and the selected time window.</li>
            <li>Outliers can exist (e.g., large negative/positive delays).</li>
            <li>This is a research prototype for a thesis project.</li>
          </ul>
        </section>
      </div>
    </div>
  );
};

export default About;

import React from 'react';
import './AboutSection.css';

/**
 * About Section
 * Formerly: pages/About
 */
const AboutSection = () => {
  return (
    <div className="about">
      <div className="about-container">
        <header className="about-header">
          <h1>About Railway OpenData</h1>
          <p>
            Explore Italian railway performance through an interactive station map, filterable metrics, and reproducible datasets.
          </p>
        </header>

        <div className="about-features-grid">
          <section className="about-section">
            <h2>🗺️ Map (Stations)</h2>
            <ul>
              <li><strong>Browse</strong> stations across Italy and inspect station metadata.</li>
              <li><strong>Highlight</strong> selected regions for quick geographic focus.</li>
              <li><strong>Click a station</strong> to jump directly into station-specific statistics.</li>
            </ul>
          </section>

          <section className="about-section">
            <h2>📊 Analysis (Dashboard & Statistics)</h2>
            <ul>
              <li><strong>Dashboard</strong> summarizes the current filters (records, average delay, variability, extremes).</li>
              <li><strong>Statistics</strong> shows delay distributions (boxplots) and daily train counts.</li>
              <li><strong>Monthly</strong> view uses precomputed charts; <strong>Custom</strong> view uses your selected filters and date range.</li>
            </ul>
          </section>

          <section className="about-section">
            <h2>🎛️ Filters & dataset management</h2>
            <ul>
              <li><strong>Filter</strong> by date range, railway company/type, region, and station(s).</li>
              <li><strong>Upload</strong> a new dataset (and optionally <code>stations.csv</code>) from the Filters panel.</li>
              <li><strong>Archives</strong> let you switch between dataset versions for comparison.</li>
              <li>
                <strong>Limitations</strong>: results depend on data availability; scraped data is best-effort and may contain outliers.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AboutSection;

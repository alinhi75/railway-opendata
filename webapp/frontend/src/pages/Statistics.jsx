import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import './Statistics.css';

/**
 * Statistics Page
 * US-2 & US-3: Delay Distributions and Service Frequency
 * Shows visualizations for delay patterns and train counts
 */
const Statistics = () => {
  const [delayBoxplotPath, setDelayBoxplotPath] = useState(null);
  const [trainCountPath, setTrainCountPath] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchStatistics = async () => {
      try {
        setLoading(true);
        
        // Fetch delay boxplot
        const delayResponse = await apiService.getDelayBoxplot();
        if (delayResponse.data.file_path) {
          setDelayBoxplotPath(delayResponse.data.file_path);
        }

        // Fetch train count data
        const trainResponse = await apiService.getDayTrainCount();
        if (trainResponse.data.file_path) {
          setTrainCountPath(trainResponse.data.file_path);
        }

        setError(null);
      } catch (err) {
        setError('Failed to load statistics. Make sure the backend is running and data files exist.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchStatistics();
  }, []);

  return (
    <div className="statistics">
      <div className="statistics-header">
        <h1>📈 Advanced Statistics</h1>
        <p>Analyze train delays, service frequency, and performance patterns</p>
      </div>

      {loading && (
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading statistics...</p>
        </div>
      )}

      {error && (
        <div className="error-message">
          <span>⚠️ {error}</span>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Delay Distribution Section */}
          <section className="stat-section">
            <h2>US-2: Delay Distribution Analysis</h2>
            <p className="section-description">
              Visualize the distribution of arrival and departure delays across all trains.
              This helps identify typical delays vs. outliers.
            </p>
            
            <div className="visualization-container">
              {delayBoxplotPath ? (
                <div className="chart-wrapper">
                  <img 
                    src={delayBoxplotPath} 
                    alt="Delay Boxplot"
                    className="chart-image"
                  />
                  <a href={delayBoxplotPath} download className="download-btn">
                    📥 Download Image
                  </a>
                </div>
              ) : (
                <div className="placeholder">
                  <p>📊 No delay boxplot data available</p>
                  <p className="hint">Run: python scripts/delay_boxplot_fast.py</p>
                </div>
              )}
            </div>
          </section>

          {/* Service Frequency Section */}
          <section className="stat-section">
            <h2>US-3: Service Frequency Analysis</h2>
            <p className="section-description">
              Daily train count by railway company over time.
              Shows service levels and identifies service changes or disruptions.
            </p>
            
            <div className="visualization-container">
              {trainCountPath ? (
                <div className="chart-wrapper">
                  <img 
                    src={trainCountPath} 
                    alt="Daily Train Count"
                    className="chart-image"
                  />
                  <a href={trainCountPath} download className="download-btn">
                    📥 Download Image
                  </a>
                </div>
              ) : (
                <div className="placeholder">
                  <p>📊 No train count data available</p>
                  <p className="hint">Run: python scripts/day_train_count_fast.py</p>
                </div>
              )}
            </div>
          </section>

          {/* Insights Section */}
          <section className="stat-section insights-section">
            <h2>💡 Key Insights</h2>
            <div className="insights-grid">
              <div className="insight-card">
                <h3>Delay Patterns</h3>
                <p>
                  Examine the boxplot to understand:
                  <ul>
                    <li>Median delays (the line in the middle)</li>
                    <li>Typical range (25%-75% of trains)</li>
                    <li>Outliers (exceptionally delayed trains)</li>
                  </ul>
                </p>
              </div>
              <div className="insight-card">
                <h3>Service Trends</h3>
                <p>
                  Analyze train counts to:
                  <ul>
                    <li>Compare operator market share</li>
                    <li>Identify service disruptions</li>
                    <li>Track seasonal variations</li>
                  </ul>
                </p>
              </div>
              <div className="insight-card">
                <h3>Performance Metrics</h3>
                <p>
                  Use statistics to:
                  <ul>
                    <li>Set realistic commute expectations</li>
                    <li>Compare routes and operators</li>
                    <li>Hold operators accountable</li>
                  </ul>
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default Statistics;

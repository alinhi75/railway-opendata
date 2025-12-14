import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import SummaryCard from '../components/SummaryCard';
import './Dashboard.css';

/**
 * Dashboard Page
 * US-1: Performance Statistics Overview
 * Shows key metrics and summary cards
 */
const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await apiService.getDescribeStats();
        setStats(response.data);
        setError(null);
      } catch (err) {
        setError('Failed to load statistics. Make sure the backend is running.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  // Extract key metrics from stats (supports tabular describe JSON)
  const getMetric = (label) => {
    if (!stats) return { mean: 'N/A', std: 'N/A', min: 'N/A', max: 'N/A', count: 0 };

    // If stats come as a mapping with keys per label
    if (stats[label]) {
      const data = stats[label] || {};
      return {
        mean: data.mean != null ? Number(data.mean).toFixed(2) : 'N/A',
        std: data.std != null ? Number(data.std).toFixed(2) : 'N/A',
        min: data.min != null ? Number(data.min).toFixed(2) : 'N/A',
        max: data.max != null ? Number(data.max).toFixed(2) : 'N/A',
        count: data.count != null ? Math.floor(Number(data.count)) : 0,
      };
    }

    // Otherwise, handle tabular format: { columns: [], index: [], data: [][] }
    const cols = stats.columns;
    const idx = stats.index;
    const dat = stats.data;
    if (!Array.isArray(cols) || !Array.isArray(idx) || !Array.isArray(dat)) {
      return { mean: 'N/A', std: 'N/A', min: 'N/A', max: 'N/A', count: 0 };
    }

    const colIndex = cols.indexOf(label);
    if (colIndex === -1) {
      return { mean: 'N/A', std: 'N/A', min: 'N/A', max: 'N/A', count: 0 };
    }

    const getByRowLabel = (rowLabel) => {
      const rowIdx = idx.indexOf(rowLabel);
      if (rowIdx === -1) return null;
      const row = dat[rowIdx];
      if (!Array.isArray(row)) return null;
      const val = row[colIndex];
      return typeof val === 'number' ? val : (val != null ? Number(val) : null);
    };

    const count = getByRowLabel('count');
    const mean = getByRowLabel('mean');
    const std = getByRowLabel('std');
    const min = getByRowLabel('min');
    const max = getByRowLabel('max');

    return {
      mean: mean != null ? mean.toFixed(2) : 'N/A',
      std: std != null ? std.toFixed(2) : 'N/A',
      min: min != null ? min.toFixed(2) : 'N/A',
      max: max != null ? max.toFixed(2) : 'N/A',
      count: count != null ? Math.floor(count) : 0,
    };
  };

  return (
    <div className="dashboard">
      <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>📊 Railway Performance Dashboard</h1>
        <p>Real-time insights into Italian railway system performance</p>
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

      {stats && !loading && (
        <>
          {/* Key Metrics Summary */}
          <section className="summary-section">
            <h2>Key Metrics</h2>
            <div className="summary-grid">
              <SummaryCard
                title="Total Records"
                value={getMetric('arrival_delay').count}
                unit="trains"
                icon="🚂"
                color="#667eea"
              />
              <SummaryCard
                title="Average Arrival Delay"
                value={getMetric('arrival_delay').mean}
                unit="minutes"
                icon="⏱️"
                color="#f59e0b"
              />
              <SummaryCard
                title="Average Departure Delay"
                value={getMetric('departure_delay').mean}
                unit="minutes"
                icon="🚀"
                color="#ef4444"
              />
              <SummaryCard
                title="Average Crowding"
                value={getMetric('crowding').mean}
                unit="%"
                icon="👥"
                color="#10b981"
              />
            </div>
          </section>

          {/* Detailed Statistics */}
          <section className="details-section">
            <h2>Detailed Statistics</h2>
            
            <div className="stats-grid">
              {/* Arrival Delay Stats */}
              <div className="stat-card">
                <h3>📊 Arrival Delay Analysis</h3>
                <div className="stat-row">
                  <span className="label">Mean:</span>
                  <span className="value">{getMetric('arrival_delay').mean} min</span>
                </div>
                <div className="stat-row">
                  <span className="label">Std Dev:</span>
                  <span className="value">{getMetric('arrival_delay').std} min</span>
                </div>
                <div className="stat-row">
                  <span className="label">Min:</span>
                  <span className="value">{getMetric('arrival_delay').min} min</span>
                </div>
                <div className="stat-row">
                  <span className="label">Max:</span>
                  <span className="value">{getMetric('arrival_delay').max} min</span>
                </div>
              </div>

              {/* Departure Delay Stats */}
              <div className="stat-card">
                <h3>🚀 Departure Delay Analysis</h3>
                <div className="stat-row">
                  <span className="label">Mean:</span>
                  <span className="value">{getMetric('departure_delay').mean} min</span>
                </div>
                <div className="stat-row">
                  <span className="label">Std Dev:</span>
                  <span className="value">{getMetric('departure_delay').std} min</span>
                </div>
                <div className="stat-row">
                  <span className="label">Min:</span>
                  <span className="value">{getMetric('departure_delay').min} min</span>
                </div>
                <div className="stat-row">
                  <span className="label">Max:</span>
                  <span className="value">{getMetric('departure_delay').max} min</span>
                </div>
              </div>

              {/* Crowding Stats */}
              <div className="stat-card">
                <h3>👥 Crowding Analysis</h3>
                <div className="stat-row">
                  <span className="label">Mean:</span>
                  <span className="value">{getMetric('crowding').mean}%</span>
                </div>
                <div className="stat-row">
                  <span className="label">Std Dev:</span>
                  <span className="value">{getMetric('crowding').std}%</span>
                </div>
                <div className="stat-row">
                  <span className="label">Min:</span>
                  <span className="value">{getMetric('crowding').min}%</span>
                </div>
                <div className="stat-row">
                  <span className="label">Max:</span>
                  <span className="value">{getMetric('crowding').max}%</span>
                </div>
              </div>
            </div>
          </section>

          {/* Quick Links */}
          <section className="quick-links">
            <h2>Explore More</h2>
            <div className="links-grid">
              <a href="/statistics" className="link-card">
                <h3>📈 View Detailed Statistics</h3>
                <p>Explore delay distributions, service frequency, and more</p>
              </a>
              <a href="/map" className="link-card">
                <h3>🗺️ Interactive Map</h3>
                <p>See train movements and delays across Italy</p>
              </a>
            </div>
          </section>
        </>
      )}
      </div>
    </div>
  );
};

export default Dashboard;

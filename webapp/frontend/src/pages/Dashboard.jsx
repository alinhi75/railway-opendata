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

  // Extract key metrics from new stats format (flat object)
  const getMetric = () => {
    if (!stats) return { mean: 'N/A', std: 'N/A', min: 'N/A', max: 'N/A', count: 0 };
    return {
      mean: stats.mean ?? 'N/A',
      std: stats.std ?? 'N/A',
      min: stats.min ?? 'N/A',
      max: stats.max ?? 'N/A',
      count: stats.count ?? 0,
    };
  };
  return (
    <div className="dashboard">
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1>📊 Railway Performance Dashboard</h1>
          <p>Real-time insights into Italian railway system performance</p>
        </div>
        {loading ? (
          <div className="loading">Loading statistics...</div>
        ) : error ? (
          <div className="error">{error}</div>
        ) : (
          <>
            {/* Key Metrics Summary */}
            <section className="summary-section">
              <h2>Key Metrics</h2>
              <div className="summary-grid">
                <SummaryCard
                  title="Total Records"
                  value={getMetric().count}
                  unit="trains"
                  icon="🚂"
                  color="#667eea"
                />
                <SummaryCard
                  title="Average Delay"
                  value={getMetric().mean}
                  unit="minutes"
                  icon="⏱️"
                  color="#f59e0b"
                />
                <SummaryCard
                  title="Std Deviation"
                  value={getMetric().std}
                  unit="minutes"
                  icon="📉"
                  color="#ef4444"
                />
                <SummaryCard
                  title="Max Delay"
                  value={getMetric().max}
                  unit="minutes"
                  icon="🚨"
                  color="#10b981"
                />
              </div>
            </section>

            {/* Detailed Statistics */}
            <section className="details-section">
              <h2>Detailed Statistics</h2>
              <div className="stats-grid">
                <div className="stat-card">
                  <h3>📊 Delay Analysis</h3>
                  <div className="stat-row">
                    <span className="label">Mean:</span>
                    <span className="value">{getMetric().mean} min</span>
                  </div>
                  <div className="stat-row">
                    <span className="label">Std Dev:</span>
                    <span className="value">{getMetric().std} min</span>
                  </div>
                  <div className="stat-row">
                    <span className="label">Min:</span>
                    <span className="value">{getMetric().min} min</span>
                  </div>
                  <div className="stat-row">
                    <span className="label">Max:</span>
                    <span className="value">{getMetric().max} min</span>
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

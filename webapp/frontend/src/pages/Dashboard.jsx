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

  // Format number with proper decimal places
  const formatNumber = (value, decimals = 1) => {
    if (value === 'N/A' || value === null || value === undefined) return 'N/A';
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(num)) return 'N/A';
    return num.toFixed(decimals);
  };

  // Format large numbers with commas
  const formatCount = (value) => {
    if (value === 'N/A' || value === null || value === undefined) return 'N/A';
    const num = typeof value === 'number' ? value : parseInt(value);
    if (isNaN(num)) return 'N/A';
    return num.toLocaleString();
  };

  const metric = getMetric();
  return (
    <div className="dashboard">
      <div className="dashboard-container">
        <div className="dashboard-header">
          <div className="header-content">
            <h1>📊 Railway Performance Dashboard</h1>
            <p className="header-subtitle">Real-time insights into Italian railway system performance</p>
            {stats?.start_date && stats?.end_date && (
              <div className="data-period">
                <span className="period-icon">📅</span>
                Data Period: <strong>{stats.start_date}</strong> → <strong>{stats.end_date}</strong>
              </div>
            )}
          </div>
        </div>
        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Loading statistics...</p>
          </div>
        ) : error ? (
          <div className="error-container">
            <span className="error-icon">⚠️</span>
            <p>{error}</p>
          </div>
        ) : (
          <>
            {/* Key Metrics Summary */}
            <section className="summary-section">
              <h2 className="section-title">Key Metrics</h2>
              <div className="summary-grid">
                <SummaryCard
                  title="Total Records"
                  value={formatCount(metric.count)}
                  unit="trains"
                  icon="🚂"
                  color="#667eea"
                />
                <SummaryCard
                  title="Average Delay"
                  value={formatNumber(metric.mean, 1)}
                  unit="minutes"
                  icon="⏱️"
                  color="#f59e0b"
                />
                <SummaryCard
                  title="Std Deviation"
                  value={formatNumber(metric.std, 1)}
                  unit="minutes"
                  icon="📉"
                  color="#ef4444"
                />
                <SummaryCard
                  title="Max Delay"
                  value={formatNumber(metric.max, 1)}
                  unit="minutes"
                  icon="🚨"
                  color="#10b981"
                />
              </div>
            </section>

            {/* Detailed Statistics */}
            <section className="details-section">
              <h2 className="section-title">Detailed Statistics</h2>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-card-header">
                    <h3>📊 Delay Analysis</h3>
                    <span className="stat-badge">Arrival Delays</span>
                  </div>
                  <div className="stat-rows">
                    <div className="stat-row">
                      <span className="label">
                        <span className="label-icon">📏</span>
                        Mean
                      </span>
                      <span className="value">{formatNumber(metric.mean, 2)} min</span>
                    </div>
                    <div className="stat-row">
                      <span className="label">
                        <span className="label-icon">📊</span>
                        Std Dev
                      </span>
                      <span className="value">{formatNumber(metric.std, 2)} min</span>
                    </div>
                    <div className="stat-row">
                      <span className="label">
                        <span className="label-icon">⬇️</span>
                        Min
                      </span>
                      <span className="value">{formatNumber(metric.min, 2)} min</span>
                    </div>
                    <div className="stat-row">
                      <span className="label">
                        <span className="label-icon">⬆️</span>
                        Max
                      </span>
                      <span className="value">{formatNumber(metric.max, 2)} min</span>
                    </div>
                  </div>
                </div>

                <div className="stat-card performance-card">
                  <div className="stat-card-header">
                    <h3>🎯 Performance Insights</h3>
                  </div>
                  <div className="insights-list">
                    <div className="insight-item">
                      <div className="insight-icon">✅</div>
                      <div className="insight-text">
                        <strong>On-Time Rate</strong>
                        <p>Delays under 5 minutes considered on-time</p>
                      </div>
                    </div>
                    <div className="insight-item">
                      <div className="insight-icon">📈</div>
                      <div className="insight-text">
                        <strong>Tracking {formatCount(metric.count)} trains</strong>
                        <p>Comprehensive coverage across Italy</p>
                      </div>
                    </div>
                    <div className="insight-item">
                      <div className="insight-icon">⚡</div>
                      <div className="insight-text">
                        <strong>Real-time Updates</strong>
                        <p>Data refreshed from ViaggiaTreno API</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Quick Links */}
            <section className="quick-links-section">
              <h2 className="section-title">Explore More</h2>
              <div className="links-grid">
                <a href="/statistics" className="link-card">
                  <div className="link-icon">📈</div>
                  <h3>View Detailed Statistics</h3>
                  <p>Explore delay distributions, service frequency, and more</p>
                  <span className="link-arrow">→</span>
                </a>
                <a href="/map" className="link-card">
                  <div className="link-icon">🗺️</div>
                  <h3>Interactive Map</h3>
                  <p>See train movements and delays across Italy</p>
                  <span className="link-arrow">→</span>
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

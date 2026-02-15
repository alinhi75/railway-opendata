import React, { useEffect, useMemo, useState } from 'react';
import { apiService } from '../services/api';
import SummaryCard from '../components/SummaryCard';
import './DashboardSection.css';

/**
 * Dashboard Section
 * Formerly: pages/Dashboard
 */
const DashboardSection = ({ filters = {}, datasetVersion = 0 }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const apiParams = useMemo(() => {
    const params = {};
    if (filters.startDate && filters.endDate) {
      params.start_date = filters.startDate;
      params.end_date = filters.endDate;
    }
    if (Array.isArray(filters.companies) && filters.companies.length > 0) {
      params.railway_companies = filters.companies.join(',');
    }
    if (Array.isArray(filters.regions) && filters.regions.length > 0) {
      params.regions = filters.regions.join(',');
    }
    if (filters.stationQuery) {
      params.station_query = filters.stationQuery;
    } else if (Array.isArray(filters.stationCodes) && filters.stationCodes.length > 0) {
      params.station_query = filters.stationCodes.join(',');
    }
    return params;
  }, [filters]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await apiService.getDescribeStats(apiParams);
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
  }, [apiParams, datasetVersion]);

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

  const formatNumber = (value, decimals = 1) => {
    if (value === 'N/A' || value === null || value === undefined) return 'N/A';
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(num)) return 'N/A';
    return num.toFixed(decimals);
  };

  const formatCount = (value) => {
    if (value === 'N/A' || value === null || value === undefined) return 'N/A';
    const num = typeof value === 'number' ? value : parseInt(value);
    if (isNaN(num)) return 'N/A';
    return num.toLocaleString();
  };

  const metric = getMetric();

  const hasNAValues = () => {
    return (
      metric.mean === 'N/A' ||
      metric.std === 'N/A' ||
      metric.min === 'N/A' ||
      metric.max === 'N/A' ||
      metric.count === 0
    );
  };

  return (
    <div className="dashboard">
      <div className="dashboard-container">
        <div className="dashboard-header">
          <div className="header-content">
            <h1>📊 Railway Performance Dashboard</h1>
            <p className="header-subtitle">Real-time insights into Italian railway system performance</p>
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
            {hasNAValues() && (
              <div className="empty-state">
                <div className="empty-icon">⚠️</div>
                <div className="empty-text">
                  <strong>Not enough data for the selected date range or filters.</strong>
                  <span>Please select another filter or adjust your search criteria.</span>
                </div>
              </div>
            )}
            <section className="summary-section">
              <h2 className="section-title">Key Metrics</h2>
              <div className="summary-grid">
                <SummaryCard title="Total Records" value={formatCount(metric.count)} unit="trains" icon="🚂" color="#667eea" />
                <SummaryCard title="Average Delay" value={formatNumber(metric.mean, 1)} unit="minutes" icon="⏱️" color="#f59e0b" />
                <SummaryCard title="Std Deviation" value={formatNumber(metric.std, 1)} unit="minutes" icon="📉" color="#ef4444" />
                <SummaryCard title="Max Delay" value={formatNumber(metric.max, 1)} unit="minutes" icon="🚨" color="#10b981" />
              </div>
            </section>

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
                      <span className="label"><span className="label-icon">📏</span>Mean</span>
                      <span className="value">{formatNumber(metric.mean, 2)} min</span>
                    </div>
                    <div className="stat-row">
                      <span className="label"><span className="label-icon">📊</span>Std Dev</span>
                      <span className="value">{formatNumber(metric.std, 2)} min</span>
                    </div>
                    <div className="stat-row">
                      <span className="label"><span className="label-icon">⬇️</span>Min</span>
                      <span className="value">{formatNumber(metric.min, 2)} min</span>
                    </div>
                    <div className="stat-row">
                      <span className="label"><span className="label-icon">⬆️</span>Max</span>
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
                        <strong>Dataset-Based Analysis</strong>
                        <p>Results computed from the local dataset</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

          </>
        )}
      </div>
    </div>
  );
};

export default DashboardSection;

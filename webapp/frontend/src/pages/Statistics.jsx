import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import Filters from '../components/Filters';
import './Statistics.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const toApiUrl = (p) => (p && typeof p === 'string' && p.startsWith('/') ? `${API_URL}${p}` : p);

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
  const [filters, setFilters] = useState({});
  const [viewMode, setViewMode] = useState('monthly'); // 'monthly' or 'custom'
  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);

  // Fetch available months on mount
  useEffect(() => {
    const fetchAvailableMonths = async () => {
      try {
        console.log('Fetching available months...');
        const response = await apiService.getAvailableMonths();
        console.log('Available months response:', response.data);
        setAvailableMonths(response.data.months || []);
        // Set default to most recent month
        if (response.data.months && response.data.months.length > 0) {
          const latest = response.data.months[response.data.months.length - 1];
          console.log('Setting default to latest month:', latest);
          setSelectedYear(latest.year);
          setSelectedMonth(latest.month);
        } else {
          console.warn('No months available in response');
        }
      } catch (err) {
        console.error('Failed to fetch available months:', err);
        setError('Failed to load available months. Please check if the backend is running and monthly charts are generated.');
      }
    };
    fetchAvailableMonths();
  }, []);

  useEffect(() => {
    const fetchStatistics = async () => {
      try {
        setLoading(true);

        if (viewMode === 'monthly' && selectedYear && selectedMonth) {
          // Fetch monthly precomputed charts
          try {
            const delayResponse = await apiService.getDelayBoxplotMonthly(selectedYear, selectedMonth);
            if (delayResponse.data.file_path) {
              setDelayBoxplotPath(toApiUrl(delayResponse.data.file_path));
            } else {
              setDelayBoxplotPath(null);
            }
          } catch (err) {
            console.error('Failed to load monthly delay boxplot:', err);
            setDelayBoxplotPath(null);
          }

          try {
            const trainResponse = await apiService.getDayTrainCountMonthly(selectedYear, selectedMonth);
            if (trainResponse.data.file_path) {
              setTrainCountPath(toApiUrl(trainResponse.data.file_path));
            } else {
              setTrainCountPath(null);
            }
          } catch (err) {
            console.error('Failed to load monthly train count:', err);
            setTrainCountPath(null);
          }
        } else if (viewMode === 'custom') {
          // Build query params from filters - ensure all filters are properly combined
          const params = {};
          
          // Add date filters
          if (filters.startDate) params.start_date = filters.startDate;
          if (filters.endDate) params.end_date = filters.endDate;
          
          // Add company filters (join multiple companies with comma)
          if (filters.companies && filters.companies.length > 0) {
            params.railway_companies = filters.companies.join(',');
          }
          
          // Add region filters (join multiple regions with comma)
          if (filters.regions && filters.regions.length > 0) {
            params.regions = filters.regions.join(',');
          }
          
          // Add station query or codes
          if (filters.stationQuery) {
            params.station_query = filters.stationQuery;
          } else if (filters.stationCodes && filters.stationCodes.length > 0) {
            params.station_query = filters.stationCodes.join(',');
          }

          // Fetch delay boxplot with combined filters
          try {
            const delayResponse = await apiService.getDelayBoxplot(params);
            if (delayResponse.data.file_path) {
              setDelayBoxplotPath(toApiUrl(delayResponse.data.file_path));
            } else {
              setDelayBoxplotPath(null);
            }
          } catch (err) {
            if (err.response && err.response.status === 501) {
              setDelayBoxplotPath('NOT_IMPLEMENTED');
            } else if (err.response && err.response.status === 404 && availableRange) {
              setError(
                `No data found for the selected filters. Try a date range within ${availableRange.start} to ${availableRange.end}.`
              );
            } else {
              console.error('Failed to load delay boxplot:', err);
              setDelayBoxplotPath(null);
            }
          }

          // Fetch train count data with combined filters
          try {
            const trainResponse = await apiService.getDayTrainCount(params);
            if (trainResponse.data.file_path) {
              setTrainCountPath(toApiUrl(trainResponse.data.file_path));
            } else {
              setTrainCountPath(null);
            }
          } catch (err) {
            if (err.response && err.response.status === 501) {
              setTrainCountPath('NOT_IMPLEMENTED');
            } else if (err.response && err.response.status === 404 && availableRange) {
              setError(
                `No data found for the selected filters. Try a date range within ${availableRange.start} to ${availableRange.end}.`
              );
            } else {
              console.error('Failed to load train count:', err);
              setTrainCountPath(null);
            }
          }
        }

        setError(null);
      } catch (err) {
        setError('Failed to load statistics. Make sure the backend is running.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (viewMode === 'monthly' && (!selectedYear || !selectedMonth)) {
      setLoading(false);
      return; // Wait for month selection
    }
    fetchStatistics();
  }, [filters, viewMode, selectedYear, selectedMonth]);

  // Get unique years from available months
  const availableYears = [...new Set(availableMonths.map(m => m.year))].sort((a, b) => b - a);
  const monthsForYear = selectedYear 
    ? availableMonths.filter(m => m.year === selectedYear).sort((a, b) => a.month - b.month)
    : [];

  const availableRange = availableMonths.length
    ? {
        start: `${availableMonths[0].year}-${String(availableMonths[0].month).padStart(2, '0')}-01`,
        end: `${availableMonths[availableMonths.length - 1].year}-${String(
          availableMonths[availableMonths.length - 1].month
        ).padStart(2, '0')}-28`, // approximate month end; UI hint only
      }
    : null;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="statistics-page">
      <div className="page-header">
        <div className="header-content">
          <h1>📊 Railway Performance Statistics</h1>
          <p className="page-description">
            Analyze train delays, service frequency, and performance metrics across the Italian railway network.
            {viewMode === 'monthly' 
              ? ' Monthly views show comprehensive day-by-day analysis.' 
              : ' Apply custom filters to drill down into specific scenarios.'}
          </p>
        </div>
      </div>
      
      {/* View Mode Selector */}
      <div className="view-mode-selector">
        <button
          className={viewMode === 'monthly' ? 'active' : ''}
          onClick={() => setViewMode('monthly')}
        >
          📅 Monthly View
        </button>
        <button
          className={viewMode === 'custom' ? 'active' : ''}
          onClick={() => setViewMode('custom')}
        >
          🔧 Custom Range
        </button>
      </div>

      {/* Monthly Selector */}
      {viewMode === 'monthly' && (
        <div className="monthly-selector">
          {availableMonths.length === 0 ? (
            <div className="loading-message">Loading available months...</div>
          ) : (
            <>
              <div className="selector-group">
                <label>Year:</label>
                <select 
                  value={selectedYear || ''} 
                  onChange={(e) => {
                    const year = parseInt(e.target.value);
                    setSelectedYear(year);
                    // Reset month to first available for this year
                    const monthsInYear = availableMonths.filter(m => m.year === year);
                    if (monthsInYear.length > 0) {
                      setSelectedMonth(monthsInYear[0].month);
                    }
                  }}
                  disabled={availableYears.length === 0}
                >
                  {availableYears.length === 0 && <option value="">No data</option>}
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <div className="selector-group">
                <label>Month:</label>
                <select 
                  value={selectedMonth || ''} 
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                  disabled={monthsForYear.length === 0}
                >
                  {monthsForYear.length === 0 && <option value="">Select year first</option>}
                  {monthsForYear.map(({ month }) => (
                    <option key={month} value={month}>{monthNames[month - 1]}</option>
                  ))}
                </select>
              </div>
              {selectedYear && selectedMonth && (
                <div className="selected-period">
                  Viewing: <strong>{monthNames[selectedMonth - 1]} {selectedYear}</strong>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Custom Range Filters */}
      {viewMode === 'custom' && (
        <>
          {availableRange && (
            <div className="range-banner">
              <div className="range-text">
                Data available: <strong>{availableRange.start}</strong> → <strong>{availableRange.end}</strong>
              </div>
              <div className="range-hint">If you see "No trains.csv files found", choose dates within this range.</div>
            </div>
          )}
          <Filters onChange={setFilters} initialFilters={filters} />
        </>
      )}

      {error && (
        <div className="error-dialog-overlay" onClick={() => setError(null)}>
          <div className="error-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="error-dialog-header">
              <span className="error-dialog-icon">⚠️</span>
              <h3>No Data Available</h3>
            </div>
            <div className="error-dialog-body">
              <p>{error}</p>
              {availableRange && (
                <div className="error-dialog-hint">
                  <strong>💡 Tip:</strong> Select dates between <code>{availableRange.start}</code> and <code>{availableRange.end}</code>
                </div>
              )}
            </div>
            <div className="error-dialog-footer">
              <button className="error-dialog-close" onClick={() => setError(null)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading statistics...</p>
        </div>
      ) : (
        <div className="charts-grid">
          <div className="chart-card">
            <div className="chart-header">
              <h2>📉 Delay Distribution</h2>
              <p className="chart-description">
                Delay patterns at last stop for each train. Shows median, quartiles, and outliers.
              </p>
            </div>
            <div className="chart-content">
              {delayBoxplotPath === 'NOT_IMPLEMENTED' ? (
                <div className="stat-placeholder">
                  <span className="placeholder-icon">🚫</span>
                  <p>Live delay boxplot is not available from the public API.</p>
                </div>
              ) : delayBoxplotPath ? (
                <img src={delayBoxplotPath} alt="Delay Boxplot" className="stat-img" />
              ) : (
                <div className="stat-placeholder">
                  <span className="placeholder-icon">📭</span>
                  <p>No boxplot available for selected filters.</p>
                </div>
              )}
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-header">
              <h2>📈 Daily Train Count</h2>
              <p className="chart-description">
                Number of unique trains per day, grouped by railway company.
              </p>
            </div>
            <div className="chart-content">
              {trainCountPath === 'NOT_IMPLEMENTED' ? (
                <div className="stat-placeholder">
                  <span className="placeholder-icon">🚫</span>
                  <p>Live day train count is not available from the public API.</p>
                </div>
              ) : trainCountPath ? (
                <img src={trainCountPath} alt="Train Count Chart" className="stat-img" />
              ) : (
                <div className="stat-placeholder">
                  <span className="placeholder-icon">📭</span>
                  <p>No train count chart available for selected filters.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Insights Section */}
      {!loading && !error && (delayBoxplotPath || trainCountPath) && (
        <section className="insights-section">
          <div className="insights-header">
            <h2>💡 Key Insights</h2>
            <p>Understand what these statistics mean for your journey</p>
          </div>
          <div className="insights-grid">
            <div className="insight-card">
              <div className="insight-icon">📊</div>
              <h3>Delay Patterns</h3>
              <ul>
                <li>Median delays (the line in the middle of the box)</li>
                <li>Typical range (25%-75% of trains)</li>
                <li>Outliers (exceptionally delayed trains)</li>
              </ul>
            </div>
            <div className="insight-card">
              <div className="insight-icon">📈</div>
              <h3>Service Trends</h3>
              <ul>
                <li>Compare operator market share</li>
                <li>Identify service disruptions</li>
                <li>Track seasonal variations</li>
              </ul>
            </div>
            <div className="insight-card">
              <div className="insight-icon">🎯</div>
              <h3>Performance Metrics</h3>
              <ul>
                <li>Set realistic commute expectations</li>
                <li>Compare routes and operators</li>
                <li>Hold operators accountable</li>
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default Statistics;

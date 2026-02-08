import React, { useEffect, useRef, useState } from 'react';
import { apiService } from '../services/api';
import './StatisticsSection.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const toApiUrl = (p) => (p && typeof p === 'string' && p.startsWith('/') ? `${API_URL}${p}` : p);

/**
 * Statistics Section
 * Formerly: pages/Statistics
 */
const StatisticsSection = ({ filters = {} }) => {
  const [delayBoxplotPath, setDelayBoxplotPath] = useState(null);
  const [trainCountPath, setTrainCountPath] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('custom');
  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [availableDateRange, setAvailableDateRange] = useState(null);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const customStartInputRef = useRef(null);
  const customEndInputRef = useRef(null);

  const openNativeDatePicker = (inputEl) => {
    if (!inputEl) return;
    // Chrome/Safari (newer) support this; otherwise focus at least.
    if (typeof inputEl.showPicker === 'function') {
      try {
        inputEl.showPicker();
        return;
      } catch {
        // ignore and fall back to focus
      }
    }
    inputEl.focus();
  };

  useEffect(() => {
    const fetchAvailableMonths = async () => {
      try {
        const response = await apiService.getAvailableMonths();
        setAvailableMonths(response.data.months || []);
        if (response.data.months && response.data.months.length > 0) {
          const latest = response.data.months[response.data.months.length - 1];
          setSelectedYear(latest.year);
          setSelectedMonth(latest.month);
        }
      } catch (err) {
        console.error('Failed to fetch available months:', err);
        setError('Failed to load available months. Please check if the backend is running and monthly charts are generated.');
      }
    };
    fetchAvailableMonths();
  }, []);

  useEffect(() => {
    const fetchAvailableDateRange = async () => {
      try {
        const statsRes = await apiService.getDescribeStats();
        if (statsRes.data?.available_min_date && statsRes.data?.available_max_date) {
          setAvailableDateRange({
            start: statsRes.data.available_min_date,
            end: statsRes.data.available_max_date,
          });
        }
      } catch (err) {
        // Non-fatal: we can still operate without a known global date range.
        console.warn('Could not fetch available date range from stats:', err);
      }
    };

    fetchAvailableDateRange();
  }, []);

  useEffect(() => {
    const fetchStatistics = async () => {
      try {
        setLoading(true);

        if (viewMode === 'monthly' && selectedYear && selectedMonth) {
          try {
            const delayResponse = await apiService.getDelayBoxplotMonthly(selectedYear, selectedMonth);
            setDelayBoxplotPath(delayResponse.data.file_path ? toApiUrl(delayResponse.data.file_path) : null);
          } catch (err) {
            console.error('Failed to load monthly delay boxplot:', err);
            setDelayBoxplotPath(null);
          }

          try {
            const trainResponse = await apiService.getDayTrainCountMonthly(selectedYear, selectedMonth);
            setTrainCountPath(trainResponse.data.file_path ? toApiUrl(trainResponse.data.file_path) : null);
          } catch (err) {
            console.error('Failed to load monthly train count:', err);
            setTrainCountPath(null);
          }
        } else if (viewMode === 'custom') {
          const params = {};
          const hasCustomRange = Boolean(customStartDate && customEndDate);
          const hasSharedRange = Boolean(filters.startDate && filters.endDate);

          if (hasCustomRange) {
            params.start_date = customStartDate;
            params.end_date = customEndDate;
          } else if (hasSharedRange) {
            params.start_date = filters.startDate;
            params.end_date = filters.endDate;
          }
          if (filters.companies && filters.companies.length > 0) params.railway_companies = filters.companies.join(',');
          if (filters.regions && filters.regions.length > 0) params.regions = filters.regions.join(',');
          if (filters.stationQuery) params.station_query = filters.stationQuery;
          else if (filters.stationCodes && filters.stationCodes.length > 0) params.station_query = filters.stationCodes.join(',');

          try {
            const delayResponse = await apiService.getDelayBoxplot(params);
            if (delayResponse.data.file_path) setDelayBoxplotPath(toApiUrl(delayResponse.data.file_path));
            else setDelayBoxplotPath(null);
          } catch (err) {
            if (err.response && err.response.status === 501) setDelayBoxplotPath('NOT_IMPLEMENTED');
            else {
              console.error('Failed to load delay boxplot:', err);
              setDelayBoxplotPath(null);
            }
          }

          try {
            const trainResponse = await apiService.getDayTrainCount(params);
            if (trainResponse.data.file_path) setTrainCountPath(toApiUrl(trainResponse.data.file_path));
            else setTrainCountPath(null);
          } catch (err) {
            if (err.response && err.response.status === 501) setTrainCountPath('NOT_IMPLEMENTED');
            else {
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
      return;
    }
    fetchStatistics();
  }, [filters, viewMode, selectedYear, selectedMonth, customStartDate, customEndDate]);

  const availableYears = [...new Set(availableMonths.map((m) => m.year))].sort((a, b) => b - a);
  const monthsForYear = selectedYear
    ? availableMonths.filter((m) => m.year === selectedYear).sort((a, b) => a.month - b.month)
    : [];

  const availableRange = availableMonths.length
    ? {
        start: `${availableMonths[0].year}-${String(availableMonths[0].month).padStart(2, '0')}-01`,
        end: `${availableMonths[availableMonths.length - 1].year}-${String(availableMonths[availableMonths.length - 1].month).padStart(2, '0')}-28`,
      }
    : null;

  const customDateRangeError = (() => {
    const s = (customStartDate || '').trim();
    const e = (customEndDate || '').trim();
    if (!s && !e) return null;
    if ((s && !e) || (!s && e)) return 'Select both start and end date.';
    if (s && e && s > e) return 'Start date must be before (or equal to) end date.';
    return null;
  })();

  const selectedStatsRange = customStartDate && customEndDate
    ? { start: customStartDate, end: customEndDate }
    : (filters.startDate && filters.endDate ? { start: filters.startDate, end: filters.endDate } : null);

  const customAvailableRange = availableDateRange || availableRange;

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  return (
    <div className="statistics-page">
      <div className="dashboard-header">
        <div className="header-content">
          <h1>📊 Railway Performance Statistics</h1>
          <p className="header-subtitle">
            Analyze train delays, service frequency, and performance metrics across the Italian railway network.
            {viewMode === 'monthly'
              ? ' Monthly views show comprehensive day-by-day analysis.'
              : ' Apply custom filters to drill down into specific scenarios.'}
          </p>
        </div>
      </div>

      <div className="view-mode-selector">
        <button className={viewMode === 'monthly' ? 'active' : ''} onClick={() => setViewMode('monthly')}>
          📅 Monthly View
        </button>
        <button className={viewMode === 'custom' ? 'active' : ''} onClick={() => setViewMode('custom')}>
          🔧 Custom Range
        </button>
      </div>

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
                    const monthsInYear = availableMonths.filter((m) => m.year === year);
                    if (monthsInYear.length > 0) setSelectedMonth(monthsInYear[0].month);
                  }}
                  disabled={availableYears.length === 0}
                >
                  {availableYears.length === 0 && <option value="">No data</option>}
                  {availableYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
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
                    <option key={month} value={month}>
                      {monthNames[month - 1]}
                    </option>
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

      {viewMode === 'custom' && (customAvailableRange || selectedStatsRange) && (
        <div className="range-banner">
          <div className="range-controls">
            <div className="range-controls-title">📅 Statistics date range</div>
            <div className="range-controls-grid">
              <div className="range-control">
                <label htmlFor="stats-custom-start">Start</label>
                <div className="range-control-input" onClick={() => openNativeDatePicker(customStartInputRef.current)}>
                  <span className="range-control-icon" aria-hidden="true">📅</span>
                  <input
                    id="stats-custom-start"
                    type="date"
                    ref={customStartInputRef}
                    value={customStartDate}
                    min={customAvailableRange?.start || undefined}
                    max={customEndDate || customAvailableRange?.end || undefined}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    onClick={() => openNativeDatePicker(customStartInputRef.current)}
                    onFocus={() => openNativeDatePicker(customStartInputRef.current)}
                  />
                </div>
              </div>
              <div className="range-controls-sep" aria-hidden="true">→</div>
              <div className="range-control">
                <label htmlFor="stats-custom-end">End</label>
                <div className="range-control-input" onClick={() => openNativeDatePicker(customEndInputRef.current)}>
                  <span className="range-control-icon" aria-hidden="true">📅</span>
                  <input
                    id="stats-custom-end"
                    type="date"
                    ref={customEndInputRef}
                    value={customEndDate}
                    min={customStartDate || customAvailableRange?.start || undefined}
                    max={customAvailableRange?.end || undefined}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    onClick={() => openNativeDatePicker(customEndInputRef.current)}
                    onFocus={() => openNativeDatePicker(customEndInputRef.current)}
                  />
                </div>
              </div>
            </div>
            {customDateRangeError && (
              <div className="range-hint">
                ⚠️ {customDateRangeError} Using {filters.startDate && filters.endDate ? 'the shared filter range' : 'all available dates'} until it’s complete.
              </div>
            )}
          </div>

          {customAvailableRange && (
            <div className="range-text">
              Data available: <strong>{customAvailableRange.start}</strong> → <strong>{customAvailableRange.end}</strong>
            </div>
          )}
          <div className="range-text">
            Selected range:{' '}
            {selectedStatsRange ? (
              <>
                <strong>{selectedStatsRange.start}</strong> → <strong>{selectedStatsRange.end}</strong>
              </>
            ) : (
              <strong>All available dates</strong>
            )}
          </div>
          {customAvailableRange && (
            <div className="range-hint">If you see "No trains.csv files found", choose dates within this range.</div>
          )}
        </div>
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
              {customAvailableRange && (
                <div className="error-dialog-hint">
                  <strong>💡 Tip:</strong> Select dates between <code>{customAvailableRange.start}</code> and <code>{customAvailableRange.end}</code>
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
              <p className="chart-description">Delay patterns at last stop for each train. Shows median, quartiles, and outliers.</p>
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
              <p className="chart-description">Number of unique trains per day, grouped by railway company.</p>
            </div>
            <div className="chart-content">
              {trainCountPath === 'NOT_IMPLEMENTED' ? (
                <div className="stat-placeholder">
                  <span className="placeholder-icon">🚫</span>
                  <p>Live train count is not available from the public API.</p>
                </div>
              ) : trainCountPath ? (
                <img src={trainCountPath} alt="Daily Train Count" className="stat-img" />
              ) : (
                <div className="stat-placeholder">
                  <span className="placeholder-icon">📭</span>
                  <p>No train count available for selected filters.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StatisticsSection;

import React, { useEffect, useRef, useState } from 'react';
import { apiService } from '../services/api';
import StationDetailsCard from '../components/StationDetailsCard';
import './StatisticsSection.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const toApiUrl = (p) => (p && typeof p === 'string' && p.startsWith('/') ? `${API_URL}${p}` : p);

/**
 * Statistics Section
 * Formerly: pages/Statistics
 */
const StatisticsSection = ({ filters = {}, datasetVersion = 0 }) => {
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
  const [stationDetails, setStationDetails] = useState(null);
  const [stationStats, setStationStats] = useState(null);

  const customStartInputRef = useRef(null);
  const customEndInputRef = useRef(null);

  // Extract selected station code from filters
  const selectedStationCode = Array.isArray(filters.stationCodes) && filters.stationCodes.length > 0
    ? filters.stationCodes[0]
    : filters.stationCode || null;

  const isStationSpecificAnalysis = viewMode === 'custom' && Boolean(selectedStationCode);
  const stationLabel =
    (stationDetails?.properties?.name ||
      stationDetails?.properties?.long_name ||
      stationDetails?.properties?.longName ||
      stationDetails?.properties?.short_name ||
      stationDetails?.properties?.shortName ||
      selectedStationCode ||
      null);

  const stationNoDataMessage = stationLabel
    ? `Not enough data to analyze ${stationLabel}.`
    : 'Not enough data to analyze this station.';

  const clearStationSelection = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('stationCode');
      const next = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState({}, '', next);
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent('stationCleared'));
  };

  // Load station details if a specific station is selected
  useEffect(() => {
    if (!selectedStationCode) {
      setStationDetails(null);
      setStationStats(null);
      return;
    }

    const fetchStationDetails = async () => {
      try {
        const stationsRes = await apiService.getStations({ with_coords_only: true, limit: 0 });
        const stationFeature = stationsRes.data?.features?.find(
          (f) => String(f?.properties?.code || '').toLowerCase().trim() === String(selectedStationCode).toLowerCase().trim()
        );
        setStationDetails(stationFeature || null);

        // Try to fetch external statistics using station name
        try {
          const stationName = stationFeature?.properties?.long_name || stationFeature?.properties?.name;
          if (stationName) {
            const externalRes = await apiService.getExternalStationStats(stationName);
            if (externalRes.data?.data) {
              setStationStats(externalRes.data.data);
            }
          }
        } catch (err) {
          console.warn('Could not fetch external station stats:', err);
          // Non-fatal: we can still show local data
        }
      } catch (err) {
        console.error('Failed to fetch station details:', err);
        setStationDetails(null);
      }
    };

    fetchStationDetails();
  }, [selectedStationCode]);

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
  }, [datasetVersion]);

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
  }, [datasetVersion]);

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
  }, [filters, viewMode, selectedYear, selectedMonth, customStartDate, customEndDate, datasetVersion]);

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
      {selectedStationCode && stationDetails && (
        <StationDetailsCard station={stationDetails} stationStats={stationStats} onClose={clearStationSelection} />
      )}

      <div className="dashboard-header">
        <div className="header-content">
          <h1>📊 Railway Performance Statistics</h1>
          <p className="header-subtitle">
            {selectedStationCode && stationDetails
              ? `Detailed analysis for ${stationDetails.properties?.name || selectedStationCode}. This station was selected from the map.`
              : 'Analyze train delays, service frequency, and performance metrics across the Italian railway network.'}
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
                  <p>{isStationSpecificAnalysis ? stationNoDataMessage : 'No boxplot available for selected filters.'}</p>
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
                  <p>{isStationSpecificAnalysis ? stationNoDataMessage : 'No train count available for selected filters.'}</p>
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

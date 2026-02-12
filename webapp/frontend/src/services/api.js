import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// API Service - All endpoints for the frontend
export const apiService = {
  // Health Check
  getHealth: () => api.get('/health'),

  // ===== STATISTICS ENDPOINTS (US-1, US-2, US-3) =====
  
  /**
   * Get descriptive statistics (US-1: Performance Statistics)
   * Returns: count, mean, std, min, 25%, 50%, 75%, max for delays, crowding, etc.
   */
  getDescribeStats: (params = {}) => api.get('/stats/describe', { params }),

  /**
   * Get delay boxplot visualization (US-2: Delay Patterns)
   * Returns: path to PNG image showing delay distribution
   */
  getDelayBoxplot: (params = {}) => api.get('/stats/delay-boxplot', { params }),

  /**
   * Get daily train count data (US-3: Service Frequency)
   * Returns: path to chart showing trains per day by company
   */
  getDayTrainCount: (params = {}) => api.get('/stats/day-train-count', { params }),

  /**
   * Get monthly train count chart (US-3: Service Frequency)
   * Returns: path to precomputed monthly chart
   */
  getDayTrainCountMonthly: (year, month) => api.get('/stats/day-train-count/monthly', { 
    params: { year, month } 
  }),

  /**
   * Get monthly delay boxplot (US-2: Delay Patterns)
   * Returns: path to precomputed monthly boxplot
   */
  getDelayBoxplotMonthly: (year, month) => api.get('/stats/delay-boxplot/monthly', { 
    params: { year, month } 
  }),

  /**
   * Get available months for monthly statistics
   * Returns: list of {year, month, key} objects
   */
  getAvailableMonths: () => api.get('/stats/available-months'),

  /**
   * Get external station statistics from TrainStats API
   * Returns: detailed statistics from trainstats.altervista.org
   */
  getExternalStationStats: (stationCode) => api.get(`/stats/external-station/${stationCode}`),

  // ===== MAP ENDPOINTS (US-4) =====

  /**
   * Get train trajectories for interactive map (US-4: Interactive Map)
   * Returns: path to HTML map or GeoJSON data with train paths
   */
  getTrajectories: (params = {}) => api.get('/map/trajectories', { params }),

  /**
   * Get station locations (US-4, US-9: Geography)
   * Returns: GeoJSON with all stations and their coordinates
   */
  getStations: (params = {}) => api.get('/stations', { params }),

  // ===== DATASET UPLOAD =====

  uploadDataset: (formData) => api.post('/data/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),

  getDataInfo: () => api.get('/data/info'),

  listArchives: () => api.get('/data/archives'),

  revertArchive: (stamp = null) => {
    const form = new FormData();
    if (stamp) form.append('stamp', stamp);
    return api.post('/data/revert', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  applyArchive: (stamp) => {
    const form = new FormData();
    form.append('stamp', stamp);
    return api.post('/data/apply-archive', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  deleteArchive: (stamp) => {
    const form = new FormData();
    form.append('stamp', stamp);
    return api.post('/data/delete-archive', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  clearArchives: () => api.post('/data/clear-archives', {}, {
    headers: { 'Content-Type': 'application/json' },
  }),

  // ===== FUTURE ENDPOINTS (for filtering) =====

  /**
   * Get available companies for filtering (US-8)
   * Can be extended to fetch from API if needed
   */
  getCompanies: () => {
    // Hardcoded for now, can be moved to backend
    return Promise.resolve({
      data: [
        // Match UI labels requested (train types)
        // 'ALL' is handled client-side as "no filter".
        { code: 'TRENITALIA_REG', label: 'Regionali' },
        { code: 'TRENITALIA_AV', label: 'Frecce' },
        { code: 'TRENITALIA_IC', label: 'InterCity' },
        { code: 'ALL', label: 'Generale' },
      ],
    });
  },

  /**
   * Get available regions for filtering (US-9)
   */
  getRegions: () => {
    return Promise.resolve({
      data: [
        'Lombardia',
        'Emilia-Romagna',
        'Piemonte',
        'Veneto',
        'Toscana',
        'Lazio',
        'Campania',
        'Sicilia',
        'Puglia',
      ],
    });
  },
};

export default api;

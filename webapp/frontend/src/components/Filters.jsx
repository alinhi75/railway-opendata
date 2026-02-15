import React, { useEffect, useMemo, useState, useRef } from 'react';
import { apiService } from '../services/api';
import './Filters.css';

/**
 * Filters Component
 * US-8: Company selector
 * US-9: Region/Station search
 *
 * Props:
 * - onChange(filters): callback invoked when filters change
 * - onDatasetApplied(): callback invoked when dataset is applied
 * - initialFilters: optional initial filter values
 */
const Filters = ({ onChange, onDatasetApplied, initialFilters = {} }) => {
  const [companies, setCompanies] = useState(initialFilters.companies || []);
  const [regions, setRegions] = useState(initialFilters.regions || []);
  const [startDate, setStartDate] = useState(initialFilters.startDate || '');
  const [endDate, setEndDate] = useState(initialFilters.endDate || '');
  const [stationQuery, setStationQuery] = useState(initialFilters.stationQuery || '');
  const [selectedStations, setSelectedStations] = useState([]); // Array of {code, name, region, regionName}
  const [relationFrom, setRelationFrom] = useState('');
  const [relationTo, setRelationTo] = useState('');
  const [relationModalOpen, setRelationModalOpen] = useState(false);
  const [relationFromQuery, setRelationFromQuery] = useState('');
  const [relationToQuery, setRelationToQuery] = useState('');
  const [relationFromStation, setRelationFromStation] = useState(null);
  const [relationToStation, setRelationToStation] = useState(null);
  const [relationFromSuggestions, setRelationFromSuggestions] = useState([]);
  const [relationToSuggestions, setRelationToSuggestions] = useState([]);
  const [relationFromLoading, setRelationFromLoading] = useState(false);
  const [relationToLoading, setRelationToLoading] = useState(false);
  const [relationFromOpen, setRelationFromOpen] = useState(false);
  const [relationToOpen, setRelationToOpen] = useState(false);
  const [relationDestinations, setRelationDestinations] = useState([]);
  const [relationDestinationsLoading, setRelationDestinationsLoading] = useState(false);
  const [relationResults, setRelationResults] = useState([]);
  const [relationLoading, setRelationLoading] = useState(false);
  const [relationError, setRelationError] = useState(null);
  const [selectedRelationIndex, setSelectedRelationIndex] = useState(null);
  const [relationDetail, setRelationDetail] = useState(null);
  const [relationDetailLoading, setRelationDetailLoading] = useState(false);
  const [relationDetailError, setRelationDetailError] = useState(null);
  const [relationDetailModalOpen, setRelationDetailModalOpen] = useState(false);
  const relationFromMouseDown = useRef(false);
  const relationToMouseDown = useRef(false);

  const [availableCompanies, setAvailableCompanies] = useState([]);
  const [availableRegions, setAvailableRegions] = useState([]);
  const [availableDateRange, setAvailableDateRange] = useState(null);
  const [currentDatasetName, setCurrentDatasetName] = useState('');
  const [stationSuggestions, setStationSuggestions] = useState([]);
  const [stationLoading, setStationLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mouseOverSuggestions, setMouseOverSuggestions] = useState(false); // Track if mouse is over suggestions to prevent closing on blur
  const mouseDownOnSuggestions = useRef(false); // Track if mouse is down on suggestions to prevent closing on blur

  const [uploadStationsFile, setUploadStationsFile] = useState(null);
  const [uploadZipFile, setUploadZipFile] = useState(null);
  const [datasetName, setDatasetName] = useState('');
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadStats, setUploadStats] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [archives, setArchives] = useState([]);
  const [selectedArchive, setSelectedArchive] = useState('');
  const [archiveSelectionLocked, setArchiveSelectionLocked] = useState(false);
  const [revertStatus, setRevertStatus] = useState(null);
  const [reverting, setReverting] = useState(false);
  const [deletingArchive, setDeletingArchive] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [applyingArchive, setApplyingArchive] = useState(false);
  const [applyArchiveStatus, setApplyArchiveStatus] = useState(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const dateRangeError = useMemo(() => {
    const s = (startDate || '').trim();
    const e = (endDate || '').trim();
    if (!s && !e) return null;
    if ((s && !e) || (!s && e)) return 'Select both start and end date.';
    if (s && e && s > e) return 'Start date must be before (or equal to) end date.';
    return null;
  }, [startDate, endDate]);

  useEffect(() => {
    // Load available companies, regions, and date range
    const fetchFiltersMeta = async () => {
      try {
        const [companiesRes, regionsRes] = await Promise.all([
          apiService.getCompanies(),
          apiService.getRegions(),
        ]);
        setAvailableCompanies(companiesRes.data);
        setAvailableRegions(regionsRes.data);
        
        // Try to fetch available date range
        try {
          const statsRes = await apiService.getDescribeStats();
          if (statsRes.data?.available_min_date && statsRes.data?.available_max_date) {
            setAvailableDateRange({
              start: statsRes.data.available_min_date,
              end: statsRes.data.available_max_date,
            });
          }
        } catch (err) {
          console.warn('Could not fetch date range from stats:', err);
        }
      } catch (err) {
        console.error('Failed to load filter metadata', err);
      }
    };
    fetchFiltersMeta();
  }, []);

  const refreshArchives = async ({ preferCurrent } = {}) => {
    try {
      const res = await apiService.listArchives();
      const nextArchives = res?.data?.archives || [];
      setArchives(nextArchives);
      let nextSelection = selectedArchive;
      if (preferCurrent) {
        nextSelection = nextArchives.find((a) => a.is_current)?.stamp || nextSelection;
      }
      if (!nextSelection || !nextArchives.some((a) => a.stamp === nextSelection)) {
        nextSelection = nextArchives[0]?.stamp || '';
      }
      setSelectedArchive(nextSelection);
      const selectionInfo = nextArchives.find((a) => a.stamp === nextSelection);
      setArchiveSelectionLocked(selectionInfo?.is_current ?? false);
      return nextArchives;
    } catch (err) {
      console.warn('Could not load archives', err);
      setArchiveSelectionLocked(false);
      return [];
    }
  };

  const refreshAvailableRange = async () => {
    try {
      const infoRes = await apiService.getDataInfo();
      if (infoRes.data?.available_min_date && infoRes.data?.available_max_date) {
        setAvailableDateRange({
          start: infoRes.data.available_min_date,
          end: infoRes.data.available_max_date,
        });
      }
      setCurrentDatasetName(infoRes.data?.dataset_name || '');
    } catch (err) {
      console.warn('Could not refresh date range:', err);
    }
  };

  useEffect(() => {
    refreshArchives({ preferCurrent: true });
  }, []);

  const selectedArchiveInfo = useMemo(() => (
    archives.find((a) => a.stamp === selectedArchive)
  ), [archives, selectedArchive]);

  useEffect(() => {
    const q = (stationQuery || '').trim();
    if (q.length < 2) {
      setStationSuggestions([]);
      setStationLoading(false);
      return;
    }

    const isExactRegion = availableRegions
      .some((r) => String(r).trim().toLowerCase() === q.toLowerCase());

    let cancelled = false;
    setStationLoading(true);

    const t = setTimeout(async () => {
      try {
        const res = await apiService.getStations({ q, limit: 0 });
        if (cancelled) return;

        const features = res?.data?.features || [];
        const suggestions = features
          .map((f) => {
            const props = f.properties || {};
            return {
              code: props.code,
              name: props.name || props.short_name || props.shortName || props.code,
              region: props.region,
              regionName: props.region_name || props.regionName || null,
            };
          })
          .filter((s) => s.name)
          .sort((a, b) => {
            const an = String(a.name || '').trim();
            const bn = String(b.name || '').trim();
            const byName = an.localeCompare(bn, 'it', { sensitivity: 'base' });
            if (byName !== 0) return byName;

            const ac = String(a.code || '').trim();
            const bc = String(b.code || '').trim();
            return ac.localeCompare(bc, 'it', { sensitivity: 'base' });
          });

        setStationSuggestions(suggestions);
      } catch (err) {
        if (!cancelled) setStationSuggestions([]);
        console.error('Failed to load stations', err);
      } finally {
        if (!cancelled) setStationLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [stationQuery]);

  useEffect(() => {
    let cancelled = false;
    const fetchRelationDestinations = async () => {
      if (!relationFromStation?.name) {
        setRelationDestinations([]);
        return;
      }
      try {
        setRelationDestinationsLoading(true);
        const res = await apiService.getExternalRelationDestinations(relationFromStation.name);
        if (cancelled) return;
        setRelationDestinations(res?.data?.destinations || []);
      } catch (err) {
        if (!cancelled) setRelationDestinations([]);
        console.error('Failed to load relation destinations', err);
      } finally {
        if (!cancelled) setRelationDestinationsLoading(false);
      }
    };
    fetchRelationDestinations();
    return () => {
      cancelled = true;
    };
  }, [relationFromStation]);

  const mapStationSuggestions = (features = []) => (
    features
      .map((f) => {
        const props = f.properties || {};
        return {
          code: props.code,
          name: props.name || props.short_name || props.shortName || props.code,
          region: props.region,
          regionName: props.region_name || props.regionName || null,
        };
      })
      .filter((s) => s.name)
      .sort((a, b) => {
        const an = String(a.name || '').trim();
        const bn = String(b.name || '').trim();
        const byName = an.localeCompare(bn, 'it', { sensitivity: 'base' });
        if (byName !== 0) return byName;

        const ac = String(a.code || '').trim();
        const bc = String(b.code || '').trim();
        return ac.localeCompare(bc, 'it', { sensitivity: 'base' });
      })
  );

  useEffect(() => {
    const q = (relationFromQuery || '').trim();
    if (q.length < 2) {
      setRelationFromSuggestions([]);
      setRelationFromLoading(false);
      return;
    }

    let cancelled = false;
    setRelationFromLoading(true);

    const t = setTimeout(async () => {
      try {
        const res = await apiService.getStations({ q, limit: 0 });
        if (cancelled) return;
        const features = res?.data?.features || [];
        setRelationFromSuggestions(mapStationSuggestions(features));
      } catch (err) {
        if (!cancelled) setRelationFromSuggestions([]);
        console.error('Failed to load origin stations', err);
      } finally {
        if (!cancelled) setRelationFromLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [relationFromQuery]);

  useEffect(() => {
    const q = (relationToQuery || '').trim();
    if (!relationDestinations.length) {
      setRelationToSuggestions([]);
      setRelationToLoading(relationDestinationsLoading);
      return;
    }

    const needle = q.toLowerCase();
    const matches = relationDestinations
      .filter((name) => (needle ? String(name || '').toLowerCase().includes(needle) : true))
      .slice(0, 50)
      .map((name) => ({ name }));
    setRelationToSuggestions(matches);
    setRelationToLoading(relationDestinationsLoading);
  }, [relationToQuery, relationDestinations, relationDestinationsLoading]);


  const selectStation = (s) => {
    setSelectedStations((prev) => {
      if (prev.some((st) => st.code === s.code)) return prev;
      return [...prev, s];
    });
    // Station will be included when Apply is clicked
  };

  const removeSelectedStation = (code) => {
    setSelectedStations((prev) => prev.filter((s) => s.code !== code));
  };

  const applyFilters = () => {
    if (dateRangeError) return;
    // Combine all active filters
    const filters = {
      startDate: startDate || null,
      endDate: endDate || null,
      companies: companies.length > 0 ? companies : null,
      regions: regions.length > 0 ? regions : null,
      stationQuery: stationQuery || null,
      stationCodes: selectedStations.length > 0 ? selectedStations.map((s) => s.code).filter(Boolean) : null,
    };
    
    // Remove null values for cleaner params
    const cleanedFilters = Object.fromEntries(
      Object.entries(filters).filter(([_, v]) => v !== null)
    );
    
    onChange?.(cleanedFilters);
  };

  const clearFilters = () => {
    setCompanies([]);
    setRegions([]);
    setStartDate('');
    setEndDate('');
    setStationQuery('');
    setSelectedStations([]);
    setRelationFrom('');
    setRelationTo('');
    setRelationFromQuery('');
    setRelationToQuery('');
    setRelationFromStation(null);
    setRelationToStation(null);
    onChange?.({});
  };

  const toggleCompany = (code) => {
    if (code === 'ALL') {
      // 'Generale' means: no specific company/type filter
      setCompanies([]);
      return;
    }
    setCompanies((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const toggleRegion = (region) => {
    setRegions((prev) => prev.includes(region) ? prev.filter(r => r !== region) : [...prev, region]);
  };

  const handleUpload = async () => {
    if (uploading) return;
    
    // At least one file required
    if (!uploadStationsFile && !uploadZipFile) {
      setUploadStatus({ type: 'error', message: 'Select at least one file (stations.csv or ZIP archive).' });
      return;
    }

    const formData = new FormData();
    formData.append('upload_mode', 'full');
    formData.append('precompute', 'true');

    if (uploadStationsFile) {
      formData.append('stations_file', uploadStationsFile);
    }
    if (uploadZipFile) {
      formData.append('zip_file', uploadZipFile);
    }
    if (datasetName.trim()) {
      formData.append('dataset_name', datasetName.trim());
    }

    setUploading(true);
    setUploadStatus({ type: 'info', message: 'Uploading files and queueing analysis...' });
    setUploadStats(null);

    try {
      const res = await apiService.uploadDataset(formData);
      const range = res?.data?.precompute_range;
      const stats = res?.data?.upload_stats || {};
      
      const extra = range
        ? ` Range: ${range.start_date} → ${range.end_date}${range.clamped_to_max_range ? ' (clamped)' : ''}.`
        : '';
      
      setUploadStatus({ type: 'success', message: `✅ Dataset applied successfully${extra ? '.' + extra : ''}` });
      setUploadStats(stats);
      setUploadStationsFile(null);
      setUploadZipFile(null);
      setDatasetName('');
      await refreshAvailableRange();
      await refreshArchives({ preferCurrent: true });
      // Trigger map refresh by incrementing dataset version
      onDatasetApplied?.();
    } catch (err) {
      console.error('Upload failed', err);
      setUploadStatus({ type: 'error', message: 'Upload failed. Check backend logs for details.' });
    } finally {
      setUploading(false);
    }
  };

  const closeUploadModal = () => {
    if (uploading) return;
    setUploadModalOpen(false);
  };

  const resetRelationInputs = () => {
    setRelationFromStation(null);
    setRelationToStation(null);
    setRelationFromQuery('');
    setRelationToQuery('');
    setRelationFrom('');
    setRelationTo('');
    setRelationFromOpen(false);
    setRelationToOpen(false);
    setRelationResults([]);
    setRelationError(null);
  };

  const closeRelationModal = () => {
    setRelationModalOpen(false);
    setSelectedRelationIndex(null);
    setRelationDetail(null);
    setRelationDetailError(null);
    resetRelationInputs();
  };

  const closeRelationDetailModal = () => {
    setRelationDetailModalOpen(false);
    setRelationDetail(null);
    setRelationDetailError(null);
  };

  const fetchRelationData = async () => {
    if (!relationFromStation || !relationToStation) return;
    const fromName = relationFromStation.name || relationFromQuery || relationFrom;
    const toName = relationToStation.name || relationToQuery || relationTo;

    if (!fromName || !toName) return;

    try {
      setRelationLoading(true);
      setRelationError(null);
      setSelectedRelationIndex(null);
      const res = await apiService.getExternalRelation(fromName, toName);
      setRelationResults(res?.data?.rows || []);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404) {
        setRelationResults([]);
        setRelationError('No relation data found for the selected stations.');
      } else {
        setRelationResults([]);
        setRelationError('Failed to load relation data. Please try again.');
      }
    } finally {
      setRelationLoading(false);
    }
  };

  useEffect(() => {
    if (!relationModalOpen) return;
    fetchRelationData();
  }, [relationModalOpen, relationFromStation, relationToStation]);

  useEffect(() => {
    setSelectedRelationIndex(null);
    setRelationDetail(null);
    setRelationDetailError(null);
  }, [relationResults]);

  const fetchRelationTrainDetail = async (row, idx) => {
    setSelectedRelationIndex(idx);
    setRelationDetail(null);
    setRelationDetailError(null);
    setRelationModalOpen(false);
    setRelationDetailModalOpen(true);

    if (!row?.train_number || !row.origin || !row.destination || !row.origin_time || !row.destination_time) {
      setRelationDetailError('Missing train detail parameters for this row.');
      return;
    }

    try {
      setRelationDetailLoading(true);
      const res = await apiService.getExternalTrainDetail({
        ref: 'cr',
        treno: row.train_number,
        stazpart: row.origin,
        stazarr: row.destination,
        op: row.origin_time,
        oa: row.destination_time,
      });
      setRelationDetail(res?.data || null);
    } catch (err) {
      setRelationDetailError('Failed to load train detail. Please try again.');
    } finally {
      setRelationDetailLoading(false);
    }
  };

  const handleDeleteArchive = () => {
    if (!selectedArchive || selectedArchiveInfo?.is_default || selectedArchiveInfo?.is_current) return;
    setShowDeleteConfirm(true);
  };

  const handleApplyArchive = async (stamp) => {
    const info = archives.find((a) => a.stamp === stamp);
    if (applyingArchive || !stamp || info?.is_current) return;
    setApplyingArchive(true);
    setApplyArchiveStatus({ type: 'info', message: 'Applying archive...' });
    try {
      await apiService.applyArchive(stamp);
      setApplyArchiveStatus({ type: 'success', message: '✓ Archive applied successfully!' });
      await refreshAvailableRange();
      await refreshArchives({ preferCurrent: true });
      onDatasetApplied?.();
      setTimeout(() => setApplyArchiveStatus(null), 3000);
    } catch (err) {
      console.error('Apply archive failed', err);
      setApplyArchiveStatus({ type: 'error', message: 'Failed to apply archive. Check backend logs.' });
    } finally {
      setApplyingArchive(false);
    }
  };

  const confirmDeleteArchive = async () => {
    setShowDeleteConfirm(false);
    
    if (deletingArchive || !selectedArchive || selectedArchiveInfo?.is_default || selectedArchiveInfo?.is_current) return;
    setDeletingArchive(true);
    setDeleteStatus({ type: 'info', message: 'Deleting archive...' });

    try {
      await apiService.deleteArchive(selectedArchive);
      setDeleteStatus({ type: 'success', message: '✓ Archive deleted successfully!' });
      setSelectedArchive('');
      setArchiveSelectionLocked(false);
      await refreshArchives({ preferCurrent: true });
      setTimeout(() => setDeleteStatus(null), 3000);
    } catch (err) {
      console.error('Delete archive failed', err);
      setDeleteStatus({ type: 'error', message: 'Failed to delete archive. Check backend logs.' });
    } finally {
      setDeletingArchive(false);
    }
  };

  // Count active filters for display
  const activeFilterCount = [
    Boolean(startDate || endDate),
    companies.length > 0,
    regions.length > 0,
    selectedStations.length > 0 || stationQuery,
  ].filter(Boolean).length;

  const selectedRelationRow = selectedRelationIndex !== null
    ? relationResults[selectedRelationIndex]
    : null;

  const renderKeyValueGrid = (data, emptyLabel = 'No data available.') => {
    if (!data || Object.keys(data).length === 0) {
      return <div className="relation-detail-empty">{emptyLabel}</div>;
    }

    return (
      <div className="detail-kv-grid">
        {Object.entries(data).map(([key, value]) => (
          <div className="detail-kv" key={key}>
            <span className="detail-kv-label">{key}</span>
            <span className="detail-kv-value">{value || '—'}</span>
          </div>
        ))}
      </div>
    );
  };

  const parseCount = (value) => {
    if (value === null || value === undefined) return 0;
    const num = String(value).replace(/[^0-9-]/g, '');
    const parsed = Number(num);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getStatValue = (stats, keys = []) => {
    if (!stats) return 0;
    const entries = Object.entries(stats);
    for (const key of keys) {
      const match = entries.find(([k]) => k.trim().toLowerCase() === key);
      if (match) return parseCount(match[1]);
    }
    return 0;
  };

  const mapWeekdayToEnglish = (value) => {
    if (!value) return value;
    const normalized = value
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();

    const mapping = {
      lunedi: 'Monday',
      martedi: 'Tuesday',
      mercoledi: 'Wednesday',
      giovedi: 'Thursday',
      venerdi: 'Friday',
      sabato: 'Saturday',
      domenica: 'Sunday',
      generale: 'Overall',
    };

    return mapping[normalized] || value;
  };

  const renderDonutChart = (title, items, totalOverride = null) => {
    const total = totalOverride ?? items.reduce((sum, item) => sum + item.value, 0);
    const safeTotal = total > 0 ? total : 1;
    let offset = 0;

    return (
      <div className="detail-chart-card">
        <div className="detail-card-title">{title}</div>
        <div className="detail-chart-body">
          <div className="detail-donut">
            <svg viewBox="0 0 36 36">
              <circle className="detail-donut-track" cx="18" cy="18" r="15.5" />
              {items.map((item) => {
                const pct = total > 0 ? (item.value / safeTotal) * 100 : 0;
                const dash = `${pct} ${100 - pct}`;
                const strokeDasharray = dash;
                const strokeDashoffset = 25 - offset;
                offset += pct;
                return (
                  <circle
                    key={item.label}
                    className="detail-donut-segment"
                    cx="18"
                    cy="18"
                    r="15.5"
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    style={{ stroke: item.color }}
                  />
                );
              })}
            </svg>
            <div className="detail-donut-center">
              <div className="detail-donut-total">{total > 0 ? total : '—'}</div>
              <div className="detail-donut-label">Totali</div>
            </div>
          </div>
          <div className="detail-legend">
            {items.map((item) => (
              <div className="detail-legend-item" key={item.label}>
                <span className="detail-legend-dot" style={{ background: item.color }}></span>
                <span className="detail-legend-text">{item.label}</span>
                <span className="detail-legend-value">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="filters">
      <div className="filters-header">
        <h2>Filters {activeFilterCount > 0 && <span className="filter-badge">{activeFilterCount}</span>}</h2>
      </div>

      <section className="filters-section upload-section">
        <h3>📤 Dataset Management</h3>
        <div className="upload-panel">
          {/* Dataset Status Panel */}
          <div className="dataset-status-panel">
            <div className="dataset-info">
              <div className="dataset-info-item">
                <span className="dataset-info-label">Current Data Range:</span>
                <span className="dataset-info-value">
                  {availableDateRange
                    ? `${availableDateRange.start} → ${availableDateRange.end}`
                    : 'Not available'}
                </span>
              </div>
              {currentDatasetName && (
                <div className="dataset-info-item">
                  <span className="dataset-info-label">Current Dataset:</span>
                  <span className="dataset-info-value">{currentDatasetName}</span>
                </div>
              )}
            </div>
            
            {/* Archive Management */}
            <div className="archive-controls">
              <span className="controls-label">Manage Archives:</span>
              <div className="controls-group">
                <select
                  value={selectedArchive}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedArchive(value);
                    const info = archives.find((a) => a.stamp === value);
                    setArchiveSelectionLocked(info?.is_current ?? false);
                  }}
                  disabled={reverting || applyingArchive || archives.length === 0}
                  className="archive-select"
                >
                  {archives.map((a) => {
                    const baseName = a.name || (a.is_default ? 'Bundled dataset' : a.stamp);
                    const suffix = (!a.is_current && !a.is_default && a.name) ? ` (${a.stamp})` : '';
                    const prefix = a.is_current
                      ? '⚡ Current dataset: '
                      : a.is_default
                        ? '⭐ Default - '
                        : '';
                    return (
                      <option key={a.stamp} value={a.stamp}>
                        {prefix}{baseName}{suffix}
                      </option>
                    );
                  })}
                </select>
                <button
                  className="btn btn-success btn-sm"
                  onClick={async () => {
                    if (selectedArchive && !applyingArchive && !selectedArchiveInfo?.is_current) {
                      await handleApplyArchive(selectedArchive);
                    }
                  }}
                  disabled={
                    applyingArchive ||
                    !selectedArchive ||
                    archives.length === 0 ||
                    archiveSelectionLocked ||
                    selectedArchiveInfo?.is_current
                  }
                  title="Apply the selected archive as current dataset"
                >
                  {applyingArchive ? 'Applying...' : '↪️ Apply Archive'}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={async () => {
                    if (reverting) return;
                    setRevertStatus({ type: 'info', message: 'Restoring dataset...' });
                    setReverting(true);
                    try {
                      const targetStamp = selectedArchiveInfo?.is_current ? null : selectedArchive || null;
                      await apiService.revertArchive(targetStamp);
                      setRevertStatus({ type: 'success', message: 'Restore complete. Refreshing data range.' });
                      await refreshAvailableRange();
                      await refreshArchives({ preferCurrent: true });
                      onDatasetApplied?.();
                    } catch (err) {
                      console.error('Restore failed', err);
                      setRevertStatus({ type: 'error', message: 'Restore failed. Check backend logs.' });
                    } finally {
                      setReverting(false);
                    }
                  }}
                  disabled={reverting || archives.length === 0}
                  title="Restore with backup (saves current as archive)"
                >
                  {reverting ? 'Restoring...' : '↩️ Restore'}
                </button>
                {archives.length > 0 && (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={handleDeleteArchive}
                    disabled={
                      deletingArchive ||
                      !selectedArchive ||
                      selectedArchiveInfo?.is_default ||
                      selectedArchiveInfo?.is_current
                    }
                    title="Delete the selected archive"
                  >
                    {deletingArchive ? 'Deleting...' : '🗑️ Delete Archive'}
                  </button>
                )}
              </div>
            </div>
            {revertStatus && (
              <div className={`upload-status ${revertStatus.type}`}>
                {revertStatus.message}
              </div>
            )}
            {applyArchiveStatus && (
              <div className={`upload-status ${applyArchiveStatus.type}`}>
                {applyArchiveStatus.message}
              </div>
            )}
            {deleteStatus && (
              <div className={`upload-status ${deleteStatus.type}`}>
                {deleteStatus.message}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="upload-divider"></div>

          {/* Upload Section */}
          <div className="upload-section-content">
            {/* <p className="upload-hint">
              <strong>Upload Instructions:</strong> Add <strong>stations.csv</strong> and/or a <strong>ZIP archive</strong> containing YYYY-MM-DD/trains.csv folders. Use the button below to open the upload workspace.
            </p> */}
            <div className="upload-actions">
              <button
                className="btn btn-primary btn-large"
                onClick={() => setUploadModalOpen(true)}
                title="Open the dataset upload workspace"
                disabled={uploading}
              >
                {uploading ? 'Uploading...' : '⬆️ Open Upload Workspace'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {uploadModalOpen && (
        <>
          <div
            className="modal-overlay"
            role="presentation"
            onClick={closeUploadModal}
          ></div>
          <div
            className="modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-modal-title"
          >
            <div className="modal-content upload-modal">
              <div className="modal-header">
                <div className="modal-title-icon">📤</div>
                <div>
                  <h3 className="modal-title" id="upload-modal-title">Dataset Upload</h3>
                  <p className="modal-subtitle">Queue new datasets or replace stations directly from here.</p>
                </div>
              </div>
              <div className="modal-body">
                <p>
                  Upload <strong>stations.csv</strong> and/or a <strong>ZIP archive</strong> with YYYY-MM-DD/trains.csv folders.
                  The backend archives the current dataset automatically before applying the new one.
                </p>
                <div className="modal-warning">
                  Large uploads may take several minutes. Keep this dialog open to monitor status.
                </div>
                <div className="upload-form">
                  <div className="upload-input-group">
                    <label className="upload-input-label">
                      <span className="upload-input-title">🏷️ Dataset name</span>
                      <span className="upload-input-desc">Shown in archive history</span>
                      <input
                        type="text"
                        value={datasetName}
                        onChange={(e) => setDatasetName(e.target.value)}
                        placeholder="e.g., Full dataset 2024-2025"
                        disabled={uploading}
                      />
                    </label>
                  </div>

                  <div className="upload-input-group">
                    <label className="upload-input-label">
                      <span className="upload-input-title">📍 stations.csv</span>
                      <span className="upload-input-desc">Station reference data (optional if already uploaded)</span>
                      <input
                        type="file"
                        accept=".csv"
                        onChange={(e) => setUploadStationsFile(e.target.files?.[0] || null)}
                        disabled={uploading}
                      />
                      {uploadStationsFile && (
                        <div className="upload-input-filename">✓ {uploadStationsFile.name}</div>
                      )}
                    </label>
                  </div>

                  <div className="upload-input-group">
                    <label className="upload-input-label">
                      <span className="upload-input-title">📦 ZIP Archive</span>
                      <span className="upload-input-desc">YYYY-MM-DD/trains.csv folders (optional if only updating stations)</span>
                      <input
                        type="file"
                        accept=".zip"
                        onChange={(e) => setUploadZipFile(e.target.files?.[0] || null)}
                        disabled={uploading}
                      />
                      {uploadZipFile && (
                        <div className="upload-input-filename">✓ {uploadZipFile.name}</div>
                      )}
                    </label>
                  </div>
                </div>

                {uploadStatus && (
                  <div className={`upload-status ${uploadStatus.type}`}>
                    {uploadStatus.message}
                  </div>
                )}

                {uploadStats && Object.keys(uploadStats).length > 0 && (
                  <div className="upload-stats">
                    <div className="stats-title">📊 Upload Summary</div>
                    {uploadStats.stations_uploaded && (
                      <div className="stat-item">
                        <span className="stat-label">Stations file:</span>
                        <span className="stat-value">✓ Uploaded</span>
                      </div>
                    )}
                    {uploadStats.train_dates && uploadStats.train_dates.length > 0 && (
                      <div className="stat-item">
                        <span className="stat-label">Train data dates:</span>
                        <span className="stat-value">{uploadStats.train_dates.length} folders</span>
                      </div>
                    )}
                    {uploadStats.date_range && (
                      <div className="stat-item">
                        <span className="stat-label">Date range:</span>
                        <span className="stat-value">{uploadStats.date_range.start} to {uploadStats.date_range.end}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-secondary"
                  onClick={closeUploadModal}
                  disabled={uploading}
                >
                  Close
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleUpload}
                  disabled={uploading || (!uploadStationsFile && !uploadZipFile)}
                >
                  {uploading ? 'Uploading...' : '⬆️ Upload Dataset'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <section className="filters-section">
        <div className="filters-main-panel">
          {activeFilterCount > 0 && (
            <div className="active-filters-summary">
              <strong>Active Filters:</strong>
              {(startDate || endDate) && (
                <span className="filter-tag">
                  📅 {startDate || '—'} → {endDate || '—'}
                </span>
              )}
              {companies.length > 0 && (
                <span className="filter-tag">
                  🏢 {companies.length} {companies.length === 1 ? 'company' : 'companies'}
                </span>
              )}
              {regions.length > 0 && (
                <span className="filter-tag">
                  🗺️ {regions.length} {regions.length === 1 ? 'region' : 'regions'}
                </span>
              )}
              {selectedStations.length > 0 && (
                <span className="filter-tag">
                  🚉 {selectedStations.length} {selectedStations.length === 1 ? 'station' : 'stations'}
                </span>
              )}
            </div>
          )}

          {/* Date Range */}
          <div className="filters-subsection">
            <h3>📅 Date Range</h3>
            <div className="date-grid">
              <div className="date-input">
                <label>Start date</label>
                <input
                  type="date"
                  value={startDate}
                  min={availableDateRange?.start || undefined}
                  max={endDate || availableDateRange?.end || undefined}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="date-input">
                <label>End date</label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || availableDateRange?.start || undefined}
                  max={availableDateRange?.end || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {dateRangeError && (
              <div className="range-hint" style={{ marginTop: 8 }}>
                ⚠️ {dateRangeError}
              </div>
            )}
          </div>

          {/* Station Search */}
          <div className="filters-subsection">
            <h3>🚉 Station</h3>
            <div className="station-search">
              {/* Selected stations as chips */}
              <div className="selected-stations-chips">
                {selectedStations.map((s) => (
                  <span className="station-chip" key={s.code}>
                    {s.name}
                    {s.regionName ? <span className="station-region"> — {s.regionName}</span> : null}
                    {s.code && <span className="station-code">{s.code}</span>}
                    <button className="remove-chip" onClick={() => removeSelectedStation(s.code)} title="Remove">×</button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="text"
                  placeholder="Type station name (e.g., Milano Centrale)"
                  value={stationQuery}
                  onChange={(e) => {
                    setStationQuery(e.target.value);
                    setDropdownOpen(true);
                  }}
                  autoComplete="off"
                  onFocus={() => setDropdownOpen(true)}
                  onBlur={() => setTimeout(() => {
                    if (!mouseOverSuggestions && !mouseDownOnSuggestions.current) setDropdownOpen(false);
                  }, 150)}
                  style={{ flex: 1 }}
                />
                {stationQuery && (
                  <button
                    className="remove-chip"
                    style={{ fontSize: 18, marginLeft: 0, marginRight: 2, padding: '0 6px' }}
                    onClick={() => setStationQuery('')}
                    title="Clear search"
                    tabIndex={-1}
                  >×</button>
                )}
              </div>
              {(dropdownOpen && (stationLoading || stationSuggestions.length > 0)) && (
                <div
                  className="station-suggestions improved-scroll"
                  onMouseEnter={() => setMouseOverSuggestions(true)}
                  onMouseLeave={() => setMouseOverSuggestions(false)}
                  onMouseDown={() => { mouseDownOnSuggestions.current = true; }}
                  onMouseUp={() => { setTimeout(() => { mouseDownOnSuggestions.current = false; }, 0); }}
                >
                  {stationLoading && (
                    <div className="station-suggestion muted">Searching…</div>
                  )}
                  {!stationLoading && stationSuggestions.length === 0 && (
                    <div className="station-suggestion muted">No matches</div>
                  )}
                  {!stationLoading && stationSuggestions.map((s) => {
                    const isSelected = selectedStations.some(sel => sel.code === s.code);
                    return (
                      <label
                        key={`${s.code || ''}-${s.name}-${s.region || ''}-${s.regionName || ''}`}
                        className={`station-suggestion${isSelected ? ' selected' : ''}`}
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                        onMouseDown={e => e.preventDefault()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            if (isSelected) {
                              removeSelectedStation(s.code);
                            } else {
                              selectStation(s);
                            }
                          }}
                          style={{ marginRight: 8 }}
                          tabIndex={-1}
                        />
                        <span className="station-name"><b>{s.name}</b></span>
                        {s.regionName ? <span className="station-region"> — {s.regionName}</span> : null}
                        {s.code && <span className="station-code">{s.code}</span>}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Station Relation */}
          <div className="filters-subsection">
            <h3>🔁 Station Relation</h3>
            <p className="relation-hint">
              Compare train counts and details between two stations. Select departure and destination to load relation data, then click "Compare Relation" to view results.
            </p>
            <div className="relation-grid">
              <div className="relation-input">
                <label>Departure</label>
                <div className="relation-search">
                  <input
                    type="text"
                    placeholder="Type origin station (e.g., Pisa Centrale)"
                    value={relationFromQuery}
                    onChange={(e) => {
                      setRelationFromQuery(e.target.value);
                      setRelationFromStation(null);
                      setRelationFrom(e.target.value);
                      setRelationFromOpen(true);
                    }}
                    autoComplete="off"
                    onFocus={() => setRelationFromOpen(true)}
                    onBlur={() => setTimeout(() => {
                      if (!relationFromMouseDown.current) setRelationFromOpen(false);
                    }, 150)}
                  />
                  {(relationFromOpen && (relationFromLoading || relationFromSuggestions.length > 0)) && (
                    <div
                      className="station-suggestions improved-scroll"
                      onMouseDown={() => { relationFromMouseDown.current = true; }}
                      onMouseUp={() => { setTimeout(() => { relationFromMouseDown.current = false; }, 0); }}
                    >
                      {relationFromLoading && (
                        <div className="station-suggestion muted">Searching…</div>
                      )}
                      {!relationFromLoading && relationFromSuggestions.length === 0 && (
                        <div className="station-suggestion muted">No matches</div>
                      )}
                      {!relationFromLoading && relationFromSuggestions.map((s) => (
                        <button
                          type="button"
                          key={`${s.code || ''}-${s.name}-${s.region || ''}-${s.regionName || ''}`}
                          className="station-suggestion relation-suggestion"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setRelationFromStation(s);
                            setRelationFromQuery(s.name);
                            setRelationFrom(s.name);
                            setRelationToStation(null);
                            setRelationToQuery('');
                            setRelationTo('');
                            setRelationFromOpen(false);
                          }}
                        >
                          <span className="station-name"><b>{s.name}</b></span>
                          {s.regionName ? <span className="station-region"> — {s.regionName}</span> : null}
                          {s.code && <span className="station-code">{s.code}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="relation-input">
                <label>Destination</label>
                <div className="relation-search">
                  <input
                    type="text"
                    placeholder="Type destination station (e.g., Roma Termini)"
                    value={relationToQuery}
                    onChange={(e) => {
                      setRelationToQuery(e.target.value);
                      setRelationToStation(null);
                      setRelationTo(e.target.value);
                      setRelationToOpen(true);
                    }}
                    autoComplete="off"
                    onFocus={() => setRelationToOpen(true)}
                    onBlur={() => setTimeout(() => {
                      if (!relationToMouseDown.current) setRelationToOpen(false);
                    }, 150)}
                  />
                  {(relationToOpen && (relationToLoading || relationToSuggestions.length > 0)) && (
                    <div
                      className="station-suggestions improved-scroll"
                      onMouseDown={() => { relationToMouseDown.current = true; }}
                      onMouseUp={() => { setTimeout(() => { relationToMouseDown.current = false; }, 0); }}
                    >
                      {relationToLoading && (
                        <div className="station-suggestion muted">Searching…</div>
                      )}
                      {!relationToLoading && relationToSuggestions.length === 0 && (
                        <div className="station-suggestion muted">No matches</div>
                      )}
                      {!relationToLoading && relationToSuggestions.map((s) => (
                        <button
                          type="button"
                          key={`${s.code || ''}-${s.name}-${s.region || ''}-${s.regionName || ''}`}
                          className="station-suggestion relation-suggestion"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setRelationToStation(s);
                            setRelationToQuery(s.name);
                            setRelationTo(s.name);
                            setRelationToOpen(false);
                          }}
                        >
                          <span className="station-name"><b>{s.name}</b></span>
                          {s.regionName ? <span className="station-region"> — {s.regionName}</span> : null}
                          {s.code && <span className="station-code">{s.code}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="relation-actions">
              <button
                className="btn btn-primary relation-cta"
                type="button"
                disabled={!relationFromStation || !relationToStation}
                onClick={() => setRelationModalOpen(true)}
              >
                Compare Relation
              </button>
            </div>
          </div>

          {/* Companies */}
          <div className="filters-subsection">
            <h3>🏢 Companies</h3>
            <div className="chip-grid">
              {availableCompanies.map((c) => (
                <button
                  key={c.code}
                  onClick={() => toggleCompany(c.code)}
                  className={`chip ${
                    c.code === 'ALL' ? (companies.length === 0 ? 'selected' : '') : companies.includes(c.code) ? 'selected' : ''
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Regions */}
          <div className="filters-subsection">
            <h3>🗺️ Regions</h3>
            <div className="chip-grid">
              {availableRegions.map((r) => (
                <button
                  key={r}
                  onClick={() => toggleRegion(r)}
                  className={`chip ${regions.includes(r) ? 'selected' : ''}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="filters-actions actions">
            <button className="btn btn-secondary" onClick={clearFilters} disabled={activeFilterCount === 0}>Clear All</button>
            <button className="btn btn-primary" onClick={applyFilters} disabled={Boolean(dateRangeError)}>
              Apply Filters
            </button>
          </div>
        </div>
      </section>

      {/* Delete Archive Confirmation Modal */}
      {showDeleteConfirm && (
        <>
          <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}></div>
          <div className="modal-dialog clear-confirm-modal">
            <div className="modal-content">
              <div className="modal-header">
                <div className="modal-title-icon">⚠️</div>
                <h2 className="modal-title">Delete Archive?</h2>
              </div>
              
              <div className="modal-body">
                <p>This will <strong>permanently delete</strong> the selected archive.</p>
                <p className="modal-warning">This action <strong>cannot be undone</strong>.</p>
                {selectedArchive && (
                  <div className="modal-archive-info">
                    <strong>Archive:</strong> {selectedArchive}
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deletingArchive}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-danger"
                  onClick={confirmDeleteArchive}
                  disabled={deletingArchive}
                >
                  {deletingArchive ? 'Deleting...' : 'Delete Archive'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {relationModalOpen && (
        <>
          <div
            className="modal-overlay"
            role="presentation"
            onClick={closeRelationModal}
          ></div>
          <div
            className={`modal-dialog relation-modal${relationResults.length > 0 && !relationLoading ? ' is-loaded' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="relation-modal-title"
          >
            <div className="modal-content">
              <div className="modal-header">
                <div className="modal-title-icon">🔁</div>
                <div>
                  <h3 className="modal-title" id="relation-modal-title">Station Relation</h3>
                  <p className="modal-subtitle">Compare departures between selected stations.</p>
                </div>
              </div>
              <div className="modal-body">
                <div className="relation-modal-summary">
                  <div className="relation-modal-row">
                    <span className="relation-modal-label">Departure</span>
                    <span className="relation-modal-value">
                      {relationFromStation?.name || relationFrom || '—'}
                      {relationFromStation?.code ? ` (${relationFromStation.code})` : ''}
                    </span>
                  </div>
                  <div className="relation-modal-row">
                    <span className="relation-modal-label">Destination</span>
                    <span className="relation-modal-value">
                      {relationToStation?.name || relationTo || '—'}
                      {relationToStation?.code ? ` (${relationToStation.code})` : ''}
                    </span>
                  </div>
                </div>
                <div className="relation-modal-body">
                  <div className="relation-modal-layout">
                    <div className="relation-modal-list">
                      {relationLoading ? (
                        <div className="relation-modal-note">Loading relation data…</div>
                      ) : relationError ? (
                        <div className="relation-modal-note relation-modal-error">{relationError}</div>
                      ) : relationResults.length === 0 ? (
                        <div className="relation-modal-note">No relation data available yet.</div>
                      ) : (
                        <div className="relation-table-wrap">
                          <div className="relation-table-hint">Click a row to load train details.</div>
                          <table className="relation-table">
                            <thead>
                              <tr>
                                <th>Category</th>
                                <th>Train</th>
                                <th>Departure</th>
                                <th>Dep. Time</th>
                                <th>Dep. Delay</th>
                                <th>Destination</th>
                                <th>Arr. Time</th>
                                <th>Arr. Delay</th>
                                <th>Track</th>
                                <th>Last Seen</th>
                              </tr>
                            </thead>
                            <tbody>
                              {relationResults.map((row, idx) => (
                                <tr
                                  key={`${row.train_number || 'train'}-${idx}`}
                                  className={selectedRelationIndex === idx ? 'is-selected' : ''}
                                  onClick={() => fetchRelationTrainDetail(row, idx)}
                                >
                                  <td>{row.category || '—'}</td>
                                  <td>{row.train_number || '—'}</td>
                                  <td>{row.origin || '—'}</td>
                                  <td>{row.origin_time || '—'}</td>
                                  <td>{row.origin_delay || '—'}</td>
                                  <td>{row.destination || '—'}</td>
                                  <td>{row.destination_time || '—'}</td>
                                  <td>{row.destination_delay || '—'}</td>
                                  <td>{row.track || '—'}</td>
                                  <td>{row.date || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-secondary"
                  onClick={closeRelationModal}
                >
                  Close
                </button>
                <button
                  className="btn btn-primary"
                  disabled={!relationFromStation || !relationToStation || relationLoading}
                  onClick={fetchRelationData}
                >
                  {relationLoading ? 'Loading…' : 'Run Comparison'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {relationDetailModalOpen && (
        <>
          <div
            className="modal-overlay"
            role="presentation"
            onClick={closeRelationDetailModal}
          ></div>
          <div
            className="modal-dialog relation-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="relation-detail-modal-title"
          >
            <div className="modal-content">
              <div className="modal-header">
                <div className="modal-title-icon">🚆</div>
                <div>
                  <h3 className="modal-title" id="relation-detail-modal-title">Train Detail</h3>
                  <p className="modal-subtitle">Detailed performance for the selected train.</p>
                </div>
              </div>
              <div className="modal-body">
                <div className="relation-detail-card">
                  <div className="detail-card-title">Selected train</div>
                  {selectedRelationRow ? (
                    <div className="detail-summary">
                      <div>
                        <span className="detail-summary-label">Train</span>
                        <span className="detail-summary-value">{selectedRelationRow.train_number || '—'}</span>
                      </div>
                      <div>
                        <span className="detail-summary-label">Route</span>
                        <span className="detail-summary-value">
                          {selectedRelationRow.origin || '—'} → {selectedRelationRow.destination || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="detail-summary-label">Times</span>
                        <span className="detail-summary-value">
                          {selectedRelationRow.origin_time || '—'} → {selectedRelationRow.destination_time || '—'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="relation-detail-empty">No train selected.</div>
                  )}
                </div>

                {selectedRelationRow && (
                  <a
                    className="relation-detail-link"
                    href={`https://trainstats.altervista.org/cercatreno.php?ref=cr&treno=${encodeURIComponent(selectedRelationRow.train_number || '')}&stazpart=${encodeURIComponent(selectedRelationRow.origin || '')}&stazarr=${encodeURIComponent(selectedRelationRow.destination || '')}&op=${encodeURIComponent(selectedRelationRow.origin_time || '')}&oa=${encodeURIComponent(selectedRelationRow.destination_time || '')}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {/* add divider  */}
                    <div className="relation-detail-link-divider">
                      
                    </div>
                    {/* Open on TrainStats ↗ */}
                  </a>
                )}

                {selectedRelationRow && relationDetailLoading && (
                  <div className="relation-detail-note">Loading train detail…</div>
                )}
                {selectedRelationRow && relationDetailError && (
                  <div className="relation-detail-note relation-modal-error">{relationDetailError}</div>
                )}
                {selectedRelationRow && !relationDetailLoading && !relationDetailError && relationDetail && (
                  <div className="relation-detail-grid">
                    <div className="detail-chart-grid">
                      {renderDonutChart('Regularity', [
                        {
                          label: 'Regolari',
                          value: getStatValue(relationDetail.regularity, ['regolari']),
                          color: '#38bdf8',
                        },
                        {
                          label: 'Riprogrammati',
                          value: getStatValue(relationDetail.regularity, ['riprogrammati']),
                          color: '#fbbf24',
                        },
                        {
                          label: 'Cancellati',
                          value: getStatValue(relationDetail.regularity, ['cancellati']),
                          color: '#f87171',
                        },
                      ], getStatValue(relationDetail.regularity, ['totali', 'totale']))}

                      {renderDonutChart('Departure punctuality', [
                        {
                          label: 'In orario',
                          value: getStatValue(relationDetail.punctuality_departure, ['in orario']),
                          color: '#38bdf8',
                        },
                        {
                          label: 'In ritardo',
                          value: getStatValue(relationDetail.punctuality_departure, ['in ritardo']),
                          color: '#f87171',
                        },
                      ])}

                      {renderDonutChart('Arrival punctuality', [
                        {
                          label: 'In anticipo',
                          value: getStatValue(relationDetail.punctuality_arrival, ['in anticipo']),
                          color: '#34d399',
                        },
                        {
                          label: 'In orario',
                          value: getStatValue(relationDetail.punctuality_arrival, ['in orario']),
                          color: '#38bdf8',
                        },
                        {
                          label: 'In ritardo',
                          value: getStatValue(relationDetail.punctuality_arrival, ['in ritardo']),
                          color: '#f87171',
                        },
                      ])}
                    </div>

                    {relationDetail.average_delay_by_day?.length > 0 && (
                      <div className="relation-detail-card detail-table-card">
                        <div className="detail-card-title">Average delay by day</div>
                        <div className="detail-table-wrap">
                          <table className="detail-table">
                            <thead>
                              <tr>
                                <th>Day</th>
                                <th>Departure</th>
                                <th>Arrival</th>
                              </tr>
                            </thead>
                            <tbody>
                              {relationDetail.average_delay_by_day.map((row, idx) => (
                                <tr key={`${row.day}-${idx}`}>
                                  <td>{mapWeekdayToEnglish(row.day) || '—'}</td>
                                  <td>{row.departure || '—'}</td>
                                  <td>{row.arrival || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {relationDetail.daily_records?.length > 0 && (
                      <div className="relation-detail-card detail-table-card detail-table-wide">
                        <div className="detail-card-title">Daily data</div>
                        <div className="detail-table-wrap">
                          <table className="detail-table">
                            <thead>
                              <tr>
                                <th>Day</th>
                                <th>Date</th>
                                <th>Departure</th>
                                <th>Dep. Time</th>
                                <th>Dep. Delay</th>
                                <th>Arrival</th>
                                <th>Arr. Time</th>
                                <th>Arr. Delay</th>
                                <th>Actions</th>
                                <th>Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {relationDetail.daily_records.map((row, idx) => (
                                <tr key={`${row.date}-${idx}`}>
                                  <td>{mapWeekdayToEnglish(row.day) || '—'}</td>
                                  <td>{row.date || '—'}</td>
                                  <td>{row.origin || '—'}</td>
                                  <td>{row.origin_time || '—'}</td>
                                  <td>{row.origin_delay || '—'}</td>
                                  <td>{row.destination || '—'}</td>
                                  <td>{row.destination_time || '—'}</td>
                                  <td>{row.destination_delay || '—'}</td>
                                  <td>{row.actions || '—'}</td>
                                  <td>{row.notes || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    closeRelationDetailModal();
                    setRelationModalOpen(true);
                  }}
                >
                  Back to results
                </button>
                <button
                  className="btn btn-primary"
                  onClick={closeRelationDetailModal}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Filters;

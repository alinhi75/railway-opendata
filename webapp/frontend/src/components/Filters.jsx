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
 * - initialFilters: optional initial filter values
 */
const Filters = ({ onChange, initialFilters = {} }) => {
  const [companies, setCompanies] = useState(initialFilters.companies || []);
  const [regions, setRegions] = useState(initialFilters.regions || []);
  const [stationQuery, setStationQuery] = useState(initialFilters.stationQuery || '');
  const [selectedStations, setSelectedStations] = useState([]); // Array of {code, name, region, regionName}

  const [availableCompanies, setAvailableCompanies] = useState([]);
  const [availableRegions, setAvailableRegions] = useState([]);
  const [availableDateRange, setAvailableDateRange] = useState(null);
  const [stationSuggestions, setStationSuggestions] = useState([]);
  const [stationLoading, setStationLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mouseOverSuggestions, setMouseOverSuggestions] = useState(false); // Track if mouse is over suggestions to prevent closing on blur
  const mouseDownOnSuggestions = useRef(false); // Track if mouse is down on suggestions to prevent closing on blur

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
    // Combine all active filters
    const filters = {
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
    setStationQuery('');
    setSelectedStations([]);
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

  // Count active filters for display
  const activeFilterCount = [
    companies.length > 0,
    regions.length > 0,
    selectedStations.length > 0 || stationQuery,
  ].filter(Boolean).length;

  return (
    <div className="filters">
      <div className="filters-header">
        <h2>Filters {activeFilterCount > 0 && <span className="filter-badge">{activeFilterCount}</span>}</h2>
        <div className="actions">
          <button className="btn btn-secondary" onClick={clearFilters} disabled={activeFilterCount === 0}>Clear All</button>
          <button className="btn btn-primary" onClick={applyFilters}>Apply Filters</button>
        </div>
      </div>

      {/* Available Date Range */}
      {availableDateRange && (
        <div className="range-banner">
          <div className="range-text">
            📅 Data available: <strong>{availableDateRange.start}</strong> → <strong>{availableDateRange.end}</strong>
          </div>
        </div>
      )}
      
      {/* Active Filters Summary */}
      {activeFilterCount > 0 && (
        <div className="active-filters-summary">
          <strong>Active Filters:</strong>
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

      {/* Station Search */}
      <section className="filters-section">
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
      </section>

      {/* Companies */}
      <section className="filters-section">
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
      </section>

      {/* Regions */}
      <section className="filters-section">
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
      </section>
    </div>
  );
};

export default Filters;

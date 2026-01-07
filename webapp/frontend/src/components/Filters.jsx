import React, { useEffect, useMemo, useState, useRef } from 'react';
import { apiService } from '../services/api';
import './Filters.css';

/**
 * Filters Component
 * US-7: Date range picker
 * US-8: Company selector
 * US-9: Region/Station search
 *
 * Props:
 * - onChange(filters): callback invoked when filters change
 * - initialFilters: optional initial filter values
 */
const Filters = ({ onChange, initialFilters = {} }) => {
  const [startDate, setStartDate] = useState(initialFilters.startDate || '');
  const [endDate, setEndDate] = useState(initialFilters.endDate || '');
  const [companies, setCompanies] = useState(initialFilters.companies || []);
  const [regions, setRegions] = useState(initialFilters.regions || []);
  const [stationQuery, setStationQuery] = useState(initialFilters.stationQuery || '');
  const [selectedStations, setSelectedStations] = useState([]); // Array of {code, name, region, regionName}

  const [availableCompanies, setAvailableCompanies] = useState([]);
  const [availableRegions, setAvailableRegions] = useState([]);
  const [stationSuggestions, setStationSuggestions] = useState([]);
  const [stationLoading, setStationLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mouseOverSuggestions, setMouseOverSuggestions] = useState(false); // Track if mouse is over suggestions to prevent closing on blur
  const mouseDownOnSuggestions = useRef(false); // Track if mouse is down on suggestions to prevent closing on blur

  // Presets for quick selection
  const presets = useMemo(() => ([
    { label: 'Last 7 days', range: { start: offsetDays(7), end: today() } },
    { label: 'Last 30 days', range: { start: offsetDays(30), end: today() } },
    { label: 'Last 90 days', range: { start: offsetDays(90), end: today() } },
  ]), []);

  useEffect(() => {
    // Load available companies and regions
    const fetchFiltersMeta = async () => {
      try {
        const [companiesRes, regionsRes] = await Promise.all([
          apiService.getCompanies(),
          apiService.getRegions(),
        ]);
        setAvailableCompanies(companiesRes.data);
        setAvailableRegions(regionsRes.data);
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
    // Do not clear the search query after selection
    onChange?.({
      startDate: startDate || null,
      endDate: endDate || null,
      companies,
      regions,
      stationQuery: null,
      stationCodes: [...selectedStations.map(st => st.code), s.code],
    });
  };

  const removeSelectedStation = (code) => {
    setSelectedStations((prev) => prev.filter((s) => s.code !== code));
    const newSelected = selectedStations.filter((s) => s.code !== code);
    onChange?.({
      startDate: startDate || null,
      endDate: endDate || null,
      companies,
      regions,
      stationQuery: null,
      stationCodes: newSelected.map(st => st.code),
    });
  };

  const applyFilters = () => {
    const filters = {
      startDate: startDate || null,
      endDate: endDate || null,
      companies,
      regions,
      stationQuery: stationQuery || null,
      stationCodes: selectedStations.map((s) => s.code).filter(Boolean),
    };
    onChange?.(filters);
  };

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setCompanies([]);
    setRegions([]);
    setStationQuery('');
    setSelectedStations([]);
    onChange?.({});
  };

  const setPreset = (range) => {
    setStartDate(range.start);
    setEndDate(range.end);
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

  return (
    <div className="filters">
      <div className="filters-header">
        <h2>Filters</h2>
        <div className="actions">
          <button className="btn btn-secondary" onClick={clearFilters}>Clear</button>
          <button className="btn btn-primary" onClick={applyFilters}>Apply</button>
        </div>
      </div>

      {/* Date Range */}
      <section className="filters-section">
        <h3>📅 Date Range</h3>
        <div className="date-grid">
          <div className="date-input">
            <label>Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="date-input">
            <label>End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className="preset-grid">
          {presets.map((p) => (
            <button key={p.label} className="btn btn-preset" onClick={() => setPreset(p.range)}>
              {p.label}
            </button>
          ))}
        </div>
      </section>

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

// Helpers
function today() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function offsetDays(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default Filters;

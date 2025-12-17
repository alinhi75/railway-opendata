import React, { useEffect, useMemo, useState } from 'react';
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

  const [availableCompanies, setAvailableCompanies] = useState([]);
  const [availableRegions, setAvailableRegions] = useState([]);
  const [stationSuggestions, setStationSuggestions] = useState([]);
  const [stationLoading, setStationLoading] = useState(false);

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
        // For region-name searches (e.g. "Lombardia"), show all matches.
        // Otherwise keep a small cap for typeahead performance.
        const res = await apiService.getStations({ q, limit: isExactRegion ? 0 : 10 });
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
    setStationQuery(s.name);
    setStationSuggestions([]);
  };

  const applyFilters = () => {
    const filters = {
      startDate: startDate || null,
      endDate: endDate || null,
      companies,
      regions,
      stationQuery: stationQuery || null,
    };
    onChange?.(filters);
  };

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setCompanies([]);
    setRegions([]);
    setStationQuery('');
    onChange?.({});
  };

  const setPreset = (range) => {
    setStartDate(range.start);
    setEndDate(range.end);
  };

  const toggleCompany = (code) => {
    setCompanies((prev) => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
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

      {/* Companies */}
      <section className="filters-section">
        <h3>🏢 Companies</h3>
        <div className="chip-grid">
          {availableCompanies.map((c) => (
            <button
              key={c.code}
              onClick={() => toggleCompany(c.code)}
              className={`chip ${companies.includes(c.code) ? 'selected' : ''}`}
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

      {/* Station Search */}
      <section className="filters-section">
        <h3>🚉 Station</h3>
        <div className="station-search">
          <input
            type="text"
            placeholder="Type station name (e.g., Milano Centrale)"
            value={stationQuery}
            onChange={(e) => setStationQuery(e.target.value)}
          />

          {(stationLoading || stationSuggestions.length > 0) && (
            <div className="station-suggestions">
              {stationLoading && (
                <div className="station-suggestion muted">Searching…</div>
              )}
              {!stationLoading && stationSuggestions.length === 0 && (
                <div className="station-suggestion muted">No matches</div>
              )}
              {!stationLoading && stationSuggestions.map((s) => (
                <button
                  type="button"
                  key={`${s.code || ''}-${s.name}-${s.region || ''}-${s.regionName || ''}`}
                  className="station-suggestion"
                  onClick={() => selectStation(s)}
                >
                  <span className="station-name">
                    {s.name}
                    {s.regionName ? <span className="station-region"> — {s.regionName}</span> : null}
                  </span>
                  {s.code && <span className="station-code">{s.code}</span>}
                </button>
              ))}
            </div>
          )}
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

import React from 'react';
import './StationDetailsCard.css';

function _toNumber(value) {
  if (typeof value === 'number') return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function _formatInt(value) {
  const n = _toNumber(value);
  return Number.isFinite(n) ? String(Math.round(n)) : '0';
}

function _safeArray(arr) {
  return Array.isArray(arr) ? arr : [];
}

function MultiSegmentDonut({ segments, total, size = 160, stroke = 22, centerLabel }) {
  const t = Math.max(0, _toNumber(total));
  const s = Math.max(0, _toNumber(size));
  const sw = Math.max(1, _toNumber(stroke));
  const r = (s - sw) / 2;
  const c = 2 * Math.PI * r;

  let offset = 0;

  return (
    <div className="station-donut" role="img" aria-label="Traffic type donut chart">
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} className="station-donut__svg">
        <g transform={`rotate(-90 ${s / 2} ${s / 2})`}>
          <circle
            cx={s / 2}
            cy={s / 2}
            r={r}
            fill="none"
            stroke="var(--donut-track)"
            strokeWidth={sw}
          />
          {_safeArray(segments)
            .filter((seg) => _toNumber(seg?.value) > 0)
            .map((seg) => {
              const v = Math.max(0, _toNumber(seg.value));
              const segLen = t > 0 ? (c * v) / t : 0;
              const dasharray = `${segLen} ${Math.max(0, c - segLen)}`;
              const dashoffset = -offset;
              offset += segLen;

              return (
                <circle
                  key={seg.label}
                  cx={s / 2}
                  cy={s / 2}
                  r={r}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={sw}
                  strokeLinecap="butt"
                  strokeDasharray={dasharray}
                  strokeDashoffset={dashoffset}
                />
              );
            })}
        </g>
        {centerLabel && (
          <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="station-donut__center">
            {centerLabel}
          </text>
        )}
      </svg>
    </div>
  );
}

function _sumValues(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  return Object.values(obj).reduce((acc, item) => acc + _toNumber(item?.value), 0);
}

function _pctLabel(numerator, denominator) {
  const d = Math.max(0, _toNumber(denominator));
  const n = Math.max(0, _toNumber(numerator));
  if (d <= 0) return '0%';
  return `${Math.round((n / d) * 100)}%`;
}

function DonutWithLegend({ title, segments, total, centerLabel }) {
  const t = Math.max(0, _toNumber(total));
  const visibleSegments = _safeArray(segments).filter((s) => _toNumber(s?.value) > 0);
  if (!t || visibleSegments.length === 0) return null;

  return (
    <div className="station-chart">
      <div className="station-chart__header">
        <div className="station-chart__title">{title}</div>
      </div>

      <div className="station-chart__body station-chart__body--donut">
        <MultiSegmentDonut segments={visibleSegments} total={t} centerLabel={centerLabel} />

        <div className="station-chart__meta">
          <div className="station-chart__legend" aria-label={`${title} legend`}>
            {visibleSegments.map((seg) => (
              <div key={seg.label} className="station-legend__item">
                <span className="station-legend__swatch" style={{ background: seg.color }} />
                <span className="station-legend__label">{seg.label}</span>
                <span className="station-legend__value">{_formatInt(seg.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TrafficTypeChart({ trafficType }) {
  const arrivals = _toNumber(trafficType?.Arrivi?.value);
  const transits = _toNumber(trafficType?.Transiti?.value);
  const departures = _toNumber(trafficType?.Partenze?.value);
  const total = arrivals + transits + departures;

  if (!total) return null;

  const segments = [
    { label: 'Arrivi', value: arrivals, color: 'var(--station-chart-1)' },
    { label: 'Transiti', value: transits, color: 'var(--station-chart-2)' },
    { label: 'Partenze', value: departures, color: 'var(--station-chart-3)' },
  ];

  return (
    <div className="station-chart">
      <div className="station-chart__header">
        <div className="station-chart__title">Traffic type</div>
      </div>

      <div className="station-chart__body station-chart__body--donut">
        <MultiSegmentDonut
          segments={segments}
          total={total}
          centerLabel={_formatInt(total)}
        />

        <div className="station-chart__meta">
          <div className="station-chart__legend" aria-label="Traffic type legend">
            {segments.map((seg) => (
              <div key={seg.label} className="station-legend__item">
                <span className="station-legend__swatch" style={{ background: seg.color }} />
                <span className="station-legend__label">{seg.label}</span>
                <span className="station-legend__value">{_formatInt(seg.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PunctualityDepartureChart({ punctuality }) {
  const total = _sumValues(punctuality);
  const onTime = _toNumber(punctuality?.['In orario']?.value);
  const segments = [
    { label: 'In orario', value: onTime, color: 'var(--station-chart-1)' },
    { label: 'In ritardo', value: _toNumber(punctuality?.['In ritardo']?.value), color: 'var(--station-chart-2)' },
    { label: 'Non rilevati', value: _toNumber(punctuality?.['Non rilevati']?.value), color: 'var(--station-chart-3)' },
  ];

  return (
    <DonutWithLegend
      title="Punctuality on departure"
      segments={segments}
      total={total}
      centerLabel={_pctLabel(onTime, total)}
    />
  );
}

function PunctualityArrivalChart({ punctuality }) {
  const total = _sumValues(punctuality);
  const early = _toNumber(punctuality?.['In anticipo']?.value);
  const onTime = _toNumber(punctuality?.['In orario']?.value);
  const regular = early + onTime;

  const segments = [
    { label: 'In anticipo', value: early, color: 'var(--station-chart-4)' },
    { label: 'In orario', value: onTime, color: 'var(--station-chart-1)' },
    { label: 'In ritardo', value: _toNumber(punctuality?.['In ritardo']?.value), color: 'var(--station-chart-2)' },
    { label: 'Non rilevati', value: _toNumber(punctuality?.['Non rilevati']?.value), color: 'var(--station-chart-3)' },
  ];

  return (
    <DonutWithLegend
      title="Punctuality on the way"
      segments={segments}
      total={total}
      centerLabel={_pctLabel(regular, total)}
    />
  );
}

function CategoriesChart({ categories }) {
  const total = _sumValues(categories);
  if (!total) return null;

  const colorByLabel = {
    Regionali: 'var(--station-chart-1)',
    InterCity: 'var(--station-chart-2)',
    Frecce: 'var(--station-chart-4)',
    EuroCity: 'var(--station-chart-3)',
    EuroNotte: 'var(--station-chart-3)',
  };

  const segments = Object.entries(categories || {})
    .map(([label, item]) => ({
      label,
      value: _toNumber(item?.value),
      color: colorByLabel[label] || 'var(--station-chart-3)',
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  return <DonutWithLegend title="Categories" segments={segments} total={total} centerLabel={_formatInt(total)} />;
}

function DistributionBarChart({ title, distribution, series }) {
  const times = _safeArray(distribution?.times);
  const n = times.length;
  if (!n) return null;

  const normalizedSeries = _safeArray(series)
    .map((s) => ({
      key: s.key,
      label: s.label,
      color: s.color,
      values: _safeArray(distribution?.[s.key]).map(_toNumber),
    }))
    .filter((s) => s.values.length === n);

  if (normalizedSeries.length === 0) return null;

  const allVals = normalizedSeries.flatMap((s) => s.values);
  const maxVal = Math.max(0, ...allVals);
  if (maxVal <= 0) return null;

  const width = 720;
  const height = 240;
  const margin = { top: 14, right: 16, bottom: 48, left: 36 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const groupCount = normalizedSeries.length;
  const groupW = innerW / n;
  const barGap = Math.max(1, Math.floor(groupW * 0.18));
  const barW = Math.max(2, Math.floor((groupW - barGap) / groupCount));

  const labelStep = Math.max(1, Math.ceil(n / 8));

  const yFor = (v) => margin.top + (innerH - (v / maxVal) * innerH);
  const hFor = (v) => (v / maxVal) * innerH;

  return (
    <div className="station-chart">
      <div className="station-chart__header">
        <div className="station-chart__title">{title}</div>
        <div className="station-chart__legend" aria-label="Chart legend">
          {normalizedSeries.map((s) => (
            <div key={s.key} className="station-legend__pill">
              <span className="station-legend__swatch" style={{ background: s.color }} />
              <span className="station-legend__label">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="station-chart__body">
        <svg
          className="station-bars__svg"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={title}
        >
          <line
            x1={margin.left}
            x2={width - margin.right}
            y1={margin.top + innerH}
            y2={margin.top + innerH}
            stroke="var(--chart-axis)"
            strokeWidth="1"
          />

          {times.map((t, i) => {
            const x0 = margin.left + i * groupW;
            return normalizedSeries.map((s, si) => {
              const v = Math.max(0, _toNumber(s.values[i]));
              const x = x0 + si * barW;
              const y = yFor(v);
              const h = hFor(v);
              const label = `${t}: ${s.label} ${_formatInt(v)}`;
              return (
                <rect
                  key={`${s.key}-${i}`}
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  fill={s.color}
                  rx="2"
                >
                  <title>{label}</title>
                </rect>
              );
            });
          })}

          {times.map((t, i) => {
            if (i % labelStep !== 0) return null;
            const x = margin.left + i * groupW + groupW / 2;
            return (
              <text
                key={`x-${i}`}
                x={x}
                y={height - 18}
                textAnchor="middle"
                className="station-bars__xlabel"
              >
                {t}
              </text>
            );
          })}

          <text
            x={margin.left}
            y={margin.top + 10}
            textAnchor="start"
            className="station-bars__ylabel"
          >
            {maxVal}
          </text>
          <text
            x={margin.left}
            y={margin.top + innerH}
            dy="-6"
            textAnchor="start"
            className="station-bars__ylabel"
          >
            0
          </text>
        </svg>
      </div>
    </div>
  );
}

function MiniDonut({ value, total, label, sublabel }) {
  const v = Math.max(0, _toNumber(value));
  const t = Math.max(0, _toNumber(total));
  const pct = t > 0 ? Math.max(0, Math.min(1, v / t)) : 0;

  const size = 84;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * pct;

  return (
    <div className="mini-donut" role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--donut-track)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--donut-value)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
          />
        </g>
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="mini-donut__pct"
        >
          {Math.round(pct * 100)}%
        </text>
      </svg>

      <div className="mini-donut__meta">
        <div className="mini-donut__label">{label}</div>
        {sublabel && <div className="mini-donut__sublabel">{sublabel}</div>}
      </div>
    </div>
  );
}

/**
 * Station Details Card Component
 * Displays detailed information about a selected station
 */
const StationDetailsCard = ({ station, stationStats, onClose }) => {
  if (!station) return null;

  const {
    code = 'N/A',
    name = 'Unknown Station',
    long_name,
    short_name,
    region_name,
    region,
    geometry = {},
  } = station.properties || station;

  const coords = geometry.coordinates || [];
  const displayName = long_name || name;
  const regionText = region_name || region || stationStats?.location?.region || 'Unknown Region';

  // Check for location data in stationStats (from external API) or geometry
  const rawLatitude = coords.length >= 2 ? coords[1] : stationStats?.location?.latitude;
  const rawLongitude = coords.length >= 2 ? coords[0] : stationStats?.location?.longitude;
  const latitude = typeof rawLatitude === 'number' ? rawLatitude : Number(rawLatitude);
  const longitude = typeof rawLongitude === 'number' ? rawLongitude : Number(rawLongitude);
  const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude);
  const stationCode = code !== 'N/A' ? code : stationStats?.location?.code;
  const regionCode = stationStats?.location?.region_code;

  const madeStops = _toNumber(stationStats?.stops?.['Effettuate']?.value ?? stationStats?.stops?.['Totali']?.value);
  const suppressedStops = _toNumber(stationStats?.stops?.['Soppresse']?.value);
  const totalStops = Math.max(0, madeStops + suppressedStops);

  const punctuality = stationStats?.punctuality_departure || {};
  const onTime = _toNumber(punctuality?.['In orario']?.value);
  const punctualityTotal = Object.values(punctuality).reduce((acc, item) => acc + _toNumber(item?.value), 0);

  const punctualityArrival = stationStats?.punctuality_arrival || {};
  const categories = stationStats?.categories || {};

  const trafficType = stationStats?.traffic_type;
  const arrivalsDist = stationStats?.distribution_arrivals;
  const hasArrivalsDist = Array.isArray(arrivalsDist?.times) && arrivalsDist.times.length > 0;

  return (
    <div className="station-details-card">
      <div className="station-details-header">
        <div className="station-details-icon">🚉</div>
        <div className="station-details-info">
          <div className="station-details-title-row">
            <h1 className="station-details-title">{displayName}</h1>
            <span className="station-details-code">{code}</span>
          </div>
          {short_name && <p className="station-details-subtitle">{short_name}</p>}
          <p className="station-details-region">
            <span className="region-badge">{regionText}</span>
          </p>
        </div>

        {typeof onClose === 'function' && (
          <button
            className="station-details-close"
            type="button"
            onClick={onClose}
            aria-label="Clear station selection"
            title="Clear selection"
          >
            ×
          </button>
        )}
      </div>

      <div className="station-details-grid">
        {/* Location Information Section */}
        {hasLocation && (
          <>
            <div className="details-item">
              <div className="details-icon">📍</div>
              <div className="details-content">
                <div className="details-label">Coordinates</div>
                <div className="details-value">
                  {latitude.toFixed(6)}°N, {longitude.toFixed(6)}°E
                </div>
              </div>
            </div>

            <div className="details-item">
              <div className="details-icon">🗺️</div>
              <div className="details-content">
                <div className="details-label">Region</div>
                <div className="details-value">
                  {regionText}
                  {regionCode && <span className="details-unit"> (Code: {regionCode})</span>}
                </div>
              </div>
            </div>

            {stationCode && stationCode !== 'N/A' && (
              <div className="details-item">
                <div className="details-icon">🏷️</div>
                <div className="details-content">
                  <div className="details-label">Station Code</div>
                  <div className="details-value">{stationCode}</div>
                </div>
              </div>
            )}
          </>
        )}
        
        {!hasLocation && (
          <div className="details-item">
            <div className="details-icon">📍</div>
            <div className="details-content">
              <div className="details-label">Location</div>
              <div className="details-value">Not available</div>
            </div>
          </div>
        )}

        {stationStats?.stops && Object.keys(stationStats.stops).length > 0 && (
          <>
            <div className="details-item">
              <div className="details-icon">🚂</div>
              <div className="details-content">
                <div className="details-label">Total Stops</div>
                <div className="details-value">
                  {stationStats.stops['Totali']?.value || stationStats.stops['Effettuate']?.value || 0}
                </div>
              </div>
            </div>

            {stationStats.stops['Soppresse'] && (
              <div className="details-item">
                <div className="details-icon">⚠️</div>
                <div className="details-content">
                  <div className="details-label">Cancelled Stops</div>
                  <div className="details-value">
                    {stationStats.stops['Soppresse'].value}
                    <span className="details-unit">({stationStats.stops['Soppresse'].percentage})</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {stationStats?.punctuality_departure && Object.keys(stationStats.punctuality_departure).length > 0 && (
          <div className="details-item">
            <div className="details-icon">⏱️</div>
            <div className="details-content">
              <div className="details-label">On-Time Departures</div>
              <div className="details-value">
                {stationStats.punctuality_departure['In orario']?.value || 0}
                <span className="details-unit">({stationStats.punctuality_departure['In orario']?.percentage || '0%'})</span>
              </div>
            </div>
          </div>
        )}

        {stationStats?.categories && Object.keys(stationStats.categories).length > 0 && (
          <div className="details-item">
            <div className="details-icon">🚆</div>
            <div className="details-content">
              <div className="details-label">Primary Train Type</div>
              <div className="details-value">
                {Object.entries(stationStats.categories)
                  .sort(([, a], [, b]) => (b.value || 0) - (a.value || 0))[0]?.[0] || 'Unknown'}
              </div>
            </div>
          </div>
        )}
      </div>

      {stationStats && (
        <div className="station-mini-charts" aria-label="Station mini charts">
          <div className="details-item mini-chart-card" style={{ ['--donut-value']: '#4f46e5', ['--donut-track']: '#e5e7eb' }}>
            <div className="details-icon">🧾</div>
            <div className="details-content">
              <div className="details-label">Stops (Made)</div>
              <MiniDonut
                value={madeStops}
                total={totalStops}
                label="Stops made"
                sublabel={`${madeStops} / ${totalStops}`}
              />
            </div>
          </div>

          <div className="details-item mini-chart-card" style={{ ['--donut-value']: '#7c3aed', ['--donut-track']: '#e5e7eb' }}>
            <div className="details-icon">⏱️</div>
            <div className="details-content">
              <div className="details-label">Departures (On time)</div>
              <MiniDonut
                value={onTime}
                total={punctualityTotal}
                label="On-time departures"
                sublabel={`${onTime} / ${punctualityTotal}`}
              />
            </div>
          </div>
        </div>
      )}

      {stationStats && (trafficType || hasArrivalsDist || Object.keys(punctuality).length > 0 || Object.keys(punctualityArrival).length > 0 || Object.keys(categories).length > 0) && (
        <div className="station-stats-charts" aria-label="Station charts">
          {stationStats?.punctuality_departure && Object.keys(stationStats.punctuality_departure).length > 0 && (
            <PunctualityDepartureChart punctuality={stationStats.punctuality_departure} />
          )}

          {stationStats?.punctuality_arrival && Object.keys(stationStats.punctuality_arrival).length > 0 && (
            <PunctualityArrivalChart punctuality={stationStats.punctuality_arrival} />
          )}

          {stationStats?.categories && Object.keys(stationStats.categories).length > 0 && (
            <CategoriesChart categories={stationStats.categories} />
          )}

          {trafficType && <TrafficTypeChart trafficType={trafficType} />}

          {hasArrivalsDist && (
            <DistributionBarChart
              title="Distribution of scheduled arrivals"
              distribution={arrivalsDist}
              series={[
                { key: 'scheduled', label: 'Scheduled', color: 'var(--station-chart-1)' },
                { key: 'actual', label: 'Actual', color: 'var(--station-chart-2)' },
              ]}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default StationDetailsCard;

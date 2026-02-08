import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { apiService } from '../services/api';
import './MapSection.css';

// Enhanced Station Popup Component
const StationPopup = ({ feature }) => {
  const props = feature?.properties || {};
  const title = props.name || props.long_name || props.code || 'Station';
  const code = props.code || 'N/A';
  const regionText = props.region_name || props.regionName || props.region || 'Unknown';
  const shortName = props.short_name || props.shortName || '';
  const coords = feature?.geometry?.coordinates;

  return (
    <div
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '12px 0',
        minWidth: '280px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '10px',
          marginBottom: '12px',
          paddingBottom: '10px',
          borderBottom: '2px solid #e5e7eb',
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: '15px',
            fontWeight: 700,
            color: '#1f2937',
            flex: 1,
            lineHeight: 1.4,
          }}
        >
          {title}
        </h3>
        <span
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            padding: '4px 10px',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {code}
        </span>
      </div>

      {shortName && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginBottom: '10px',
            fontSize: '13px',
          }}
        >
          <span
            style={{
              fontWeight: 600,
              color: '#6b7280',
              marginBottom: '3px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              fontSize: '10px',
            }}
          >
            Alternate Name
          </span>
          <span style={{ color: '#1f2937', fontWeight: 500 }}>{shortName}</span>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginBottom: '10px',
          fontSize: '13px',
        }}
      >
        <span
          style={{
            fontWeight: 600,
            color: '#6b7280',
            marginBottom: '3px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontSize: '10px',
          }}
        >
          📍 Region
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: 'rgba(102, 126, 234, 0.1)',
            color: '#667eea',
            padding: '4px 8px',
            borderRadius: '6px',
            fontWeight: 600,
            width: 'fit-content',
          }}
        >
          {regionText}
        </span>
      </div>

      {coords && coords.length >= 2 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            marginTop: '10px',
            paddingTop: '8px',
            borderTop: '1px solid #f3f4f6',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: '13px' }}>
            <span
              style={{
                fontWeight: 600,
                color: '#6b7280',
                marginBottom: '2px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontSize: '10px',
              }}
            >
              Latitude
            </span>
            <span
              style={{
                color: '#1f2937',
                fontWeight: 500,
                fontSize: '12px',
                fontFamily: 'monospace',
              }}
            >
              {coords[1].toFixed(6)}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: '13px' }}>
            <span
              style={{
                fontWeight: 600,
                color: '#6b7280',
                marginBottom: '2px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontSize: '10px',
              }}
            >
              Longitude
            </span>
            <span
              style={{
                color: '#1f2937',
                fontWeight: 500,
                fontSize: '12px',
                fontFamily: 'monospace',
              }}
            >
              {coords[0].toFixed(6)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

const ITALY_CENTER = [41.89, 12.492];
const STATION_FOCUS_ZOOM = 13;
const REGION_FOCUS_PADDING = [30, 30];

function _normalizeRegionKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/_/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function _getRegionKeyFromProps(props) {
  if (!props) return '';
  return _normalizeRegionKey(props.region_name || props.regionName || props.region || props.regione || '');
}

function _cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function _convexHull(points) {
  if (!points || points.length < 3) return null;

  const pts = [...points]
    .filter((p) => Array.isArray(p) && p.length === 2)
    .sort((p1, p2) => (p1[0] === p2[0] ? p1[1] - p2[1] : p1[0] - p2[0]));

  if (pts.length < 3) return null;

  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && _cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && _cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  upper.pop();
  lower.pop();
  const hull = lower.concat(upper);
  return hull.length >= 3 ? hull : null;
}

function _pointInPolygonLatLng(pointLatLng, polygonLatLngs) {
  if (!pointLatLng || !polygonLatLngs || polygonLatLngs.length < 3) return false;
  const [py, px] = pointLatLng;
  let inside = false;
  for (let i = 0, j = polygonLatLngs.length - 1; i < polygonLatLngs.length; j = i++) {
    const [yi, xi] = polygonLatLngs[i];
    const [yj, xj] = polygonLatLngs[j];
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const selectedStationIcon = L.divIcon({
  className: 'selected-station-icon',
  html: '<div class="selected-station-pin"></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});

const REGION_COLORS = ['#dc2626', '#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#f43f5e', '#16a34a'];

function getRegionStationIcon(color) {
  return L.divIcon({
    className: 'region-station-icon',
    html: `<div class="region-station-pin" style="background:${color};"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -22],
  });
}

function AutoZoomToStation({ feature }) {
  const map = useMap();

  useEffect(() => {
    if (!feature?.geometry?.coordinates) return;
    const [lng, lat] = feature.geometry.coordinates;
    if (typeof lat !== 'number' || typeof lng !== 'number') return;
    map.flyTo([lat, lng], STATION_FOCUS_ZOOM, { duration: 0.8 });
  }, [feature, map]);

  return null;
}

function AutoFitToRegions({ bounds, enabled }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled) return;
    if (!bounds) return;
    map.fitBounds(bounds, { padding: REGION_FOCUS_PADDING, animate: true, duration: 0.8 });
  }, [bounds, enabled, map]);

  return null;
}

const MapSection = ({ filters = {} }) => {
  const [stationsFc, setStationsFc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchStations = async () => {
      try {
        setLoading(true);
        const res = await apiService.getStations({ with_coords_only: true, limit: 0 });
        setStationsFc(res?.data || null);
        setError(null);
      } catch (err) {
        setError('Failed to load stations. Make sure the backend is running and station data exists.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchStations();
  }, []);

  const selectedStationFeatures = useMemo(() => {
    const features = stationsFc?.features || [];
    if (!features.length) return [];

    const stationCodes = Array.isArray(filters.stationCodes)
      ? filters.stationCodes.map((c) => String(c).trim().toLowerCase()).filter(Boolean)
      : [];

    if (stationCodes.length > 0) {
      const hits = stationCodes
        .map((code) => features.find((f) => String(f?.properties?.code || '').trim().toLowerCase() === code))
        .filter(Boolean);
      return hits;
    }

    const stationCode = String(filters.stationCode || '').trim().toLowerCase();
    if (!stationCode) return [];
    const hit = features.find((f) => String(f?.properties?.code || '').trim().toLowerCase() === stationCode);
    return hit ? [hit] : [];
  }, [filters.stationCode, filters.stationCodes, stationsFc]);

  const selectedRegionKeys = useMemo(() => {
    const regions = Array.isArray(filters.regions) ? filters.regions : [];
    return regions.map(_normalizeRegionKey).filter(Boolean);
  }, [filters.regions]);

  const regionFeatureGroups = useMemo(() => {
    const features = stationsFc?.features || [];
    if (!features.length || !selectedRegionKeys.length) return [];

    const groups = selectedRegionKeys.map((key, idx) => {
      const color = REGION_COLORS[idx % REGION_COLORS.length];
      const regionFeatures = features.filter((f) => _getRegionKeyFromProps(f?.properties) === key);
      const coords = regionFeatures
        .map((f) => f?.geometry?.coordinates)
        .filter((c) => Array.isArray(c) && c.length === 2 && typeof c[0] === 'number' && typeof c[1] === 'number');

      const hullLngLat = _convexHull(coords);
      const hullLatLng = hullLngLat ? hullLngLat.map(([lng, lat]) => [lat, lng]) : null;
      const bounds = hullLatLng && hullLatLng.length ? L.latLngBounds(hullLatLng) : null;

      return {
        key,
        color,
        features: regionFeatures,
        hullLatLng,
        bounds,
      };
    });

    return groups.filter((g) => g.features.length > 0);
  }, [selectedRegionKeys, stationsFc]);

  const regionsBounds = useMemo(() => {
    const boundsList = regionFeatureGroups.map((g) => g.bounds).filter(Boolean);
    if (!boundsList.length) return null;

    const merged = boundsList.reduce((acc, b) => {
      if (!acc) return b;
      acc.extend(b);
      return acc;
    }, null);
    return merged;
  }, [regionFeatureGroups]);

  const showRegionPolygons = regionFeatureGroups.length > 0;

  return (
    <div className="map-page">
      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading map...</p>
        </div>
      ) : error ? (
        <div className="error-container">
          <span className="error-icon">⚠️</span>
          <p>{error}</p>
        </div>
      ) : (
        <div className="map-card">
          <MapContainer center={ITALY_CENTER} zoom={6} scrollWheelZoom className="leaflet-map">
            <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

            {selectedStationFeatures.map((f) => {
              const [lng, lat] = f.geometry.coordinates;
              const code = f?.properties?.code || `${lat},${lng}`;
              return (
                <Marker key={`selected-${code}`} position={[lat, lng]} icon={selectedStationIcon}>
                  <Popup>
                    <StationPopup feature={f} />
                  </Popup>
                </Marker>
              );
            })}

            {stationsFc && (
              <GeoJSON
                data={stationsFc}
                pointToLayer={(feature, latlng) => {
                  const key = _getRegionKeyFromProps(feature?.properties);
                  const idx = selectedRegionKeys.indexOf(key);
                  if (idx >= 0) {
                    return L.marker(latlng, { icon: getRegionStationIcon(REGION_COLORS[idx % REGION_COLORS.length]) });
                  }
                  return L.circleMarker(latlng, { radius: 4, color: '#667eea', weight: 1, fillOpacity: 0.6 });
                }}
                onEachFeature={(feature, layer) => {
                  layer.on('click', () => {
                    const popupNode = document.createElement('div');
                    const root = ReactDOM.createRoot(popupNode);
                    root.render(<StationPopup feature={feature} />);
                    layer.bindPopup(popupNode).openPopup();
                  });
                }}
              />
            )}

            {showRegionPolygons &&
              regionFeatureGroups
                .filter((g) => Array.isArray(g.hullLatLng) && g.hullLatLng.length >= 3)
                .map((g) => (
                  <Polygon
                    key={`poly-${g.key}`}
                    positions={g.hullLatLng}
                    pathOptions={{ color: g.color, weight: 2, fillOpacity: 0.12 }}
                  />
                ))}

            <AutoZoomToStation feature={selectedStationFeatures[0]} />
            <AutoFitToRegions bounds={regionsBounds} enabled={showRegionPolygons && selectedStationFeatures.length === 0} />
          </MapContainer>
        </div>
      )}
    </div>
  );
};

export default MapSection;

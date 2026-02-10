import React, { useEffect, useMemo, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
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

  const handleViewStatistics = () => {
    // Navigate to statistics section with station code as query parameter
    const newUrl = `?stationCode=${encodeURIComponent(code)}#statistics`;
    window.history.pushState({}, '', newUrl);
    
    // Dispatch custom event to trigger filter update
    window.dispatchEvent(new CustomEvent('stationSelected', { detail: { stationCode: code } }));
    
    // Scroll to statistics section
    const statsSection = document.getElementById('statistics');
    if (statsSection) {
      const headerOffset = 90;
      const elementPosition = statsSection.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
      
      setTimeout(() => {
        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }, 100);
    }
  };

  return (
    <div className="station-popup-enhanced">
      <div className="station-popup-header-enhanced">
        <div className="station-popup-icon">🚉</div>
        <div className="station-popup-title-group">
          <div className="station-popup-title-row">
            <h3 className="station-popup-title-enhanced">{title}</h3>
            <span className="station-popup-code-enhanced">{code}</span>
          </div>
          {shortName && <div className="station-popup-subtitle">{shortName}</div>}
        </div>
      </div>

      <div className="station-popup-info-grid">
        <div className="station-popup-info-card">
          <div className="station-popup-info-icon">📍</div>
          <div className="station-popup-info-content">
            <div className="station-popup-info-label">Region</div>
            <div className="station-popup-info-value">{regionText}</div>
          </div>
        </div>

        {coords && coords.length >= 2 && (
          <>
            <div className="station-popup-info-card">
              <div className="station-popup-info-icon">🌐</div>
              <div className="station-popup-info-content">
                <div className="station-popup-info-label">Coordinates</div>
                <div className="station-popup-info-value station-coords-compact">
                  {coords[1].toFixed(4)}°N, {coords[0].toFixed(4)}°E
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="station-popup-divider"></div>

      <div className="station-popup-actions">
        <button className="station-popup-btn" onClick={handleViewStatistics} type="button">
          <span className="station-popup-btn-icon">📊</span>
          <span>View Statistics</span>
        </button>
      </div>
    </div>
  );
};

const ITALY_CENTER = [41.89, 12.492];
const STATION_FOCUS_ZOOM = 15;
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
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
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
    
    // Fly to station with smooth animation
    map.flyTo([lat, lng], STATION_FOCUS_ZOOM, { 
      duration: 1.2,
      easeLinearity: 0.25 
    });
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
                <Marker 
                  key={`selected-${code}`} 
                  position={[lat, lng]} 
                  icon={selectedStationIcon}
                  eventHandlers={{
                    add: (e) => {
                      // Auto-open popup when marker is added
                      setTimeout(() => e.target.openPopup(), 400);
                    }
                  }}
                >
                  <Popup 
                    maxWidth={360} 
                    minWidth={320}
                    autoPan={true}
                    keepInView={true}
                  >
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
                    // Create a container for the popup content
                    const popupNode = document.createElement('div');
                    popupNode.style.minWidth = '320px';
                    
                    // Create root and render
                    const root = createRoot(popupNode);
                    root.render(<StationPopup feature={feature} />);
                    
                    // Bind popup with proper options and open after ensuring render
                    requestAnimationFrame(() => {
                      requestAnimationFrame(() => {
                        layer.bindPopup(popupNode, {
                          maxWidth: 360,
                          minWidth: 320,
                          autoPan: true,
                          keepInView: true,
                          closeButton: true,
                          autoClose: true,
                          closeOnClick: false
                        }).openPopup();
                      });
                    });
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

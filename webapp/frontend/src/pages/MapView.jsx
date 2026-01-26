import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { apiService } from '../services/api';
import Filters from '../components/Filters';
import './MapView.css';

const ITALY_CENTER = [41.890, 12.492];
const STATION_FOCUS_ZOOM = 13;
const REGION_FOCUS_PADDING = [30, 30];

function _normalizeRegionKey(value) {
  // Create a stable key so UI region chips match station geojson values.
  // Examples: "Emilia Romagna" -> "emilia-romagna", "Emilia-Romagna" -> "emilia-romagna".
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
  // 2D cross product of OA and OB vectors, where points are [x, y].
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function _convexHull(points) {
  // Monotonic chain convex hull. Input points: Array<[x, y]>.
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
  // Ray casting algorithm for [lat, lng] points against polygon of [lat, lng]
  if (!pointLatLng || !polygonLatLngs || polygonLatLngs.length < 3) return false;
  const [py, px] = pointLatLng; // y=lat, x=lng for readability below
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

// Palette used to distinguish multiple selected regions consistently
const REGION_COLORS = ['#dc2626', '#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#f43f5e', '#16a34a'];

// Build a colored divIcon for stations that belong to a selected region
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

const MapView = () => {
  const [stationsFc, setStationsFc] = useState(null);
  const [filters, setFilters] = useState({});
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
    const stationQuery = String(filters.stationQuery || '').trim().toLowerCase();

    if (stationCode) {
      const hit = features.find((f) => String(f?.properties?.code || '').trim().toLowerCase() === stationCode);
      if (hit) return [hit];
    }

    if (!stationQuery) return [];

    // Exact match on name/long_name/code to avoid zooming while typing.
    const exact = features.find((f) => {
        const props = f?.properties || {};
        const name = String(props.name || '').trim().toLowerCase();
        const longName = String(props.long_name || props.longName || '').trim().toLowerCase();
        const code = String(props.code || '').trim().toLowerCase();
        return stationQuery === name || stationQuery === longName || stationQuery === code;
      });
    return exact ? [exact] : [];
  }, [stationsFc, filters.stationCodes, filters.stationCode, filters.stationQuery]);

  const selectedStationFocusFeature = useMemo(() => {
    return selectedStationFeatures.length === 1 ? selectedStationFeatures[0] : null;
  }, [selectedStationFeatures]);

  const filteredStationsFc = useMemo(() => {
    const features = stationsFc?.features || [];
    if (!features.length) return stationsFc;
    const selectedRegions = (filters.regions || []).map(_normalizeRegionKey).filter(Boolean);
    const q = String(filters.stationQuery || '').trim().toLowerCase();

    if (selectedRegions.length === 0 && q.length < 2) return stationsFc;

    const out = features.filter((f) => {
      const props = f?.properties || {};
      const name = String(props.name || props.long_name || '').toLowerCase();
      const code = String(props.code || '').toLowerCase();
      const regionName = _getRegionKeyFromProps(props);

      if (selectedRegions.length > 0 && !selectedRegions.includes(regionName)) return false;

      if (q.length >= 2) {
        const hay = `${name} ${code} ${regionName}`;
        return hay.includes(q);
      }

      return true;
    });

    return { type: 'FeatureCollection', features: out };
  }, [stationsFc, filters.regions, filters.stationQuery]);

  const selectedStationLatLngs = useMemo(() => {
    const pts = [];
    for (const f of selectedStationFeatures) {
      const coords = f?.geometry?.coordinates;
      if (!coords || coords.length < 2) continue;
      const [lng, lat] = coords;
      if (typeof lat !== 'number' || typeof lng !== 'number') continue;
      pts.push([lat, lng]);
    }
    return pts;
  }, [selectedStationFeatures]);

  const selectedStationsBounds = useMemo(() => {
    if (selectedStationLatLngs.length < 2) return null;
    return L.latLngBounds(selectedStationLatLngs);
  }, [selectedStationLatLngs]);

  const selectedRegionsLower = useMemo(() => {
    return (filters.regions || []).map(_normalizeRegionKey).filter(Boolean);
  }, [filters.regions]);

  // Deterministic color per selected region based on selection order
  const regionColorMap = useMemo(() => {
    const map = {};
    selectedRegionsLower.forEach((name, i) => {
      map[name] = REGION_COLORS[i % REGION_COLORS.length];
    });
    return map;
  }, [selectedRegionsLower]);

  const selectedRegionsBounds = useMemo(() => {
    if (!selectedRegionsLower.length) return null;

    const features = stationsFc?.features || [];
    const pts = features
      .filter((f) => {
        const regionName = _getRegionKeyFromProps(f?.properties || {});
        return regionName && selectedRegionsLower.includes(regionName);
      })
      .map((f) => {
        const coords = f?.geometry?.coordinates;
        if (!coords || coords.length < 2) return null;
        const [lng, lat] = coords;
        if (typeof lat !== 'number' || typeof lng !== 'number') return null;
        return [lat, lng];
      })
      .filter(Boolean);

    if (!pts.length) return null;
    return L.latLngBounds(pts);
  }, [stationsFc, selectedRegionsLower]);

  // Build a convex hull polygon per selected region
  const selectedRegionsPolygons = useMemo(() => {
    if (!selectedRegionsLower.length) return {};
    const features = stationsFc?.features || [];
    const ptsByRegion = new Map();

    for (const f of features) {
      const regionName = _getRegionKeyFromProps(f?.properties || {});
      if (!regionName || !selectedRegionsLower.includes(regionName)) continue;
      const coords = f?.geometry?.coordinates;
      if (!coords || coords.length < 2) continue;
      const [lng, lat] = coords;
      if (typeof lat !== 'number' || typeof lng !== 'number') continue;
      if (!ptsByRegion.has(regionName)) ptsByRegion.set(regionName, []);
      ptsByRegion.get(regionName).push([lng, lat]);
    }

    const polygons = {};
    for (const name of selectedRegionsLower) {
      const xy = ptsByRegion.get(name) || [];
      const hull = _convexHull(xy);
      if (hull && hull.length >= 3) {
        polygons[name] = hull.map(([lng, lat]) => [lat, lng]);
      }
    }
    return polygons; // { regionName: [[lat,lng], ...] }
  }, [stationsFc, selectedRegionsLower]);

  return (
    <div className="map-view">
      <div className="map-header">
        <h1>🗺️ Stations Map</h1>
        <p>View all stations and explore them on the map.</p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <Filters onChange={setFilters} />
      </div>

      {loading && (
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading map...</p>
        </div>
      )}

      {error && (
        <div className="error-message">
          <span>⚠️ {error}</span>
        </div>
      )}

      {!loading && !error && (
        <div className="map-container">
          <MapContainer center={ITALY_CENTER} zoom={6} className="map-leaflet" scrollWheelZoom>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />

            <AutoZoomToStation feature={selectedStationFocusFeature} />

            <AutoFitToRegions enabled={selectedStationLatLngs.length > 1} bounds={selectedStationsBounds} />

            <AutoFitToRegions
              enabled={selectedRegionsLower.length > 0 && selectedStationLatLngs.length === 0}
              bounds={selectedRegionsBounds}
            />

            {/* One polygon per selected region, each with its own color */}
            {selectedRegionsLower.length > 0 && selectedStationLatLngs.length === 0
              ? selectedRegionsLower.map((name) => {
                  const poly = selectedRegionsPolygons[name];
                  if (!Array.isArray(poly) || poly.length < 3) return null;
                  const color = regionColorMap[name] || REGION_COLORS[0];
                  return (
                    <Polygon
                      key={`poly-${name}`}
                      positions={poly}
                      pathOptions={{
                        color,
                        weight: 2,
                        dashArray: '6 6',
                        fill: true,
                        fillColor: color,
                        fillOpacity: 0.08,
                      }}
                    />
                  );
                })
              : null}

            {selectedStationFeatures.length
              ? selectedStationFeatures.map((feature) => {
                  const coords = feature?.geometry?.coordinates;
                  if (!coords || coords.length < 2) return null;
                  const [lng, lat] = coords;
                  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
                  const props = feature?.properties || {};
                  const title = props.name || props.long_name || props.code || 'Station';
                  const code = props.code ? ` (${props.code})` : '';
                  const regionText = props.region_name || props.regionName || props.region;
                  const region = regionText ? ` — ${regionText}` : '';
                  const key = String(props.code || `${lat},${lng}`);
                  return (
                    <Marker key={`sel-${key}`} position={[lat, lng]} icon={selectedStationIcon} zIndexOffset={1000}>
                      <Popup>{`${title}${code}${region}`}</Popup>
                    </Marker>
                  );
                })
              : null}

            {filteredStationsFc?.features?.length ? (
              <GeoJSON
                data={filteredStationsFc}
                pointToLayer={(feature, latlng) =>
                  (() => {
                    // Region name based inclusion and color
                    const regionName = _getRegionKeyFromProps(feature?.properties || {});
                    const inSelectedRegion = selectedRegionsLower.includes(regionName);

                    if (inSelectedRegion) {
                      const color = regionColorMap[regionName] || REGION_COLORS[0];
                      return L.marker(latlng, { icon: getRegionStationIcon(color), zIndexOffset: 250 });
                    }

                    return L.circleMarker(latlng, {
                      radius: 3,
                      weight: 1,
                      color: '#667eea',
                      fillColor: '#667eea',
                      fillOpacity: 0.55,
                    });
                  })()
                }
                onEachFeature={(feature, layer) => {
                  const props = feature?.properties || {};
                  const title = props.name || props.long_name || props.code || 'Station';
                  const code = props.code ? ` (${props.code})` : '';
                  const regionText = props.region_name || props.regionName || props.region;
                  const region = regionText ? ` — ${regionText}` : '';
                  layer.bindPopup(`${title}${code}${region}`);
                }}
              />
            ) : null}
          </MapContainer>
        </div>
      )}
    </div>
  );
};

export default MapView;

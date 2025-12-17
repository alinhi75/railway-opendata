import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { apiService } from '../services/api';
import Filters from '../components/Filters';
import './MapView.css';

const ITALY_CENTER = [41.890, 12.492];
const STATION_FOCUS_ZOOM = 13;

const selectedStationIcon = L.divIcon({
  className: 'selected-station-icon',
  html: '<div class="selected-station-pin"></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});

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

  const filteredStationsFc = useMemo(() => {
    const features = stationsFc?.features || [];
    if (!features.length) return stationsFc;

    const selectedRegions = (filters.regions || []).map((r) => String(r).trim().toLowerCase());
    const q = String(filters.stationQuery || '').trim().toLowerCase();

    if (selectedRegions.length === 0 && q.length < 2) return stationsFc;

    const out = features.filter((f) => {
      const props = f?.properties || {};
      const name = String(props.name || props.long_name || '').toLowerCase();
      const code = String(props.code || '').toLowerCase();
      const regionName = String(props.region_name || props.regionName || '').toLowerCase();

      if (selectedRegions.length > 0 && !selectedRegions.includes(regionName)) return false;

      if (q.length >= 2) {
        const hay = `${name} ${code} ${regionName}`;
        return hay.includes(q);
      }
      return true;
    });

    return { type: 'FeatureCollection', features: out };
  }, [stationsFc, filters.regions, filters.stationQuery]);

  const selectedStationFeature = useMemo(() => {
    const features = stationsFc?.features || [];
    if (!features.length) return null;

    const stationCode = String(filters.stationCode || '').trim().toLowerCase();
    const stationQuery = String(filters.stationQuery || '').trim().toLowerCase();

    if (stationCode) {
      const hit = features.find((f) => String(f?.properties?.code || '').trim().toLowerCase() === stationCode);
      if (hit) return hit;
    }

    if (!stationQuery) return null;

    // Exact match on name/long_name/code to avoid zooming while typing.
    return (
      features.find((f) => {
        const props = f?.properties || {};
        const name = String(props.name || '').trim().toLowerCase();
        const longName = String(props.long_name || props.longName || '').trim().toLowerCase();
        const code = String(props.code || '').trim().toLowerCase();
        return stationQuery === name || stationQuery === longName || stationQuery === code;
      }) || null
    );
  }, [stationsFc, filters.stationCode, filters.stationQuery]);

  const selectedStationLatLng = useMemo(() => {
    const coords = selectedStationFeature?.geometry?.coordinates;
    if (!coords || coords.length < 2) return null;
    const [lng, lat] = coords;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    return [lat, lng];
  }, [selectedStationFeature]);

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

            <AutoZoomToStation feature={selectedStationFeature} />

            {selectedStationLatLng ? (
              <Marker position={selectedStationLatLng} icon={selectedStationIcon} zIndexOffset={1000}>
                <Popup>
                  {(() => {
                    const props = selectedStationFeature?.properties || {};
                    const title = props.name || props.long_name || props.code || 'Station';
                    const code = props.code ? ` (${props.code})` : '';
                    const region = props.region_name ? ` — ${props.region_name}` : '';
                    return `${title}${code}${region}`;
                  })()}
                </Popup>
              </Marker>
            ) : null}

            {filteredStationsFc?.features?.length ? (
              <GeoJSON
                data={filteredStationsFc}
                pointToLayer={(feature, latlng) =>
                  L.circleMarker(latlng, {
                    radius: 3,
                    weight: 1,
                    color: '#667eea',
                    fillColor: '#667eea',
                    fillOpacity: 0.6,
                  })
                }
                onEachFeature={(feature, layer) => {
                  const props = feature?.properties || {};
                  const title = props.name || props.long_name || props.code || 'Station';
                  const code = props.code ? ` (${props.code})` : '';
                  const region = props.region_name ? ` — ${props.region_name}` : '';
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

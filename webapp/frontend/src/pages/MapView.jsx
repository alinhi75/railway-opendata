import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import Filters from '../components/Filters';
import './MapView.css';

/**
 * Map View Page
 * US-4: Interactive Trajectory Map
 * Shows animated train movements and delays geographically
 */
const MapView = () => {
  const [mapPath, setMapPath] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [filters, setFilters] = useState({});

  useEffect(() => {
    const fetchMapData = async () => {
      try {
        setLoading(true);
        
        // Build query params from filters
        const params = {
          start_date: filters.startDate || undefined,
          end_date: filters.endDate || undefined,
          railway_companies: filters.companies?.join(',') || undefined,
          regions: filters.regions?.join(',') || undefined,
          station_query: filters.stationQuery || undefined,
        };

        // Fetch trajectory map
        const response = await apiService.getTrajectories(params);
        if (response.data.file_path) {
          setMapPath(response.data.file_path);
        }

        setError(null);
      } catch (err) {
        setError('Failed to load map. Make sure the backend is running and map data exists.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchMapData();
  }, [filters]);

  return (
    <div className="map-view">
      <div className="map-header">
        <h1>🗺️ Interactive Railway Map</h1>
        <p>US-4: Visualize train movements and delays across Italy</p>
      </div>

      {/* Filters */}
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
        <>
          {mapPath ? (
            <div className="map-container">
              <iframe
                src={mapPath}
                title="Railway Interactive Map"
                className="map-iframe"
              ></iframe>
              <div className="map-info">
                <h3>Map Features:</h3>
                <ul>
                  <li>🟢 Green lines = Trains on time</li>
                  <li>🟠 Orange lines = Trains 5-15 min late</li>
                  <li>🔴 Red lines = Trains  more than 15 min late</li>
                  <li>Line thickness = Train crowding level</li>
                  <li>Click stations for performance details</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="placeholder">
              <h2>📊 No map data available</h2>
              <p>Run the following command to generate the trajectory map:</p>
              <pre>python scripts/run_trajectories_week_sample.py --start 2025-03-27 --end 2025-04-02 --sample 0.1 --out data/outputs/trajectories_map.html</pre>
            </div>
          )}

          {/* Map Usage Guide */}
          <section className="usage-guide">
            <h2>How to Use the Map</h2>
            <div className="guide-grid">
              <div className="guide-card">
                <h3>🔍 Explore Stations</h3>
                <p>Click on any station marker to see:</p>
                <ul>
                  <li>Station name and code</li>
                  <li>Performance statistics</li>
                  <li>Trains passing through</li>
                </ul>
              </div>
              <div className="guide-card">
                <h3>📊 Analyze Delays</h3>
                <p>Use colors to understand:</p>
                <ul>
                  <li>Which routes have delays</li>
                  <li>Time-of-day patterns</li>
                  <li>Regional variations</li>
                </ul>
              </div>
              <div className="guide-card">
                <h3>📈 Track Crowding</h3>
                <p>Line thickness shows:</p>
                <ul>
                  <li>Train capacity utilization</li>
                  <li>Popular routes</li>
                  <li>Peak travel times</li>
                </ul>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default MapView;

import React from 'react';
import './StationDetailsCard.css';

/**
 * Station Details Card Component
 * Displays detailed information about a selected station
 */
const StationDetailsCard = ({ station, stationStats }) => {
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
    </div>
  );
};

export default StationDetailsCard;

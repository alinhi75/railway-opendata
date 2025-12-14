import React from 'react';

/**
 * Summary Card Component
 * Displays a single metric with title, value, and unit
 */
const SummaryCard = ({ title, value, unit, icon = '📊', color = '#667eea' }) => {
  return (
    <div className="summary-card" style={{ borderLeftColor: color }}>
      <div className="card-icon">{icon}</div>
      <div className="card-content">
        <h3>{title}</h3>
        <div className="card-value">
          <span className="value">{value}</span>
          <span className="unit">{unit}</span>
        </div>
      </div>
    </div>
  );
};

export default SummaryCard;

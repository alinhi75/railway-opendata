import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import Filters from '../components/Filters';
import DashboardSection from '../sections/DashboardSection';
import StatisticsSection from '../sections/StatisticsSection';
import MapSection from '../sections/MapSection';
import AboutSection from '../sections/AboutSection';

import './OnePage.css';

const HEADER_OFFSET_PX = 90;

function scrollToHash(hash) {
  const id = String(hash || '').replace(/^#/, '').trim();
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;

  const top = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET_PX;
  window.scrollTo({ top, behavior: 'smooth' });
}

const OnePage = () => {
  const location = useLocation();
  const [appliedFilters, setAppliedFilters] = useState({});
  const [initialFiltersFromUrl, setInitialFiltersFromUrl] = useState({});

  useEffect(() => {
    // Parse URL query parameters for initial filters
    const params = new URLSearchParams(location.search);
    const urlFilters = {};
    
    const stationCode = params.get('stationCode');
    if (stationCode) {
      urlFilters.stationCodes = [stationCode];
    }
    
    const startDate = params.get('startDate');
    if (startDate) {
      urlFilters.startDate = startDate;
    }
    
    const endDate = params.get('endDate');
    if (endDate) {
      urlFilters.endDate = endDate;
    }
    
    if (Object.keys(urlFilters).length > 0) {
      setInitialFiltersFromUrl(urlFilters);
      setAppliedFilters(urlFilters);
    }
  }, [location.search]);

  useEffect(() => {
    if (location.hash) {
      // Delay 1 frame so layout is painted before measuring offsets.
      requestAnimationFrame(() => scrollToHash(location.hash));
    }
  }, [location.hash]);

  return (
    <div className="onepage" id="top">
      <section id="dashboard" className="onepage-section">
        <DashboardSection filters={appliedFilters} />
      </section>

      <section id="map" className="onepage-section">
        <div className="onepage-container">
          <div className="dashboard-header">
            <div className="header-content">
              <h1>🗺️ Station Map</h1>
              <p className="header-subtitle">Explore stations across Italy</p>
            </div>
          </div>

          <div className="map-section-content">
            <Filters onChange={setAppliedFilters} initialFilters={initialFiltersFromUrl} />
            <MapSection filters={appliedFilters} />
          </div>
        </div>
      </section>

      <section id="statistics" className="onepage-section">
        <StatisticsSection filters={appliedFilters} />
      </section>

      <section id="about" className="onepage-section">
        <AboutSection />
      </section>
    </div>
  );
};

export default OnePage;

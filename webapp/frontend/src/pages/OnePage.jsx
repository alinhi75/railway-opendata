import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import Filters from '../components/Filters';
import DashboardSection from '../sections/DashboardSection';
import StatisticsSection from '../sections/StatisticsSection';
import MapSection from '../sections/MapSection';
import AboutSection from '../sections/AboutSection';
import ErrorBoundary from '../components/ErrorBoundary';

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
  const [datasetVersion, setDatasetVersion] = useState(0);

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

  // Listen for station selection events from map
  useEffect(() => {
    const handleStationSelected = (event) => {
      const stationCode = event.detail?.stationCode;
      if (stationCode) {
        setAppliedFilters(prev => ({
          ...prev,
          stationCodes: [stationCode]
        }));
        
        // Scroll to leaflet-container when station is selected
        setTimeout(() => {
          const mapContainer = document.querySelector('.leaflet-container');
          if (mapContainer) {
            const top = mapContainer.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET_PX;
            window.scrollTo({ top, behavior: 'smooth' });
          }
        }, 100);
      }
    };

    const handleStationCleared = () => {
      setAppliedFilters((prev) => {
        const next = { ...prev };
        delete next.stationCodes;
        delete next.stationCode;
        return next;
      });
    };

    window.addEventListener('stationSelected', handleStationSelected);
    window.addEventListener('stationCleared', handleStationCleared);
    return () => {
      window.removeEventListener('stationSelected', handleStationSelected);
      window.removeEventListener('stationCleared', handleStationCleared);
    };
  }, []);

  useEffect(() => {
    if (location.hash) {
      // Delay 1 frame so layout is painted before measuring offsets.
      requestAnimationFrame(() => scrollToHash(location.hash));
    }
  }, [location.hash]);

  const handleFiltersChange = (newFilters) => {
    setAppliedFilters(newFilters);
    
    // Auto-scroll only when regions or stations are selected
    const hasRegions = Array.isArray(newFilters.regions) && newFilters.regions.length > 0;
    const hasStations = Array.isArray(newFilters.stationCodes) && newFilters.stationCodes.length > 0;
    
    if (hasRegions || hasStations) {
      // Scroll to the leaflet map container with a small delay to ensure rendering
      setTimeout(() => {
        const mapContainer = document.querySelector('.leaflet-container');
        if (mapContainer) {
          const top = mapContainer.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET_PX;
          window.scrollTo({ top, behavior: 'smooth' });
        } else {
          // Fallback to ID selector if leaflet-container is not yet rendered
          scrollToHash('#leaflet-map-container');
        }
      }, 100);
    }
  };

  return (
    <div className="onepage" id="top">
      <section id="map" className="onepage-section">
        <div className="onepage-container">

          <div className="map-section-content">
            <Filters
              onChange={handleFiltersChange}
              onDatasetApplied={() => setDatasetVersion((v) => v + 1)}
              initialFilters={initialFiltersFromUrl}
            />
            <div id="station-tools-slot" className="station-tools-slot"></div>
            <MapSection filters={appliedFilters} datasetVersion={datasetVersion} />
          </div>
        </div>
      </section>

      <section id="dashboard" className="onepage-section">
        <DashboardSection filters={appliedFilters} datasetVersion={datasetVersion} />
      </section>

      <section id="statistics" className="onepage-section">
        <ErrorBoundary title="Statistics section crashed">
          <StatisticsSection filters={appliedFilters} datasetVersion={datasetVersion} />
        </ErrorBoundary>
      </section>

      <section id="about" className="onepage-section">
        <AboutSection />
      </section>
    </div>
  );
};

export default OnePage;

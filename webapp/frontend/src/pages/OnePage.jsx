import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

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

  useEffect(() => {
    if (location.hash) {
      // Delay 1 frame so layout is painted before measuring offsets.
      requestAnimationFrame(() => scrollToHash(location.hash));
    }
  }, [location.hash]);

  return (
    <div className="onepage" id="top">
      <section id="dashboard" className="onepage-section">
        <DashboardSection />
      </section>

      <section id="statistics" className="onepage-section">
        <StatisticsSection />
      </section>

      <section id="map" className="onepage-section">
        <MapSection />
      </section>

      <section id="about" className="onepage-section">
        <AboutSection />
      </section>
    </div>
  );
};

export default OnePage;

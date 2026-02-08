import React, { useEffect, useMemo, useRef, useState } from 'react';
import './Header.css';

/**
 * Header Component
 * Navigation bar with logo and menu links
 */
const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('dashboard');

  const headerRef = useRef(null);

  const sectionIds = useMemo(() => ['dashboard', 'statistics', 'map', 'about'], []);
  const HEADER_OFFSET_PX = 90;

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  useEffect(() => {
    const applyFromHash = () => {
      const hash = String(window.location.hash || '').replace(/^#/, '').trim();
      if (sectionIds.includes(hash)) setActiveSection(hash);
    };

    applyFromHash();
    window.addEventListener('hashchange', applyFromHash);
    return () => window.removeEventListener('hashchange', applyFromHash);
  }, [sectionIds]);

  useEffect(() => {
    const onScroll = () => {
      let bestId = activeSection;
      let bestDist = Number.POSITIVE_INFINITY;

      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (!el) continue;

        const dist = Math.abs(el.getBoundingClientRect().top - HEADER_OFFSET_PX);
        if (dist < bestDist) {
          bestDist = dist;
          bestId = id;
        }
      }

      if (bestId && bestId !== activeSection) setActiveSection(bestId);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [activeSection, sectionIds]);

  useEffect(() => {
    if (!isMenuOpen) return;

    const onPointerDown = (e) => {
      const root = headerRef.current;
      if (!root) return;
      if (!root.contains(e.target)) setIsMenuOpen(false);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isMenuOpen]);

  return (
    <header className="header" ref={headerRef}>
      <div className="header-container">
        <div className="logo-section">
          <a href="#top" className="logo" onClick={() => setIsMenuOpen(false)}>
            <h1>🚂 Railway OpenData</h1>
          </a>
          <p className="tagline">Italian Railway Performance Insights for Citizens</p>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className="menu-toggle"
          onClick={toggleMenu}
          aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isMenuOpen}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        {/* Navigation Menu */}
        <nav className={`nav ${isMenuOpen ? 'open' : ''}`} aria-label="Primary">
          <a
            href="#dashboard"
            className={`nav-link ${activeSection === 'dashboard' ? 'active' : ''}`}
            aria-current={activeSection === 'dashboard' ? 'page' : undefined}
            onClick={() => setIsMenuOpen(false)}
          >
            📊 Dashboard
          </a>
          <a
            href="#map"
            className={`nav-link ${activeSection === 'map' ? 'active' : ''}`}
            aria-current={activeSection === 'map' ? 'page' : undefined}
            onClick={() => setIsMenuOpen(false)}
          >
            🗺️ Map
          </a>
          <a
            href="#statistics"
            className={`nav-link ${activeSection === 'statistics' ? 'active' : ''}`}
            aria-current={activeSection === 'statistics' ? 'page' : undefined}
            onClick={() => setIsMenuOpen(false)}
          >
            📈 Statistics
          </a>
          <a
            href="#about"
            className={`nav-link ${activeSection === 'about' ? 'active' : ''}`}
            aria-current={activeSection === 'about' ? 'page' : undefined}
            onClick={() => setIsMenuOpen(false)}
          >
            ℹ️ About
          </a>
        </nav>
      </div>
    </header>
  );
};

export default Header;

import React, { useState } from 'react';
import './Header.css';

/**
 * Header Component
 * Navigation bar with logo and menu links
 */
const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <header className="header">
      <div className="header-container">
        <div className="logo-section">
          <a href="#top" className="logo" onClick={() => setIsMenuOpen(false)}>
            <h1>🚂 Railway OpenData</h1>
          </a>
          <p className="tagline">Italian Railway Performance Insights for Citizens</p>
        </div>

        {/* Mobile Menu Toggle */}
        <button className="menu-toggle" onClick={toggleMenu}>
          <span></span>
          <span></span>
          <span></span>
        </button>

        {/* Navigation Menu */}
        <nav className={`nav ${isMenuOpen ? 'open' : ''}`}>
          <a href="#dashboard" className="nav-link" onClick={() => setIsMenuOpen(false)}>
            📊 Dashboard
          </a>
          <a href="#statistics" className="nav-link" onClick={() => setIsMenuOpen(false)}>
            📈 Statistics
          </a>
          <a href="#map" className="nav-link" onClick={() => setIsMenuOpen(false)}>
            🗺️ Map
          </a>
          <a href="#about" className="nav-link" onClick={() => setIsMenuOpen(false)}>
            ℹ️ About
          </a>
        </nav>
      </div>
    </header>
  );
};

export default Header;

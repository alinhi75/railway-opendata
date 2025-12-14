import React, { useState } from 'react';
import { Link } from 'react-router-dom';
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
          <Link to="/" className="logo">
            <h1>🚂 Railway OpenData</h1>
          </Link>
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
          <Link to="/" className="nav-link" onClick={() => setIsMenuOpen(false)}>
            📊 Dashboard
          </Link>
          <Link to="/statistics" className="nav-link" onClick={() => setIsMenuOpen(false)}>
            📈 Statistics
          </Link>
          <Link to="/map" className="nav-link" onClick={() => setIsMenuOpen(false)}>
            🗺️ Map
          </Link>
          <a href="#about" className="nav-link" onClick={() => setIsMenuOpen(false)}>
            ℹ️ About
          </a>
        </nav>
      </div>
    </header>
  );
};

export default Header;

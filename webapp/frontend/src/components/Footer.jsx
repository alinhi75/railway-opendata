import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

/**
 * Footer Component
 * Footer with copyright and links
 */
const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-content">
          <div className="footer-section">
            <h3>Railway OpenData</h3>
            <p>Empowering Italian citizens with transparent railway performance data.</p>
            <p className="open-source">
              <strong>Open Source | Open Data</strong>
            </p>
          </div>

          <div className="footer-section">
            <h4>Quick Links</h4>
            <ul>
              <li><Link to="/">Dashboard</Link></li>
              <li><Link to="/statistics">Statistics</Link></li>
              <li><Link to="/map">Map</Link></li>
            </ul>
          </div>

          <div className="footer-section">
            <h4>Resources</h4>
            <ul>
              <li><a href="https://github.com/alinhi75/railway-opendata" target="_blank" rel="noopener noreferrer">GitHub Repository</a></li>
              <li><Link to="/docs">Documentation</Link></li>
              <li><Link to="/api-docs">API Docs</Link></li>
            </ul>
          </div>

          <div className="footer-section">
            <h4>Contact</h4>
            <p>
              <strong>Thesis Project</strong><br />
              Politecnico di Torino<br />
              Prof. Antonio Vetrò<br />
              Prof. Andrea Trentini
              Marco Aceti<br />
              Enea Ahmedhodzic<br />

            </p>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; {currentYear} Railway OpenData. All rights reserved.</p>
          {/* <p>
            <a href="#privacy">Privacy Policy</a> | 
            <a href="#terms">Terms of Service</a> | 
            <a href="#data">Data Sources</a>
          </p> */}
        </div>
      </div>
    </footer>
  );
};

export default Footer;

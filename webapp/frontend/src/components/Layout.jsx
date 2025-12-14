import React from 'react';
import Header from './Header';
import Footer from './Footer';
import './Layout.css';

/**
 * Main Layout Component
 * Wraps all pages with header, navigation, and footer
 */
const Layout = ({ children }) => {
  return (
    <div className="layout">
      <Header />
      <main className="main-content">
        {children}
      </main>
      <Footer />
    </div>
  );
};

export default Layout;

// src/App.jsx
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Statistics from './pages/Statistics';
import MapView from './pages/MapView';
import About from './pages/About';
import ApiDocs from './pages/ApiDocs';
import Docs from './pages/Docs';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="/map" element={<MapView />} />
          <Route path="/about" element={<About />} />
          <Route path="/api-docs" element={<ApiDocs />} />
          <Route path="/docs" element={<Docs />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
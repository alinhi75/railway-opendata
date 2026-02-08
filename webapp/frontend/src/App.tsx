// src/App.jsx
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import OnePage from './pages/OnePage';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<OnePage />} />

          {/* Backwards-compatible routes (redirect to section anchors) */}
          <Route path="/statistics" element={<Navigate to="/#statistics" replace />} />
          <Route path="/map" element={<Navigate to="/#map" replace />} />
          <Route path="/docs" element={<Navigate to="/#top" replace />} />
          <Route path="/api-docs" element={<Navigate to="/#top" replace />} />
          <Route path="/about" element={<Navigate to="/#about" replace />} />

          <Route path="*" element={<Navigate to="/#top" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
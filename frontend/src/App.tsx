import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ProfileSetup from './pages/ProfileSetup';
import Login from './pages/Login';

function App() {
  return (
    // FONDAMENTALE: basename deve essere identico al 'base' di vite.config.ts
    <Router basename="/agente/v4">
      <Routes>
        {/* Se l'utente apre la root (/agente/v4/), lo mandiamo al Login */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        
        {/* Le pagine dell'app */}
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/profile" element={<ProfileSetup />} />
      </Routes>
    </Router>
  );
}

export default App;
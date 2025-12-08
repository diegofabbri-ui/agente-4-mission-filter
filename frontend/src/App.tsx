import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ProfileSetup from './pages/ProfileSetup';
import Login from './pages/Login'; // Importa la nuova pagina

function App() {
  return (
    <Router basename="/agente/v4">
      <Routes>
        {/* Redirect root to login */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/profile" element={<ProfileSetup />} />
      </Routes>
    </Router>
  );
}

export default App;
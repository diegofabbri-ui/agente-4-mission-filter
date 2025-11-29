// src/router/AppRouter.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";

import NavBar from "../components/NavBar";

// Pagine utente (già esistenti)
import Landing from "../pages/Landing";
import ProfileSetup from "../pages/ProfileSetup";
import MissionAdder from "../pages/MissionAdder";
import AIRecommendations from "../pages/AIRecommendations";
import Dashboard from "../pages/Dashboard";
import MissionExecuting from "../pages/MissionExecuting";
import MissionResult from "../pages/MissionResult";
import MissionFeedback from "../pages/MissionFeedback";

// Pagine admin (nuove)
import AdminRoutes from "../pages/admin/AdminRoutes";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <NavBar />

      <div className="max-w-5xl mx-auto px-4 py-6">
        <Routes>

          {/* --- Rotte Utente Principali --- */}
          <Route path="/" element={<Landing />} />
          <Route path="/profile" element={<ProfileSetup />} />
          <Route path="/add-mission" element={<MissionAdder />} />
          <Route path="/ai" element={<AIRecommendations />} />
          <Route path="/dashboard" element={<Dashboard />} />

          {/* Rotte missioni */}
          <Route path="/mission/:id/execute" element={<MissionExecuting />} />
          <Route path="/mission/:id/result" element={<MissionResult />} />
          <Route path="/mission/:id/feedback" element={<MissionFeedback />} />

          {/* --- Rotte Admin (NAMESPACE) --- */}
          <Route path="/admin/*" element={<AdminRoutes />} />

          {/* --- 404 Fallback --- */}
          <Route
            path="*"
            element={<div className="text-red-500 p-6">Pagina non trovata</div>}
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

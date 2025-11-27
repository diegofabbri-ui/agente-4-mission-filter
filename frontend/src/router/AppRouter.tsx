// src/router/AppRouter.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";

import NavBar from "../components/NavBar";

import Landing from "../pages/Landing";
import ProfileSetup from "../pages/ProfileSetup";
import MissionAdder from "../pages/MissionAdder";
import AIRecommendations from "../pages/AIRecommendations";
import Dashboard from "../pages/Dashboard";
import MissionExecuting from "../pages/MissionExecuting";
import MissionResult from "../pages/MissionResult";
import MissionFeedback from "../pages/MissionFeedback";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <NavBar />

      <div className="max-w-5xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/profile" element={<ProfileSetup />} />
          <Route path="/add-mission" element={<MissionAdder />} />
          <Route path="/ai" element={<AIRecommendations />} />
          <Route path="/dashboard" element={<Dashboard />} />

          <Route path="/mission/:id/execute" element={<MissionExecuting />} />
          <Route path="/mission/:id/result" element={<MissionResult />} />
          <Route path="/mission/:id/feedback" element={<MissionFeedback />} />

          <Route
            path="*"
            element={<div className="text-red-500 p-6">Pagina non trovata</div>}
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

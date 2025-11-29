// frontend/src/router/AppRouter.tsx
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import type { ReactElement } from "react";

import NavBar from "../components/NavBar";

// Pagine utente
import Landing from "../pages/Landing";
import ProfileSetup from "../pages/ProfileSetup";
import MissionAdder from "../pages/MissionAdder";
import AIRecommendations from "../pages/AIRecommendations";
import Dashboard from "../pages/Dashboard";
import MissionExecuting from "../pages/MissionExecuting";
import MissionResult from "../pages/MissionResult";
import MissionFeedback from "../pages/MissionFeedback";

// Auth pages
import Login from "../pages/auth/Login";
import Register from "../pages/auth/Register";

// Admin
import AdminRoutes from "../pages/admin/AdminRoutes";
import { useAuth } from "../state/AuthContext";

// Guard per rotte protette
function RequireAuth({ children }: { children: ReactElement }) {
  const { token, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="text-gray-400 p-6">
        Controllo sessione in corso…
      </div>
    );
  }

  if (!token) {
    return (
      <Navigate
        to="/auth/login"
        state={{ from: location }}
        replace
      />
    );
  }

  return children;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <NavBar />

      <div className="max-w-5xl mx-auto px-4 py-6">
        <Routes>
          {/* Public */}
          <Route path="/" element={<Landing />} />
          <Route path="/auth/login" element={<Login />} />
          <Route path="/auth/register" element={<Register />} />

          {/* Utente loggato */}
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <ProfileSetup />
              </RequireAuth>
            }
          />
          <Route
            path="/add-mission"
            element={
              <RequireAuth>
                <MissionAdder />
              </RequireAuth>
            }
          />
          <Route
            path="/ai"
            element={
              <RequireAuth>
                <AIRecommendations />
              </RequireAuth>
            }
          />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />

          {/* Mission flow */}
          <Route
            path="/mission/:id/execute"
            element={
              <RequireAuth>
                <MissionExecuting />
              </RequireAuth>
            }
          />
          <Route
            path="/mission/:id/result"
            element={
              <RequireAuth>
                <MissionResult />
              </RequireAuth>
            }
          />
          <Route
            path="/mission/:id/feedback"
            element={
              <RequireAuth>
                <MissionFeedback />
              </RequireAuth>
            }
          />

          {/* Admin (qualsiasi utente loggato, per ora) */}
          <Route
            path="/admin/*"
            element={
              <RequireAuth>
                <AdminRoutes />
              </RequireAuth>
            }
          />

          {/* 404 */}
          <Route
            path="*"
            element={
              <div className="text-red-500 p-6">
                Pagina non trovata
              </div>
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

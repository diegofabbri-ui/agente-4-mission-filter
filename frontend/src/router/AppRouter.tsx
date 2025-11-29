// src/router/AppRouter.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import NavBar from "../components/NavBar";

// Auth pages
import Register from "../pages/auth/Register";
import Login from "../pages/auth/Login";

// User pages
import Landing from "../pages/Landing";
import ProfileSetup from "../pages/ProfileSetup";
import MissionAdder from "../pages/MissionAdder";
import AIRecommendations from "../pages/AIRecommendations";
import Dashboard from "../pages/Dashboard";
import MissionExecuting from "../pages/MissionExecuting";
import MissionResult from "../pages/MissionResult";
import MissionFeedback from "../pages/MissionFeedback";

// Admin
import AdminRoutes from "../pages/admin/AdminRoutes";

// Auth
import { useAuth } from "../state/AuthContext";

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { token } = useAuth(); // ✔ corretta: niente .loading

  if (!token) {
    return <Navigate to="/auth/login" replace />;
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
          <Route path="/auth/register" element={<Register />} />
          <Route path="/auth/login" element={<Login />} />

          {/* Protected */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfileSetup />
              </ProtectedRoute>
            }
          />

          <Route
            path="/add-mission"
            element={
              <ProtectedRoute>
                <MissionAdder />
              </ProtectedRoute>
            }
          />

          <Route
            path="/ai"
            element={
              <ProtectedRoute>
                <AIRecommendations />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/mission/:id/execute"
            element={
              <ProtectedRoute>
                <MissionExecuting />
              </ProtectedRoute>
            }
          />

          <Route
            path="/mission/:id/result"
            element={
              <ProtectedRoute>
                <MissionResult />
              </ProtectedRoute>
            }
          />

          <Route
            path="/mission/:id/feedback"
            element={
              <ProtectedRoute>
                <MissionFeedback />
              </ProtectedRoute>
            }
          />

          {/* Admin */}
          <Route
            path="/admin/*"
            element={
              <ProtectedRoute>
                <AdminRoutes />
              </ProtectedRoute>
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

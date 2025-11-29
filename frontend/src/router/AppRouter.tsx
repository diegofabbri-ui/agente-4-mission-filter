// frontend/src/router/AppRouter.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import { useAuth } from "../state/AuthContext";

// Pagine utente
import Landing from "../pages/Landing";
import ProfileSetup from "../pages/ProfileSetup";
import MissionAdder from "../pages/MissionAdder";
import AIRecommendations from "../pages/AIRecommendations";
import Dashboard from "../pages/Dashboard";
import MissionExecuting from "../pages/MissionExecuting";
import MissionResult from "../pages/MissionResult";
import MissionFeedback from "../pages/MissionFeedback";

// Auth
import Login from "../pages/auth/Login";
import Register from "../pages/auth/Register";

// Admin
import AdminRoutes from "../pages/admin/AdminRoutes";

export default function AppRouter() {
  const { user } = useAuth();

  return (
    <BrowserRouter>
      <NavBar />

      <div className="max-w-5xl mx-auto px-4 py-6">
        <Routes>
          {/* Pubbliche */}
          <Route path="/" element={<Landing />} />
          <Route path="/auth/login" element={<Login />} />
          <Route path="/auth/register" element={<Register />} />

          {/* Protette */}
          <Route
            path="/profile"
            element={user ? <ProfileSetup /> : <Navigate to="/auth/login" />}
          />
          <Route
            path="/add-mission"
            element={user ? <MissionAdder /> : <Navigate to="/auth/login" />}
          />
          <Route
            path="/ai"
            element={user ? <AIRecommendations /> : <Navigate to="/auth/login" />}
          />
          <Route
            path="/dashboard"
            element={user ? <Dashboard /> : <Navigate to="/auth/login" />}
          />

          {/* Missioni */}
          <Route
            path="/mission/:id/execute"
            element={user ? <MissionExecuting /> : <Navigate to="/auth/login" />}
          />
          <Route
            path="/mission/:id/result"
            element={user ? <MissionResult /> : <Navigate to="/auth/login" />}
          />
          <Route
            path="/mission/:id/feedback"
            element={user ? <MissionFeedback /> : <Navigate to="/auth/login" />}
          />

          {/* Admin */}
          <Route
            path="/admin/*"
            element={user ? <AdminRoutes /> : <Navigate to="/auth/login" />}
          />

          {/* 404 */}
          <Route
            path="*"
            element={<div className="text-red-500 p-6">Pagina non trovata</div>}
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

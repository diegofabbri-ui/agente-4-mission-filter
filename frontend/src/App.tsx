// frontend/src/App.tsx
import AppRouter from "./router/AppRouter";
import { AuthProvider } from "./state/AuthContext";

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}


// frontend/src/state/AuthContext.tsx
import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import axios from "axios";

const API_BASE =
  "https://agente-4-mission-filter-production.up.railway.app";

// -------------------------------------------
// TYPES
// -------------------------------------------
export interface User {
  id: string;
  email: string;
  fullName: string | null;
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;

  login: (params: { email: string; password: string }) => Promise<void>;
  register: (params: {
    email: string;
    password: string;
    fullName: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// -------------------------------------------
// PROVIDER
// -------------------------------------------
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // -------------------------------------------
  // CHECK SESSION ALL'AVVIO
  // -------------------------------------------
  useEffect(() => {
    async function load() {
      try {
        const res = await axios.get(`${API_BASE}/auth/me`, {
          withCredentials: true,
        });

        if (res.data?.user) {
          setUser(res.data.user);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // -------------------------------------------
  // LOGIN
  // -------------------------------------------
  async function login(params: { email: string; password: string }) {
    const res = await axios.post(`${API_BASE}/auth/login`, params, {
      withCredentials: true,
    });

    setUser(res.data.user);
  }

  // -------------------------------------------
  // REGISTER
  // -------------------------------------------
  async function register(params: {
    email: string;
    password: string;
    fullName: string;
  }) {
    const res = await axios.post(`${API_BASE}/auth/register`, params, {
      withCredentials: true,
    });

    setUser(res.data.user);
  }

  // -------------------------------------------
  // LOGOUT
  // -------------------------------------------
  async function logout() {
    await axios.post(
      `${API_BASE}/auth/logout`,
      {},
      {
        withCredentials: true,
      }
    );
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// -------------------------------------------
// HOOK
// -------------------------------------------
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth deve essere usato dentro <AuthProvider>");
  }
  return ctx;
}

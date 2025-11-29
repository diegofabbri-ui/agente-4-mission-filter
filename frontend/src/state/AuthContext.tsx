import { createContext, useContext, useState } from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL; 
// deve essere: https://agente-4-mission-filter-production.up.railway.app/api

interface AuthContextType {
  token: string | null;
  login: (data: { email: string; password: string }) => Promise<void>;
  register: (data: { email: string; password: string; fullName: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>(null as any);

export function AuthProvider({ children }: any) {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("token")
  );

  // --------------------------
  // REGISTER
  // --------------------------
  async function registerUser(data: {
    fullName: string;
    email: string;
    password: string;
  }) {
    const res = await axios.post(`${API_BASE}/auth/register`, {
      fullName: data.fullName,
      email: data.email,
      password: data.password,
    });

    localStorage.setItem("token", res.data.token);
    setToken(res.data.token);
  }

  // --------------------------
  // LOGIN
  // --------------------------
  async function login(data: { email: string; password: string }) {
    const res = await axios.post(`${API_BASE}/auth/login`, data);

    localStorage.setItem("token", res.data.token);
    setToken(res.data.token);
  }

  function logout() {
    localStorage.removeItem("token");
    setToken(null);
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        login,
        register: registerUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

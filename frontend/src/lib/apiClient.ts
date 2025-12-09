import axios from 'axios';

// URL del Backend Railway
const API_BASE_URL = "https://agente-4-mission-filter-production.up.railway.app";

const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 1. Interceptor RICHIESTA: Inserisce il token se c'è
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// 2. Interceptor RISPOSTA: Gestisce il 401 (Token scaduto/mancante)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      console.warn("⚠️ Token scaduto o non valido. Logout forzato.");
      // Pulisce i dati vecchi
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Reindirizza al Login (usando il percorso assoluto della sottocartella)
      window.location.href = '/agente/v4/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
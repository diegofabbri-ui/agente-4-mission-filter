import axios from 'axios';

// In produzione usa l'URL di Railway, in locale quello del tuo PC
const API_BASE_URL = "https://agente-4-mission-filter-production.up.railway.app"; 

const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor: Aggiunge il Token automaticamente a ogni chiamata
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token'); // Assumiamo che il login salvi qui il token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default apiClient;
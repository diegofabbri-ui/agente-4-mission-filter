// src/pages/Dashboard.tsx
import { useEffect, useState } from "react";

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // URL Railway backend
  const API_BASE = import.meta.env.VITE_API_URL ?? "https://agente-4-mission-filter-production.up.railway.app";

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);

      // Leggi token
      const token = localStorage.getItem("accessToken");

      if (!token) {
        setError("Token non presente – devi configurare il profilo prima.");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/user/dashboard`, {
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          setError(errJson?.error ?? "Errore sconosciuto");
          setLoading(false);
          return;
        }

        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError("Errore di connessione al server");
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  if (loading) {
    return <div className="p-6 text-white">Caricamento dashboard…</div>;
  }

  if (error) {
    return (
      <div className="p-6 text-red-400">
        <p>Errore nel caricamento dashboard:</p>
        <p className="font-bold">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>

      <div className="bg-gray-800 rounded-lg p-4">
        <p><strong>User:</strong> {data.userId}</p>

        <div className="mt-4">
          <p>💰 Entrate totali: {data.summary.totalEarnings}</p>
          <p>📌 Missioni completate: {data.summary.missionsCompleted}</p>
          <p>⚡ Missioni attive: {data.summary.activeMissions}</p>
          <p>🔥 Giorni di streak: {data.summary.streakDays}</p>
        </div>
      </div>
    </div>
  );
}

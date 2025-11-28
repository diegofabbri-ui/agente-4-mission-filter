// src/pages/Dashboard.tsx
import { useEffect, useState } from "react";

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Forza SEMPRE Railway
  const API_BASE = 
    import.meta.env.VITE_API_URL || 
    "https://agente-4-mission-filter-production.up.railway.app";

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);

      try {
        const res = await fetch(`${API_BASE}/api/user/dashboard`);

        if (!res.ok) {
          const errMsg = await res.json().catch(() => null);
          setError(errMsg?.error ?? `Errore HTTP ${res.status}`);
          setLoading(false);
          return;
        }

        const json = await res.json();
        setData(json);
      } catch (err) {
        setError("Impossibile contattare il server Railway");
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
        <h2 className="font-bold mb-2">Errore Dashboard</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="p-6 text-white">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>

      <div className="bg-gray-800 p-6 rounded-xl space-y-4">
        <p><strong>User ID:</strong> {data.userId}</p>
        <p><strong>Entrate totali:</strong> {data.summary.totalEarnings}</p>
        <p><strong>Missioni completate:</strong> {data.summary.missionsCompleted}</p>
        <p><strong>Missioni attive:</strong> {data.summary.activeMissions}</p>
        <p><strong>Giorni di streak:</strong> {data.summary.streakDays}</p>
      </div>
    </div>
  );
}

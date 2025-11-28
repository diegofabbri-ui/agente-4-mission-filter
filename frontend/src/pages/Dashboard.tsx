import { useEffect, useState } from "react";

interface DashboardResponse {
  userId: string;
  summary: {
    totalEarnings: number;
    missionsCompleted: number;
    activeMissions: number;
    streakDays: number;
  };
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const API_BASE = "https://agente-4-mission-filter-production.up.railway.app";

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/user/dashboard`);

        if (!res.ok) {
          const text = await res.text();
          setError(`Errore ${res.status}: ${text}`);
          setLoading(false);
          return;
        }

        const json = (await res.json()) as DashboardResponse;
        setData(json);
      } catch (e: any) {
        setError("Impossibile raggiungere il server.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6 text-white">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      {loading && <p>Caricamento…</p>}

      {error && (
        <div className="bg-red-900/40 p-4 rounded-xl text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <div className="bg-gray-900 border border-gray-700 p-6 rounded-xl space-y-4 shadow-xl">
          <div>
            <p className="text-sm opacity-60">User ID</p>
            <p className="text-lg font-semibold">{data.userId}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="opacity-60 text-sm">Entrate totali</p>
              <p className="text-2xl font-bold">
                € {data.summary.totalEarnings.toFixed(2)}
              </p>
            </div>

            <div>
              <p className="opacity-60 text-sm">Missioni completate</p>
              <p className="text-2xl font-bold">
                {data.summary.missionsCompleted}
              </p>
            </div>

            <div>
              <p className="opacity-60 text-sm">Missioni attive</p>
              <p className="text-2xl font-bold">
                {data.summary.activeMissions}
              </p>
            </div>

            <div>
              <p className="opacity-60 text-sm">Streak (giorni)</p>
              <p className="text-2xl font-bold">{data.summary.streakDays}</p>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && !data && (
        <p className="text-gray-400">Nessun dato disponibile.</p>
      )}
    </div>
  );
}

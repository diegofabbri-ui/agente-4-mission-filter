// src/pages/Dashboard.tsx
import { useEffect, useState } from "react";
import axios from "axios";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
);

interface MonthlyEarning {
  month: string; // es: "2025-11"
  total: number;
}

interface DashboardSummary {
  totalEarnings: number;
  missionsCompleted: number;
  activeMissions: number;
  streakDays: number;
  monthlyEarnings?: MonthlyEarning[];
}

interface DashboardResponse {
  userId: string;
  summary: DashboardSummary;
}

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get<DashboardResponse>(
          `${API_BASE_URL}/api/user/dashboard`,
          { headers: getAuthHeaders() },
        );
        setSummary(res.data.summary);
      } catch (err: any) {
        if (err?.response?.status === 401) {
          setError("Non sei autenticato. Effettua il login prima.");
        } else {
          setError("Errore nel recupero della dashboard utente.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  const monthlyData = summary?.monthlyEarnings ?? [];

  const chartData = {
    labels: monthlyData.map((m) => m.month),
    datasets: [
      {
        label: "Entrate nette mensili (€)",
        data: monthlyData.map((m) => m.total),
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { display: true },
    },
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {loading && <p className="text-sm text-gray-500">Caricamento...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {summary && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-500">Entrate totali</p>
              <p className="text-xl font-semibold">
                €{summary.totalEarnings.toFixed(2)}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-500">Missioni completate</p>
              <p className="text-xl font-semibold">
                {summary.missionsCompleted}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-500">Missioni attive</p>
              <p className="text-xl font-semibold">{summary.activeMissions}</p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-500">Streak (giorni)</p>
              <p className="text-xl font-semibold">{summary.streakDays}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <h2 className="text-sm font-semibold mb-2">
              Andamento entrate mensili
            </h2>
            {monthlyData.length === 0 ? (
              <p className="text-xs text-gray-500">
                Nessun dato mensile ancora disponibile. Quando inizierai a
                completare missioni con earnings verificate, vedrai il grafico
                popolarsi.
              </p>
            ) : (
              <Line data={chartData} options={chartOptions} />
            )}
          </div>
        </>
      )}

      {!loading && !error && !summary && (
        <p className="text-sm text-gray-500">
          Nessun dato ancora disponibile. Completa qualche missione per
          iniziare a popolare la dashboard.
        </p>
      )}
    </div>
  );
}

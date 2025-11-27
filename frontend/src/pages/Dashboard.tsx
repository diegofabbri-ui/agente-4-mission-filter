// src/pages/Dashboard.tsx
import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

interface DashboardSummary {
  totalEarnings: number;
  missionsCompleted: number;
  activeMissions: number;
  streakDays: number;
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
          setError(
            "Non sei autenticato. Assicurati di avere un token valido in localStorage.",
          );
        } else {
          setError("Errore nel caricamento della dashboard utente.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  return (
    <div className="space-y-8 py-6">
      <header className="space-y-2">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          Dashboard
        </h1>
        <p className="text-sm text-gray-600 max-w-xl">
          Qui vedi una sintesi delle tue missioni e delle entrate gestite
          tramite Agente 4. L’obiettivo è semplice: meno sbatti mentale,
          più decisioni basate sui numeri.
        </p>
      </header>

      {/* stato richiesta */}
      {loading && (
        <p className="text-sm text-gray-500">Caricamento dati dashboard…</p>
      )}

      {error && (
        <div className="border border-red-200 bg-red-50 text-red-700 text-sm rounded-xl p-4">
          {error}
        </div>
      )}

      {/* CARDS METRICHE */}
      {summary && (
        <section className="grid md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-1">
            <p className="text-xs font-semibold uppercase text-gray-500">
              Entrate totali
            </p>
            <p className="text-2xl font-bold">
              €{summary.totalEarnings.toFixed(2)}
            </p>
            <p className="text-xs text-gray-500">
              Somma delle missioni completate.
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-1">
            <p className="text-xs font-semibold uppercase text-gray-500">
              Missioni completate
            </p>
            <p className="text-2xl font-bold">
              {summary.missionsCompleted}
            </p>
            <p className="text-xs text-gray-500">
              Task portati fino in fondo.
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-1">
            <p className="text-xs font-semibold uppercase text-gray-500">
              Missioni attive
            </p>
            <p className="text-2xl font-bold">
              {summary.activeMissions}
            </p>
            <p className="text-xs text-gray-500">
              Cose su cui stai ancora lavorando.
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-1">
            <p className="text-xs font-semibold uppercase text-gray-500">
              Streak (giorni)
            </p>
            <p className="text-2xl font-bold">
              {summary.streakDays}
            </p>
            <p className="text-xs text-gray-500">
              Giorni consecutivi con attività registrata.
            </p>
          </div>
        </section>
      )}

      {/* SE NIENTE DATI */}
      {!loading && !error && !summary && (
        <section className="border border-dashed border-gray-300 rounded-xl p-6 bg-white">
          <p className="text-sm text-gray-600 mb-3">
            Ancora nessun dato in dashboard.  
            Configura il profilo e aggiungi qualche missione per vedere le
            prime stats.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/profile"
              className="inline-flex items-center rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900"
            >
              Configura il profilo
            </Link>
            <Link
              to="/add-mission"
              className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-white"
            >
              Aggiungi una missione
            </Link>
            <Link
              to="/ai"
              className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-white"
            >
              Vedi raccomandazioni AI
            </Link>
          </div>
        </section>
      )}

      {/* SEZIONE AZIONI RAPIDE */}
      <section className="grid md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-2">
          <h2 className="text-sm font-semibold text-gray-800">
            Azioni rapide
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            Le tre mosse base per far lavorare al massimo l’Agente 4.
          </p>
          <ul className="text-sm text-gray-700 space-y-2 list-disc list-inside">
            <li>
              <Link to="/profile" className="underline">
                Raffina il tuo profilo
              </Link>{" "}
              se cambiano le tue tariffe o priorità.
            </li>
            <li>
              <Link to="/add-mission" className="underline">
                Aggiungi nuove missioni
              </Link>{" "}
              ogni volta che trovi offerte interessanti.
            </li>
            <li>
              <Link to="/ai" className="underline">
                Controlla le raccomandazioni AI
              </Link>{" "}
              prima di candidarti o accettare.
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-2">
          <h2 className="text-sm font-semibold text-gray-800">
            Insight futuri (coming soon)
          </h2>
          <p className="text-xs text-gray-500">
            Qui vedrai grafici su guadagni nel tempo, categorie più profittevoli
            e rischio medio delle missioni accettate. Per ora è una sezione
            “work in progress”, ma la struttura è già pronta.
          </p>
        </div>
      </section>
    </div>
  );
}

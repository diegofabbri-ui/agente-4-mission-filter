// src/pages/MissionResult.tsx
import { useEffect, useState } from "react";
import axios from "axios";
import { useLocation, useNavigate, useParams } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

interface MissionDetail {
  id: string;
  title: string;
  rewardAmount?: number | null;
}

interface MissionResponse {
  data: MissionDetail;
}

interface LocationState {
  missionTitle?: string;
  rewardAmount?: number | null;
  timeSpentMinutes?: number | null;
}

export default function MissionResult() {
  const { missionId } = useParams<{ missionId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const navState = (location.state as LocationState) || {};

  const [mission, setMission] = useState<MissionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedTitle = mission?.title ?? navState.missionTitle ?? "Missione";
  const resolvedReward =
    mission?.rewardAmount ?? navState.rewardAmount ?? null;
  const resolvedTime = navState.timeSpentMinutes ?? null;

  useEffect(() => {
    if (!missionId) return;

    // Se manca titolo o reward dalla navigation, proviamo a fetchare
    if (!navState.missionTitle || navState.rewardAmount === undefined) {
      const fetchMission = async () => {
        setLoading(true);
        setError(null);
        try {
          const res = await axios.get<MissionResponse>(
            `${API_BASE_URL}/api/missions/${missionId}`,
            { headers: getAuthHeaders() },
          );
          setMission(res.data.data);
        } catch (err: any) {
          if (err?.response?.status === 401) {
            setError("Non sei autenticato. Effettua il login prima.");
          } else {
            setError("Errore nel recupero dei dati della missione.");
          }
        } finally {
          setLoading(false);
        }
      };

      fetchMission();
    }
  }, [missionId, navState.missionTitle, navState.rewardAmount]);

  const handleGoToFeedback = () => {
    if (!missionId) return;
    navigate(`/missions/${missionId}/feedback`);
  };

  const handleGoBackToRecommendations = () => {
    navigate("/ai/recommendations");
  };

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
      {loading && (
        <p className="text-sm text-slate-400">
          Aggiorno i dati della missione…
        </p>
      )}
      {error && <p className="text-sm text-rose-500">{error}</p>}

      <section className="space-y-4 rounded-2xl border border-emerald-600/60 bg-emerald-950/40 p-6 text-center shadow-md shadow-emerald-900/40">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/60">
          <span className="text-2xl">✅</span>
        </div>
        <h1 className="text-2xl font-bold text-emerald-100">
          Missione completata
        </h1>
        <p className="text-sm text-emerald-50/90">
          Hai chiuso <span className="font-semibold">{resolvedTitle}</span>.
          L&apos;agente userà questa esperienza per calibrare ancora meglio le
          prossime raccomandazioni.
        </p>

        <div className="mt-3 grid gap-3 text-sm text-emerald-50/90 sm:grid-cols-2">
          {resolvedReward != null && (
            <div className="rounded-xl bg-emerald-900/50 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-300/90">
                Ricavo stimato
              </p>
              <p className="text-lg font-semibold">
                €{resolvedReward.toFixed(2)}
              </p>
            </div>
          )}

          {resolvedTime != null && (
            <div className="rounded-xl bg-emerald-900/50 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-300/90">
                Tempo impiegato
              </p>
              <p className="text-lg font-semibold">
                {resolvedTime} min
              </p>
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={handleGoToFeedback}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
          >
            Lascia un feedback sulla missione
          </button>
          <button
            onClick={handleGoBackToRecommendations}
            className="inline-flex items-center justify-center rounded-lg border border-emerald-400/70 bg-transparent px-4 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-900/40"
          >
            Torna alle raccomandazioni AI
          </button>
        </div>
      </section>
    </main>
  );
}

// src/pages/MissionFeedback.tsx
import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

interface MissionDetail {
  id: string;
  title: string;
}

interface MissionResponse {
  data: MissionDetail;
}

export default function MissionFeedback() {
  const { missionId } = useParams<{ missionId: string }>();
  const navigate = useNavigate();

  const [mission, setMission] = useState<MissionDetail | null>(null);
  const [loadingMission, setLoadingMission] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rating, setRating] = useState<number>(5);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!missionId) {
      setError("ID missione non presente nell'URL.");
      return;
    }

    const fetchMission = async () => {
      setLoadingMission(true);
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
        } else if (err?.response?.status === 404) {
          setError("Missione non trovata.");
        } else {
          setError("Errore nel recupero dei dati della missione.");
        }
      } finally {
        setLoadingMission(false);
      }
    };

    fetchMission();
  }, [missionId]);

  const handleSubmit = async () => {
    if (!missionId) return;

    setSubmitting(true);
    setError(null);
    try {
      await axios.post(
        `${API_BASE_URL}/api/missions/${missionId}/feedback`,
        {
          rating,
          comment: comment.trim() || undefined,
        },
        { headers: getAuthHeaders() },
      );
      setSubmitted(true);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        setError("Non sei autenticato. Effettua il login prima.");
      } else {
        setError("Errore durante l'invio del feedback.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const effectiveRating = hoveredRating ?? rating;

  const handleGoToDashboard = () => {
    navigate("/dashboard");
  };

  const handleGoToRecommendations = () => {
    navigate("/ai/recommendations");
  };

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-50">
          Feedback missione
        </h1>
        <p className="text-sm text-slate-400">
          Il tuo rating aiuta l&apos;agente a capire quali missioni
          valorizzano davvero il tuo tempo.
        </p>
      </header>

      {loadingMission && (
        <p className="text-sm text-slate-400">
          Caricamento informazioni sulla missione…
        </p>
      )}
      {error && <p className="text-sm text-rose-500">{error}</p>}

      {mission && (
        <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Missione completata
            </p>
            <h2 className="text-lg font-semibold text-slate-50">
              {mission.title}
            </h2>
          </div>

          {/* Rating stars */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-200">
              Come valuteresti questa missione?
            </p>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((value) => {
                const active = value <= effectiveRating;
                return (
                  <button
                    key={value}
                    type="button"
                    onMouseEnter={() => setHoveredRating(value)}
                    onMouseLeave={() => setHoveredRating(null)}
                    onClick={() => setRating(value)}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900"
                  >
                    <span
                      className={`text-xl ${
                        active ? "text-amber-400" : "text-slate-500"
                      }`}
                    >
                      ★
                    </span>
                  </button>
                );
              })}
              <span className="ml-2 text-sm text-slate-300">
                {rating}/5
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              1 = pessima esperienza · 5 = ottima missione, da rifare subito.
            </p>
          </div>

          {/* Comment */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-200">
              Vuoi aggiungere un commento? <span className="text-slate-500">(opzionale)</span>
            </label>
            <textarea
              className="h-28 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 focus:border-indigo-500"
              placeholder="Es. compenso ok, ma piattaforma lenta. Oppure: missione super chiara, vorrei più task così."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          {/* CTA */}
          {!submitted ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Invio feedback…" : "Invia feedback"}
              </button>
            </div>
          ) : (
            <div className="space-y-4 rounded-xl border border-emerald-600/60 bg-emerald-950/40 p-4 text-sm text-emerald-50">
              <p className="font-semibold">
                Grazie, feedback ricevuto ✅
              </p>
              <p className="text-emerald-100/90">
                Il rating verrà usato per affinare le prossime missioni che
                l&apos;agente ti propone.
              </p>

              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={handleGoToDashboard}
                  className="rounded-lg border border-emerald-400/70 bg-transparent px-4 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-900/40"
                >
                  Vai alla dashboard
                </button>
                <button
                  type="button"
                  onClick={handleGoToRecommendations}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
                >
                  Torna alle raccomandazioni AI
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

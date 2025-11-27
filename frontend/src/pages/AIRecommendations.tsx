// src/pages/AIRecommendations.tsx
import { useEffect, useState } from "react";
import axios from "axios";
import {
  MissionCard,
  type MissionSummary,
  type AIMissionMeta,
} from "../components/MissionCard";
import { AIExplanation } from "../components/AIExplanation";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

interface RecommendedMission {
  id: string;
  title: string;
  description: string | null;
  rewardAmount?: number | null;
  estimatedHours?: number | null;
  deadline?: string | null;
  sourceUrl?: string | null;
  totalScore?: number | null;
  reasoning?: string | null;
  isScam?: boolean;
}

interface RecommendedResponse {
  userId: string;
  limit: number;
  data: RecommendedMission[];
}

export default function AIRecommendations() {
  const [missions, setMissions] = useState<RecommendedMission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const fetchRecommended = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get<RecommendedResponse>(
          `${API_BASE_URL}/api/missions/recommended?limit=5`,
          { headers: getAuthHeaders() },
        );

        setMissions(res.data.data ?? []);
      } catch (err: any) {
        if (err?.response?.status === 401) {
          setError("Non sei autenticato. Effettua il login prima.");
        } else {
          setError("Errore nel recupero delle missioni consigliate.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchRecommended();
  }, []);

  const handleAccept = async (id: string) => {
    setAcceptingId(id);
    setError(null);
    try {
      await axios.post(
        `${API_BASE_URL}/api/missions/${id}/accept`,
        { feedbackRating: 5 },
        { headers: getAuthHeaders() },
      );

      setAcceptedIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    } catch (err: any) {
      if (err?.response?.status === 401) {
        setError("Non sei autenticato. Effettua il login prima.");
      } else {
        setError("Errore durante l'accettazione della missione.");
      }
    } finally {
      setAcceptingId(null);
    }
  };

  const formatDeadline = (deadline: string | null | undefined) => {
    if (!deadline) return null;
    try {
      const d = new Date(deadline);
      if (Number.isNaN(d.getTime())) return null;
      return d.toLocaleString();
    } catch {
      return null;
    }
  };

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-50">
          Raccomandazioni AI
        </h1>
        <p className="text-sm text-slate-400">
          Qui vedi le missioni con il miglior rapporto tra tempo, compenso e
          rischio secondo il motore W-MOON.
        </p>
      </header>

      {loading && (
        <p className="text-sm text-slate-400">Caricamento raccomandazioni…</p>
      )}
      {error && <p className="text-sm text-rose-500">{error}</p>}

      {!loading && !error && missions.length === 0 && (
        <p className="text-sm text-slate-400">
          Nessuna raccomandazione disponibile. Aggiungi qualche missione e
          lanciala attraverso il filtro AI.
        </p>
      )}

      <section className="space-y-4">
        {missions.map((m, index) => {
          const isAccepted = acceptedIds.has(m.id);
          const isRisky = m.isScam === true;
          const deadlineLabel = formatDeadline(m.deadline);

          const mission: MissionSummary = {
            id: m.id,
            title: m.title,
            description: m.description ?? undefined,
            payout:
              typeof m.rewardAmount === "number" ? m.rewardAmount : undefined,
            currency: "€",
            estimatedMinutes:
              typeof m.estimatedHours === "number"
                ? m.estimatedHours * 60
                : undefined,
            url: m.sourceUrl ?? undefined,
          };

          const overallScore = m.totalScore ?? 0;

          const ai: AIMissionMeta = {
            overallScore,
            isScam: isRisky,
            riskLabel: undefined, // puoi mappare livelli di rischio più granulari in futuro
            factors: [], // se in futuro l'API espone il breakdown, lo agganci qui
            reasoning: m.reasoning ?? undefined,
          };

          const showExplanation =
            index === 0 && Boolean(m.reasoning && m.reasoning.trim().length);

          return (
            <div
              key={m.id}
              className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/70 p-4"
            >
              <MissionCard
                mission={mission}
                ai={ai}
                onSelect={() => setSelectedMissionId(m.id)}
                onAccept={
                  !isRisky && !isAccepted && acceptingId !== m.id
                    ? () => handleAccept(m.id)
                    : undefined
                }
              />

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center gap-2">
                  {isAccepted && (
                    <span className="font-medium text-emerald-400">
                      Già accettata
                    </span>
                  )}
                  {isRisky && (
                    <span className="font-medium text-rose-400">
                      Bloccata per rischio alto
                    </span>
                  )}
                  {acceptingId === m.id && !isAccepted && !isRisky && (
                    <span>Invio accettazione…</span>
                  )}
                  {selectedMissionId === m.id && !isRisky && !isAccepted && (
                    <span className="text-slate-500">
                      Clicca su &quot;Accetta missione&quot; per bloccarla.
                    </span>
                  )}
                </div>

                {deadlineLabel && (
                  <span className="text-[11px] text-slate-500">
                    Deadline: {deadlineLabel}
                  </span>
                )}
              </div>

              {showExplanation && (
                <AIExplanation
                  overallScore={ai.overallScore}
                  factors={ai.factors}
                  reasoning={ai.reasoning}
                  compact
                />
              )}
            </div>
          );
        })}
      </section>
    </main>
  );
}

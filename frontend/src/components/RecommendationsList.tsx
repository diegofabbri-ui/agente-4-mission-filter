// src/components/RecommendationsList.tsx
import React, { useEffect, useState } from "react";
import axios from "axios";

// Import normale del componente
import { MissionCard } from "./MissionCard";

// Import SOLO dei tipi (richiesto da verbatimModuleSyntax)
import type {
  MissionSummary,
  AIMissionMeta,
  ScoreFactor,
} from "./MissionCard";

import { AIExplanation } from "./AIExplanation";

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

// Tipo missione proveniente dal backend
export type RecommendedMissionApi = {
  id: string;
  title: string;
  description?: string;
  platform?: string;
  payout?: number;
  currency?: string;
  estimatedMinutes?: number;
  url?: string;
  aiScore: {
    overall: number;
    isScam: boolean;
    riskLabel?: string;
    factors: ScoreFactor[];
    reasoning?: string;
  };
};

type RecommendationsListProps = {
  limit?: number;
  token?: string;
  showExplanationForFirst?: boolean;
  onSelectMission?: (mission: RecommendedMissionApi) => void;
  onAcceptMission?: (mission: RecommendedMissionApi) => void;
};

export const RecommendationsList: React.FC<RecommendationsListProps> = ({
  limit = 5,
  token,
  showExplanationForFirst = true,
  onSelectMission,
  onAcceptMission,
}) => {
  const [missions, setMissions] = useState<RecommendedMissionApi[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchRecommendations = async () => {
      setLoading(true);
      setError(null);

      try {
        const headers: Record<string, string> = {};
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await axios.get<RecommendedMissionApi[]>(
          `${API_BASE_URL}/api/missions/recommended`,
          { headers }
        );

        if (cancelled) return;

        const data = response.data ?? [];
        const sliced = limit > 0 ? data.slice(0, limit) : data;
        setMissions(sliced);
      } catch (err: any) {
        if (!cancelled) {
          setError(
            err?.response?.data?.message ??
              "Errore nel recupero delle missioni consigliate."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchRecommendations();

    return () => {
      cancelled = true;
    };
  }, [limit, token]);

  const handleSelect = (mission: RecommendedMissionApi) => {
    onSelectMission?.(mission);
  };

  const handleAccept = (mission: RecommendedMissionApi) => {
    onAcceptMission?.(mission);
  };

  // --- LOADING ---
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
        <p className="text-sm text-slate-300">Carico le tue missioni top…</p>
      </div>
    );
  }

  // --- ERROR ---
  if (error) {
    return (
      <div className="rounded-xl border border-rose-800/80 bg-rose-950/50 p-4">
        <p className="text-sm font-semibold text-rose-200">
          Qualcosa è andato storto
        </p>
        <p className="mt-1 text-xs text-rose-200/80">{error}</p>
      </div>
    );
  }

  // --- EMPTY ---
  if (!missions.length) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
        <p className="text-sm text-slate-300">
          Nessuna missione consigliata al momento.  
          Aggiungi missioni o aggiorna il profilo per far lavorare l’agente.
        </p>
      </div>
    );
  }

  // --- CONTENT ---
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Missioni consigliate dall&apos;AI
          </h2>
          <p className="text-xs text-slate-500">
            Top {missions.length} missioni ottimizzate sul tuo profilo.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {missions.map((m, index) => {
          const mission: MissionSummary = {
            id: m.id,
            title: m.title,
            description: m.description,
            platform: m.platform,
            payout: m.payout,
            currency: m.currency,
            estimatedMinutes: m.estimatedMinutes,
            url: m.url,
          };

          const ai: AIMissionMeta = {
            overallScore: m.aiScore.overall,
            isScam: m.aiScore.isScam,
            riskLabel: m.aiScore.riskLabel,
            factors: m.aiScore.factors,
            reasoning: m.aiScore.reasoning,
          };

          return (
            <div key={m.id} className="space-y-3">
              <MissionCard
                mission={mission}
                ai={ai}
                onSelect={() => handleSelect(m)}
                onAccept={() => handleAccept(m)}
              />

              {showExplanationForFirst && index === 0 && (
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
      </div>
    </div>
  );
};

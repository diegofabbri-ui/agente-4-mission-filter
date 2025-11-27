// src/pages/MissionExecuting.tsx
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
  description: string | null;
  rewardAmount?: number | null;
  estimatedHours?: number | null;
  deadline?: string | null;
  sourceUrl?: string | null;
}

interface MissionResponse {
  data: MissionDetail;
}

interface StepDef {
  id: string;
  title: string;
  description: string;
}

const DEFAULT_STEPS: StepDef[] = [
  {
    id: "prep",
    title: "1. Preparazione",
    description:
      "Apri il link della missione, leggi tutte le istruzioni e verifica che il compenso e le condizioni siano coerenti.",
  },
  {
    id: "execute",
    title: "2. Esecuzione",
    description:
      "Completa le azioni richieste (compilare form, inviare file, creare contenuti, ecc.) seguendo passo-passo le linee guida.",
  },
  {
    id: "proof",
    title: "3. Conferma & prova",
    description:
      "Salva eventuali screenshot / ID della consegna e assicurati che il sistema della piattaforma segni la missione come inviata.",
  },
];

export default function MissionExecuting() {
  const { missionId } = useParams<{ missionId: string }>();
  const navigate = useNavigate();

  const [mission, setMission] = useState<MissionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(
    () => new Set(),
  );
  const [notes, setNotes] = useState("");
  const [timeSpentMinutes, setTimeSpentMinutes] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!missionId) {
      setError("ID missione non presente nell'URL.");
      return;
    }

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
        } else if (err?.response?.status === 404) {
          setError("Missione non trovata.");
        } else {
          setError("Errore nel recupero dei dettagli della missione.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchMission();
  }, [missionId]);

  const steps = DEFAULT_STEPS;
  const currentStep = steps[currentStepIndex];
  const isLastStep = currentStepIndex === steps.length - 1;

  const progressPercent =
    steps.length > 0
      ? Math.round(
          ((currentStepIndex + (completedSteps.has(currentStep.id) ? 1 : 0)) /
            steps.length) *
            100,
        )
      : 0;

  const toggleStepCompleted = (stepId: string) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  const handleNext = () => {
    if (!completedSteps.has(currentStep.id)) {
      toggleStepCompleted(currentStep.id);
    }
    if (!isLastStep) {
      setCurrentStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
    }
  };

  const handlePrev = () => {
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleCompleteMission = async () => {
    if (!mission || !missionId) return;

    setSubmitting(true);
    setError(null);

    try {
      await axios.post(
        `${API_BASE_URL}/api/missions/${missionId}/complete`,
        {
          status: "completed",
          notes: notes.trim() || undefined,
          timeSpentMinutes:
            typeof timeSpentMinutes === "number" ? timeSpentMinutes : undefined,
        },
        { headers: getAuthHeaders() },
      );

      navigate(`/missions/${missionId}/result`, {
        state: {
          missionTitle: mission.title,
          rewardAmount: mission.rewardAmount ?? null,
          timeSpentMinutes:
            typeof timeSpentMinutes === "number" ? timeSpentMinutes : null,
        },
      });
    } catch (err: any) {
      if (err?.response?.status === 401) {
        setError("Non sei autenticato. Effettua il login prima.");
      } else {
        setError("Errore durante la chiusura della missione.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canComplete =
    steps.every((s) => completedSteps.has(s.id) || s.id === currentStep.id) &&
    isLastStep;

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-50">
          Esecuzione missione
        </h1>
        <p className="text-sm text-slate-400">
          Segui gli step per completare la missione in modo pulito e
          tracciabile.
        </p>
      </header>

      {loading && (
        <p className="text-sm text-slate-400">Caricamento dettagli missione…</p>
      )}
      {error && <p className="text-sm text-rose-500">{error}</p>}

      {!loading && !mission && !error && (
        <p className="text-sm text-slate-400">Nessuna missione da mostrare.</p>
      )}

      {mission && (
        <>
          {/* Mission summary */}
          <section className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-slate-50">
                  {mission.title}
                </h2>
                {mission.description && (
                  <p className="text-sm text-slate-300">
                    {mission.description}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                  {mission.rewardAmount != null && (
                    <span>💰 Ricavo previsto: €{mission.rewardAmount}</span>
                  )}
                  {mission.estimatedHours != null && (
                    <span>⏱ Stima: {mission.estimatedHours}h</span>
                  )}
                  {mission.deadline && (
                    <span>
                      📅 Deadline:{" "}
                      {new Date(mission.deadline).toLocaleString("it-IT")}
                    </span>
                  )}
                </div>

                {mission.sourceUrl && (
                  <a
                    href={mission.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs font-semibold text-indigo-300 hover:text-indigo-200"
                  >
                    Apri missione sulla piattaforma ↗
                  </a>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Progressione step</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </section>

          {/* Step-by-step */}
          <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Step {currentStepIndex + 1} di {steps.length}
                </p>
                <h3 className="text-base font-semibold text-slate-50">
                  {currentStep.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => toggleStepCompleted(currentStep.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  completedSteps.has(currentStep.id)
                    ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/60"
                    : "bg-slate-800 text-slate-200 border border-slate-700"
                }`}
              >
                {completedSteps.has(currentStep.id)
                  ? "Segnato come completato"
                  : "Segna step come fatto"}
              </button>
            </div>

            <p className="text-sm text-slate-300">{currentStep.description}</p>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handlePrev}
                disabled={currentStepIndex === 0}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Step precedente
              </button>

              {!isLastStep && (
                <button
                  type="button"
                  onClick={handleNext}
                  className="rounded-lg bg-indigo-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-indigo-400"
                >
                  Avanti
                </button>
              )}

              {isLastStep && (
                <button
                  type="button"
                  onClick={handleCompleteMission}
                  disabled={submitting || !canComplete}
                  className="rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Chiudo la missione…" : "Segna missione completata"}
                </button>
              )}
            </div>
          </section>

          {/* Notes & time tracking */}
          <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <h3 className="text-sm font-semibold text-slate-50">
              Note e tempo impiegato
            </h3>

            <div className="grid gap-3 md:grid-cols-[2fr,1fr]">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">
                  Note personali (opzionale)
                </label>
                <textarea
                  className="h-24 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 focus:border-indigo-500"
                  placeholder="Es. dove hai trovato difficoltà, dettagli utili per ricordarti come hai fatto..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">
                  Minuti impiegati (opzionale)
                </label>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 focus:border-indigo-500"
                  value={timeSpentMinutes}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "") {
                      setTimeSpentMinutes("");
                    } else {
                      const parsed = Number(value);
                      if (!Number.isNaN(parsed) && parsed >= 0) {
                        setTimeSpentMinutes(parsed);
                      }
                    }
                  }}
                  placeholder="Es. 45"
                />
                <p className="text-[11px] text-slate-500">
                  Questo dato aiuta a calibrare meglio le future raccomandazioni.
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

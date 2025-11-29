// frontend/src/pages/ProfileSetup.tsx
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import api from "../lib/apiClient";

const profileSchema = z.object({
  fullName: z.string().min(1, "Inserisci il tuo nome").max(100),
  minHourlyRate: z.coerce
    .number()
    .min(0, "La tariffa minima non può essere negativa")
    .max(1000, "Valore troppo alto"),
  preferredCategories: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

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

export default function ProfileSetup() {
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(true);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    defaultValues: {
      fullName: "",
      minHourlyRate: 15,
      preferredCategories: "",
    },
  });

  const [saveStatus, setSaveStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Dashboard lato destro (stessi dati della dashboard principale)
  useEffect(() => {
    async function loadDashboard() {
      setLoadingDashboard(true);
      setDashboardError(null);

      try {
        const res = await api.get("/user/dashboard");
        const data = res.data as DashboardResponse;
        setDashboard(data.summary);
      } catch (err: any) {
        if (err?.response?.status === 401) {
          setDashboardError("Devi prima effettuare il login.");
        } else {
          setDashboardError("Errore nel caricamento della dashboard.");
        }
      } finally {
        setLoadingDashboard(false);
      }
    }

    loadDashboard();
  }, []);

  // Salvataggio profilo
  const onSubmit = async (values: ProfileFormValues) => {
    setSaveError(null);
    setSaveStatus("idle");

    try {
      const parsed = profileSchema.parse(values);

      const preferred =
        parsed.preferredCategories
          ?.split(",")
          .map((v) => v.trim())
          .filter(Boolean) ?? [];

      await api.patch("/user/profile", {
        fullName: parsed.fullName,
        minHourlyRate: parsed.minHourlyRate,
        preferredCategories: preferred,
      });

      setSaveStatus("success");
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        const fieldErrors = err.flatten().fieldErrors;
        for (const [key, messages] of Object.entries(fieldErrors)) {
          if (Array.isArray(messages) && messages.length > 0) {
            setError(key as any, {
              type: "manual",
              message: messages[0],
            });
          }
        }
        setSaveStatus("error");
        setSaveError("Ci sono errori nei dati inseriti.");
        return;
      }

      if (err?.response?.status === 401) {
        setSaveError("Sessione scaduta: rifai login.");
      } else {
        setSaveError("Errore durante il salvataggio del profilo.");
      }

      setSaveStatus("error");
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-6 text-white">
      <div className="flex flex-col md:flex-row gap-8">
        {/* LEFT: form profilo */}
        <section className="flex-1 space-y-4">
          <h1 className="text-3xl font-bold">Profilo utente</h1>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="mt-4 space-y-4 bg-gray-900 border border-gray-700 p-6 rounded-xl"
          >
            {/* Nome */}
            <div>
              <label className="block text-sm opacity-70 mb-1">
                Nome completo
              </label>
              <input
                type="text"
                {...register("fullName")}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
              />
              {errors.fullName && (
                <p className="text-red-400 text-xs mt-1">
                  {errors.fullName.message}
                </p>
              )}
            </div>

            {/* Tariffa */}
            <div>
              <label className="block text-sm opacity-70 mb-1">
                Tariffa minima (€)
              </label>
              <input
                type="number"
                {...register("minHourlyRate", { valueAsNumber: true })}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
              />
              {errors.minHourlyRate && (
                <p className="text-red-400 text-xs mt-1">
                  {errors.minHourlyRate.message}
                </p>
              )}
            </div>

            {/* Categorie */}
            <div>
              <label className="block text-sm opacity-70 mb-1">
                Categorie preferite (separate da virgola)
              </label>
              <textarea
                rows={3}
                {...register("preferredCategories")}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
              />
            </div>

            {saveError && (
              <p className="text-red-400 text-sm">{saveError}</p>
            )}
            {saveStatus === "success" && (
              <p className="text-green-400 text-sm">
                Profilo salvato con successo!
              </p>
            )}

            <button
              type="submit"
              className="bg-blue-600 px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-semibold"
            >
              {isSubmitting ? "Salvataggio…" : "Salva profilo"}
            </button>
          </form>
        </section>

        {/* RIGHT: mini-dashboard */}
        <section className="w-full md:w-80 space-y-4">
          <h2 className="text-xl font-bold">Pannello di controllo</h2>

          <div className="bg-gray-900 border border-gray-700 p-6 rounded-xl text-sm space-y-3">
            {loadingDashboard && <p>Caricamento dashboard…</p>}

            {dashboardError && (
              <p className="text-red-400">{dashboardError}</p>
            )}

            {dashboard && (
              <div className="space-y-2">
                <p>
                  <strong>Entrate totali:</strong> €
                  {dashboard.totalEarnings.toFixed(2)}
                </p>
                <p>
                  <strong>Missioni completate:</strong>{" "}
                  {dashboard.missionsCompleted}
                </p>
                <p>
                  <strong>Missioni attive:</strong>{" "}
                  {dashboard.activeMissions}
                </p>
                <p>
                  <strong>Streak:</strong> {dashboard.streakDays} giorni
                </p>
              </div>
            )}

            {!loadingDashboard && !dashboard && !dashboardError && (
              <p>Nessun dato disponibile.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

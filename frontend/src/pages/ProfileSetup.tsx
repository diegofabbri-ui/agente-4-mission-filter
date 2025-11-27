// src/pages/ProfileSetup.tsx
import { useEffect, useState } from "react";
import axios from "axios";
import { z } from "zod";
import { useForm } from "react-hook-form";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

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
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

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

  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  // Legge snapshot dashboard (FILE #1 logico: primo dato reale dell’utente)
  useEffect(() => {
    const fetchDashboard = async () => {
      setLoadingDashboard(true);
      setDashboardError(null);
      try {
        const res = await axios.get<DashboardResponse>(
          `${API_BASE_URL}/api/user/dashboard`,
          { headers: getAuthHeaders() },
        );
        setDashboard(res.data.summary);
      } catch (err: any) {
        if (err?.response?.status === 401) {
          setDashboardError("Non sei autenticato. Effettua il login prima.");
        } else {
          setDashboardError("Impossibile caricare la dashboard utente.");
        }
      } finally {
        setLoadingDashboard(false);
      }
    };

    fetchDashboard();
  }, []);

  const onSubmit = async (values: ProfileFormValues) => {
    setSaveStatus("idle");
    setSaveError(null);

    // Validazione Zod -> mapping sugli errori del form
    try {
      const parsed = profileSchema.parse(values);

      const preferredCategoriesArray =
        parsed.preferredCategories
          ?.split(",")
          .map((s) => s.trim())
          .filter(Boolean) ?? [];

      await axios.patch(
        `${API_BASE_URL}/api/user/profile`,
        {
          fullName: parsed.fullName,
          minHourlyRate: parsed.minHourlyRate,
          preferredCategories: preferredCategoriesArray,
        },
        { headers: getAuthHeaders() },
      );

      setSaveStatus("success");
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        const fieldErrors = err.flatten().fieldErrors;
        for (const [key, messages] of Object.entries(fieldErrors)) {
          if (messages && messages.length > 0) {
            // @ts-expect-error dynamic key mapping
            setError(key, { type: "manual", message: messages[0] });
          }
        }
        setSaveStatus("error");
        setSaveError("Ci sono errori nei dati inseriti.");
        return;
      }

      if (err?.response?.status === 401) {
        setSaveError("Non sei autenticato. Effettua il login prima.");
      } else {
        setSaveError("Errore durante il salvataggio del profilo.");
      }
      setSaveStatus("error");
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row gap-8">
        <section className="flex-1 space-y-4">
          <h1 className="text-2xl font-bold">Profilo utente</h1>
          <p className="text-gray-600 text-sm">
            Qui definisci le tue preferenze base: il sistema le usa per
            valutare payout/tempo delle missioni e personalizzare i punteggi.
          </p>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="mt-4 space-y-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100"
          >
            <div>
              <label className="block text-sm font-medium mb-1">
                Nome completo
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                {...register("fullName")}
              />
              {errors.fullName && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.fullName.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Tariffa oraria minima desiderata (€)
              </label>
              <input
                type="number"
                step="0.5"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                {...register("minHourlyRate", { valueAsNumber: true })}
              />
              {errors.minHourlyRate && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.minHourlyRate.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Categorie preferite (separate da virgola)
              </label>
              <textarea
                rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="es: copywriting, customer support, data entry"
                {...register("preferredCategories")}
              />
              {errors.preferredCategories && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.preferredCategories.message}
                </p>
              )}
            </div>

            {saveError && (
              <p className="text-sm text-red-600 mt-2">{saveError}</p>
            )}
            {saveStatus === "success" && (
              <p className="text-sm text-green-600 mt-2">
                Profilo aggiornato con successo ✅
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-60"
            >
              {isSubmitting ? "Salvataggio in corso..." : "Salva profilo"}
            </button>
          </form>
        </section>

        <section className="w-full md:w-80 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">
            Snapshot attuale
          </h2>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 text-sm">
            {loadingDashboard && (
              <p className="text-gray-500 text-sm">Caricamento dati...</p>
            )}
            {dashboardError && (
              <p className="text-red-600 text-sm">{dashboardError}</p>
            )}
            {dashboard && (
              <div className="space-y-2">
                <p>
                  <span className="font-semibold">Entrate totali:</span>{" "}
                  €{dashboard.totalEarnings.toFixed(2)}
                </p>
                <p>
                  <span className="font-semibold">Missioni completate:</span>{" "}
                  {dashboard.missionsCompleted}
                </p>
                <p>
                  <span className="font-semibold">Missioni attive:</span>{" "}
                  {dashboard.activeMissions}
                </p>
                <p>
                  <span className="font-semibold">Streak (giorni):</span>{" "}
                  {dashboard.streakDays}
                </p>
              </div>
            )}
            {!loadingDashboard && !dashboard && !dashboardError && (
              <p className="text-gray-500">
                Nessun dato ancora. Completa qualche missione per popolare la
                dashboard.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

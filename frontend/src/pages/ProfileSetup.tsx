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
    "idle"
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      setLoadingDashboard(true);
      setDashboardError(null);
      try {
        const res = await axios.get<DashboardResponse>(
          `${API_BASE_URL}/api/user/dashboard`,
          { headers: getAuthHeaders() }
        );
        setDashboard(res.data.summary);
      } catch (err: any) {
        if (err?.response?.status === 401) {
          setDashboardError("Non sei autenticato.");
        } else {
          setDashboardError("Errore nel caricamento dashboard.");
        }
      } finally {
        setLoadingDashboard(false);
      }
    };

    fetchDashboard();
  }, []);

  const onSubmit = async (values: ProfileFormValues) => {
    setSaveError(null);
    setSaveStatus("idle");

    try {
      const parsed = profileSchema.parse(values);

      const raw = parsed.preferredCategories ?? "";
      const preferredCategoriesArray =
        typeof raw === "string" && raw.trim().length > 0
          ? raw.split(",").map((s) => s.trim()).filter(Boolean)
          : [];

      await axios.patch(
        `${API_BASE_URL}/api/user/profile`,
        {
          fullName: parsed.fullName,
          minHourlyRate: parsed.minHourlyRate,
          preferredCategories: preferredCategoriesArray,
        },
        { headers: getAuthHeaders() }
      );

      setSaveStatus("success");
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        const fieldErrors = err.flatten().fieldErrors;
        for (const [key, messages] of Object.entries(fieldErrors)) {
          if (Array.isArray(messages) && messages.length > 0) {
            setError(key as any, { type: "manual", message: messages[0] });
          }
        }
        setSaveStatus("error");
        setSaveError("Ci sono errori nei dati inseriti.");
        return;
      }

      setSaveStatus("error");
      setSaveError("Errore durante il salvataggio del profilo.");
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row gap-8">
        {/* LEFT */}
        <section className="flex-1 space-y-4">
          <h1 className="text-2xl font-bold">Profilo utente</h1>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="mt-4 space-y-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100"
          >
            {/* Nome */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Nome completo
              </label>
              <input
                type="text"
                {...register("fullName")}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
              {errors.fullName && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.fullName.message}
                </p>
              )}
            </div>

            {/* Rate */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Tariffa minima (€)
              </label>
              <input
                type="number"
                {...register("minHourlyRate", { valueAsNumber: true })}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
              {errors.minHourlyRate && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.minHourlyRate.message}
                </p>
              )}
            </div>

            {/* Categorie */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Categorie preferite
              </label>
              <textarea
                rows={3}
                {...register("preferredCategories")}
                className="w-full rounded-md border px-3 py-2 text-sm"
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
                Profilo aggiornato con successo
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-black text-white px-4 py-2 rounded-md text-sm font-semibold"
            >
              {isSubmitting ? "Salvataggio…" : "Salva profilo"}
            </button>
          </form>
        </section>

        {/* RIGHT */}
        <section className="w-full md:w-80 space-y-4">
          <h2 className="text-sm font-semibold">Dashboard</h2>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 text-sm">
            {loadingDashboard && <p>Caricamento…</p>}
            {dashboardError && <p className="text-red-600">{dashboardError}</p>}

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
                  <strong>Missioni attive:</strong> {dashboard.activeMissions}
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


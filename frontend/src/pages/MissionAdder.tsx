// src/pages/MissionAdder.tsx
import { useState } from "react";
import axios from "axios";
import { z } from "zod";
import { useForm } from "react-hook-form";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

const missionSchema = z.object({
  title: z.string().min(3, "Minimo 3 caratteri").max(255),
  description: z.string().min(10, "Descrizione troppo corta"),
  rewardAmount: z.coerce
    .number()
    .positive("Inserisci un compenso positivo"),
  estimatedHours: z.coerce
    .number()
    .positive("Inserisci ore stimate positive"),
  deadline: z.string().min(1, "Inserisci una data"),
  sourceUrl: z.string().url("URL non valido").optional().or(z.literal("")),
});

type MissionFormValues = z.infer<typeof missionSchema>;

export default function MissionAdder() {
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MissionFormValues>({
    defaultValues: {
      title: "",
      description: "",
      rewardAmount: 100,
      estimatedHours: 2,
      deadline: "",
      sourceUrl: "",
    },
  });

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const onSubmit = async (values: MissionFormValues) => {
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const parsed = missionSchema.parse(values);

      const payload = {
        title: parsed.title,
        description: parsed.description,
        rewardAmount: parsed.rewardAmount,
        estimatedHours: parsed.estimatedHours,
        deadline: new Date(parsed.deadline).toISOString(),
        sourceUrl: parsed.sourceUrl || undefined,
      };

      const res = await axios.post(
        `${API_BASE_URL}/api/missions/add`,
        payload,
        { headers: getAuthHeaders() },
      );

      setSubmitSuccess(
        `Missione creata con successo (ID: ${res.data.missionId ?? "N/A"})`,
      );
      reset();
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        const fieldErrors = err.flatten().fieldErrors;
        for (const [key, messages] of Object.entries(fieldErrors)) {
          if (messages && messages.length > 0) {
            // @ts-expect-error dynamic key mapping
            setError(key, { type: "manual", message: messages[0] });
          }
        }
        setSubmitError("Controlla i dati inseriti.");
        return;
      }

      if (err?.response?.status === 401) {
        setSubmitError("Non sei autenticato. Effettua il login prima.");
      } else {
        setSubmitError("Errore durante la creazione della missione.");
      }
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Aggiungi una nuova missione</h1>
      <p className="text-sm text-gray-600">
        Incolla qui le missioni che trovi su Upwork / Fiverr / LinkedIn /
        ovunque. Il backend le filerà e il motore AI le valuterà.
      </p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-4 space-y-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100"
      >
        <div>
          <label className="block text-sm font-medium mb-1">
            Titolo missione
          </label>
          <input
            type="text"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            {...register("title")}
          />
          {errors.title && (
            <p className="text-xs text-red-600 mt-1">
              {errors.title.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Descrizione
          </label>
          <textarea
            rows={5}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            {...register("description")}
          />
          {errors.description && (
            <p className="text-xs text-red-600 mt-1">
              {errors.description.message}
            </p>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Compenso (€)
            </label>
            <input
              type="number"
              step="1"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              {...register("rewardAmount", { valueAsNumber: true })}
            />
            {errors.rewardAmount && (
              <p className="text-xs text-red-600 mt-1">
                {errors.rewardAmount.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Ore stimate
            </label>
            <input
              type="number"
              step="0.5"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              {...register("estimatedHours", { valueAsNumber: true })}
            />
            {errors.estimatedHours && (
              <p className="text-xs text-red-600 mt-1">
                {errors.estimatedHours.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Deadline
            </label>
            <input
              type="datetime-local"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              {...register("deadline")}
            />
            {errors.deadline && (
              <p className="text-xs text-red-600 mt-1">
                {errors.deadline.message}
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            URL sorgente (opzionale)
          </label>
          <input
            type="url"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            placeholder="https://..."
            {...register("sourceUrl")}
          />
          {errors.sourceUrl && (
            <p className="text-xs text-red-600 mt-1">
              {errors.sourceUrl.message}
            </p>
          )}
        </div>

        {submitError && (
          <p className="text-sm text-red-600 mt-2">{submitError}</p>
        )}
        {submitSuccess && (
          <p className="text-sm text-green-600 mt-2">{submitSuccess}</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-60"
        >
          {isSubmitting ? "Salvataggio..." : "Crea missione"}
        </button>
      </form>
    </div>
  );
}

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
  rewardAmount: z.coerce.number().positive("Inserisci un compenso positivo"),
  estimatedHours: z.coerce.number().positive("Inserisci ore stimate positive"),
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
        { headers: getAuthHeaders() }
      );

      setSubmitSuccess(
        `Missione creata con successo (ID: ${res.data.missionId ?? "N/A"})`
      );
      reset();
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        const fieldErrors = err.flatten().fieldErrors;

        for (const [key, messages] of Object.entries(fieldErrors)) {
          if (Array.isArray(messages) && messages.length > 0) {
            setError(key as any, { type: "manual", message: messages[0] });
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
        Incolla qui le missioni che trovi online. Il motore AI le valuterà.
      </p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-4 space-y-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100"
      >
        {/* FORM FIELDS… TUTTI UGUALI AL TUO ORIGINALE */}

        {/* Titolo */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Titolo missione
          </label>
          <input
            type="text"
            {...register("title")}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          {errors.title && (
            <p className="text-xs text-red-600 mt-1">
              {errors.title.message}
            </p>
          )}
        </div>

        {/* Descrizione */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Descrizione
          </label>
          <textarea
            rows={5}
            {...register("description")}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          {errors.description && (
            <p className="text-xs text-red-600 mt-1">
              {errors.description.message}
            </p>
          )}
        </div>

        {/* 3 colonne */}
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Compenso (€)
            </label>
            <input
              type="number"
              {...register("rewardAmount", { valueAsNumber: true })}
              className="w-full rounded-md border px-3 py-2 text-sm"
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
              {...register("estimatedHours", { valueAsNumber: true })}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            {errors.estimatedHours && (
              <p className="text-xs text-red-600 mt-1">
                {errors.estimatedHours.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Deadline</label>
            <input
              type="datetime-local"
              {...register("deadline")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            {errors.deadline && (
              <p className="text-xs text-red-600 mt-1">
                {errors.deadline.message}
              </p>
            )}
          </div>
        </div>

        {/* URL */}
        <div>
          <label className="block text-sm font-medium mb-1">
            URL sorgente (opzionale)
          </label>
          <input
            type="url"
            {...register("sourceUrl")}
            className="w-full rounded-md border px-3 py-2 text-sm"
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
          className="bg-black text-white px-4 py-2 rounded-md text-sm font-semibold"
        >
          {isSubmitting ? "Salvataggio…" : "Crea missione"}
        </button>
      </form>
    </div>
  );
}

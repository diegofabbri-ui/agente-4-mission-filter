import { useEffect, useState } from "react";
import axios from "axios";
import { z } from "zod";
import { useForm } from "react-hook-form";

const API_BASE_URL = "https://agente-4-mission-filter-production.up.railway.app";

// --- SCHEMA AGGIORNATO (NIKE STYLE) ---
const profileSchema = z.object({
  fullName: z.string().min(1, "Nome richiesto"),
  minHourlyRate: z.coerce.number().min(1),
  // Campi Career Manifesto
  currentRole: z.string().min(1, "Cosa fai oggi?"),
  dreamRole: z.string().min(1, "Cosa vuoi diventare?"),
  antiVision: z.string().optional(), // Es. "No telefonate, no sveglia presto"
  unfairAdvantages: z.string().optional(), // Es. "Parlo cinese, so vendere"
  interests: z.string().optional(), // Es. "Crypto, AI"
  keySkillsToAcquire: z.string().optional(), // Es. "Solidity, Copywriting"
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function ProfileSetup() {
  const { register, handleSubmit, formState: { errors, isSubmitting }, setValue } = useForm<ProfileFormValues>();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  // Carica dati esistenti (se ci sono)
  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/user/profile-data`).then(res => {
      const d = res.data;
      if (d) {
        setValue("fullName", d.fullName);
        setValue("minHourlyRate", d.minHourlyRate);
        // Mappa il manifesto se esiste
        if (d.careerManifesto) {
          setValue("currentRole", d.careerManifesto.currentRole);
          setValue("dreamRole", d.careerManifesto.dreamRole);
          setValue("antiVision", d.careerManifesto.antiVision?.join(", "));
          setValue("unfairAdvantages", d.careerManifesto.unfairAdvantages?.join(", "));
          setValue("interests", d.careerManifesto.interests?.join(", "));
          setValue("keySkillsToAcquire", d.careerManifesto.keySkillsToAcquire?.join(", "));
        }
      }
    }).catch(() => {}); // Ignora errori in load
  }, [setValue]);

  const onSubmit = async (values: ProfileFormValues) => {
    setStatus("idle");
    try {
      // Trasforma stringhe separate da virgola in array
      const careerManifesto = {
        currentRole: values.currentRole,
        dreamRole: values.dreamRole,
        antiVision: values.antiVision?.split(",").map(s => s.trim()).filter(Boolean) || [],
        unfairAdvantages: values.unfairAdvantages?.split(",").map(s => s.trim()).filter(Boolean) || [],
        interests: values.interests?.split(",").map(s => s.trim()).filter(Boolean) || [],
        keySkillsToAcquire: values.keySkillsToAcquire?.split(",").map(s => s.trim()).filter(Boolean) || [],
        riskTolerance: "HIGH", // Default per ora
        energyWindow: "MORNING" // Default per ora
      };

      await axios.patch(`${API_BASE_URL}/api/user/profile`, {
        fullName: values.fullName,
        minHourlyRate: values.minHourlyRate,
        careerManifesto // Inviamo il blocco JSON completo
      });
      setStatus("success");
    } catch (e) {
      setStatus("error");
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 text-white space-y-8">
      <header>
        <h1 className="text-3xl font-bold">Il Tuo Manifesto</h1>
        <p className="text-gray-400">Non cerchiamo "lavoro". Progettiamo la tua carriera.</p>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 bg-gray-900 p-6 rounded-xl border border-gray-800">
        
        {/* SEZIONE 1: DATI BASE */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nome</label>
            <input {...register("fullName")} className="w-full bg-gray-800 border border-gray-700 rounded p-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Tariffa Minima (€/h)</label>
            <input type="number" {...register("minHourlyRate")} className="w-full bg-gray-800 border border-gray-700 rounded p-2" />
          </div>
        </div>

        {/* SEZIONE 2: IDENTITÀ */}
        <div className="space-y-4 border-t border-gray-800 pt-4">
          <h3 className="text-lg font-semibold text-indigo-400">Identità & Obiettivi</h3>
          
          <div>
            <label className="block text-sm font-medium mb-1">Ruolo Attuale</label>
            <input {...register("currentRole")} placeholder="Es. Magazziniere" className="w-full bg-gray-800 border border-gray-700 rounded p-2" />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Ruolo Sogno (Tra 12 mesi)</label>
            <input {...register("dreamRole")} placeholder="Es. Sviluppatore Blockchain" className="w-full bg-gray-800 border border-gray-700 rounded p-2" />
          </div>
        </div>

        {/* SEZIONE 3: STRATEGIA */}
        <div className="space-y-4 border-t border-gray-800 pt-4">
          <h3 className="text-lg font-semibold text-emerald-400">Strategia Nike</h3>
          
          <div>
            <label className="block text-sm font-medium mb-1">Anti-Visione (Cosa ODI fare?)</label>
            <textarea {...register("antiVision")} placeholder="Es. No telefonate a freddo, no sveglia presto..." className="w-full bg-gray-800 border border-gray-700 rounded p-2 h-20" />
            <p className="text-xs text-gray-500">Separa con virgole.</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Vantaggi Sleali (Cosa sai fare solo tu?)</label>
            <textarea {...register("unfairAdvantages")} placeholder="Es. Parlo giapponese, ex atleta..." className="w-full bg-gray-800 border border-gray-700 rounded p-2 h-20" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Skill da Acquisire (Cosa vuoi imparare pagato?)</label>
            <input {...register("keySkillsToAcquire")} placeholder="Es. React, Sales, Copywriting" className="w-full bg-gray-800 border border-gray-700 rounded p-2" />
          </div>
        </div>

        {status === "success" && <p className="text-green-400 font-bold">Manifesto salvato. L'Agente è aggiornato.</p>}
        {status === "error" && <p className="text-red-400 font-bold">Errore nel salvataggio.</p>}

        <button type="submit" disabled={isSubmitting} className="w-full bg-white text-black font-bold py-3 rounded hover:bg-gray-200 transition">
          {isSubmitting ? "Salvataggio..." : "Aggiorna il Cervello dell'Agente"}
        </button>
      </form>
    </div>
  );
}
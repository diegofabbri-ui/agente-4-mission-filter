import { useEffect, useState } from "react";
import apiClient from "../lib/apiClient";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { User, Target, Zap, Rocket, ShieldAlert, FileText } from "lucide-react";

// --- SCHEMA DI VALIDAZIONE ---
// Definisce le regole per i dati che inviamo al backend
const profileSchema = z.object({
  fullName: z.string().min(1, "Il nome è obbligatorio"),
  minHourlyRate: z.coerce.number().min(1, "Inserisci una tariffa valida"),
  
  // Campi del "Manifesto" (Il cervello dell'Agente)
  currentRole: z.string().optional(),
  dreamRole: z.string().min(3, "Definisci chiaramente cosa cercare (es. 'Copywriter Crypto')"),
  antiVision: z.string().optional(), // Cosa evitare
  unfairAdvantages: z.string().optional(), // Punti di forza
  keySkillsToAcquire: z.string().optional(), // Skill
  specificQuestions: z.string().optional() // Istruzioni libere
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function ProfileSetup() {
  const { register, handleSubmit, formState: { errors, isSubmitting }, setValue } = useForm<ProfileFormValues>();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  // --- CARICAMENTO DATI ESISTENTI ---
  useEffect(() => {
    apiClient.get('/user/profile-data').then(res => {
      const d = res.data;
      if (d) {
        // Popola i campi base
        setValue("fullName", d.fullName);
        setValue("minHourlyRate", d.minHourlyRate);
        
        // Popola il manifesto (se esiste) gestendo la conversione Array <-> Stringa
        if (d.careerManifesto) {
          setValue("currentRole", d.careerManifesto.currentRole);
          setValue("dreamRole", d.careerManifesto.dreamRole);
          
          // Helper per convertire array o stringhe in testo per textarea
          const arrayToString = (val: any) => Array.isArray(val) ? val.join(", ") : (val || "");
          
          setValue("antiVision", arrayToString(d.careerManifesto.antiVision));
          setValue("unfairAdvantages", arrayToString(d.careerManifesto.unfairAdvantages));
          setValue("keySkillsToAcquire", arrayToString(d.careerManifesto.keySkillsToAcquire));
          setValue("specificQuestions", d.careerManifesto.specificQuestions || "");
        }
      }
    }).catch((e) => {
      console.error("Errore caricamento profilo:", e);
    });
  }, [setValue]);

  // --- SALVATAGGIO DATI ---
  const onSubmit = async (values: ProfileFormValues) => {
    setStatus("idle");
    try {
      // Convertiamo le stringhe separate da virgola in array JSON per il DB
      const careerManifesto = {
        currentRole: values.currentRole,
        dreamRole: values.dreamRole, // CRUCIALE: Questo guida la ricerca principale
        antiVision: values.antiVision?.split(",").map(s => s.trim()).filter(Boolean) || [],
        unfairAdvantages: values.unfairAdvantages?.split(",").map(s => s.trim()).filter(Boolean) || [],
        keySkillsToAcquire: values.keySkillsToAcquire?.split(",").map(s => s.trim()).filter(Boolean) || [],
        specificQuestions: values.specificQuestions || "" // Note libere per l'AI
      };

      await apiClient.patch('/user/profile', {
        fullName: values.fullName,
        minHourlyRate: values.minHourlyRate,
        careerManifesto // Salviamo l'intero oggetto JSON
      });
      
      setStatus("success");
      // Scroll to top o feedback visivo
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
    } catch (e) {
      console.error("Errore salvataggio:", e);
      setStatus("error");
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 text-white pb-32">
      
      {/* HEADER */}
      <header className="mb-10 border-b border-gray-800 pb-6">
        <h1 className="text-3xl font-bold flex items-center gap-3 text-white">
          <Target className="text-indigo-500 w-8 h-8" /> Configurazione Missione
        </h1>
        <p className="text-gray-400 mt-2 max-w-2xl">
          Non è un semplice profilo. È il <strong>Protocollo di Caccia</strong>. 
          L'Agente userà esattamente quello che scrivi qui per filtrare internet e trovare lavoro per te.
        </p>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-10">
        
        {/* SEZIONE 1: IDENTITÀ & PARAMETRI ECONOMICI */}
        <section className="bg-[#0f1115] p-8 rounded-2xl border border-white/5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-indigo-500 to-purple-600"></div>
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <User className="text-indigo-400" /> Identità Operativa
          </h3>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Nome Pubblico</label>
              <input 
                {...register("fullName")} 
                className="w-full bg-black/40 border border-gray-700 rounded-xl p-4 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder-gray-600" 
                placeholder="Es. Mario Rossi"
              />
              {errors.fullName && <p className="text-red-400 text-xs mt-2">{errors.fullName.message}</p>}
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Tariffa Minima (€/ora)</label>
              <input 
                type="number" 
                {...register("minHourlyRate")} 
                className="w-full bg-black/40 border border-gray-700 rounded-xl p-4 text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all placeholder-gray-600" 
                placeholder="Es. 20"
              />
              <p className="text-[10px] text-gray-500 mt-2">L'Agente scarterà automaticamente offerte sotto questa cifra.</p>
            </div>
          </div>
        </section>

        {/* SEZIONE 2: PROTOCOLLO DI CACCIA (IL CUORE) */}
        <section className="bg-[#0f1115] p-8 rounded-2xl border border-indigo-500/20 shadow-[0_0_40px_rgba(79,70,229,0.05)] relative">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Rocket className="w-24 h-24 text-white" />
          </div>
          
          <h3 className="text-xl font-bold text-indigo-400 mb-2 flex items-center gap-2">
            <Target className="w-5 h-5" /> Obiettivo Primario (Dream Role)
          </h3>
          <p className="text-sm text-gray-400 mb-6">
            Questa è la bussola dell'Agente. Scrivi esattamente il ruolo o la nicchia che vuoi dominare.
          </p>

          <div className="mb-8">
            <input 
              {...register("dreamRole")} 
              className="w-full bg-indigo-900/10 border border-indigo-500/50 rounded-xl p-5 text-lg text-white placeholder-indigo-300/30 focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-inner" 
              placeholder="Es: AI Content Editor per aziende Tech USA..." 
            />
            {errors.dreamRole && <p className="text-red-400 text-sm mt-2 font-bold">{errors.dreamRole.message}</p>}
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            
            {/* ANTI-VISIONE */}
            <div className="space-y-2">
                <div className="flex items-center gap-2 mb-1">
                    <ShieldAlert className="w-4 h-4 text-red-400" />
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Anti-Visione (Esclusioni)</label>
                </div>
                <textarea 
                    {...register("antiVision")} 
                    className="w-full bg-black/40 border border-gray-800 rounded-xl p-4 text-sm h-32 resize-none focus:border-red-500/50 outline-none transition-all placeholder-gray-700" 
                    placeholder="Es: No call center, no MLM, no turni notturni, no sondaggi..." 
                />
                <p className="text-[10px] text-gray-600">Separa con virgole. L'Agente userà questi termini per filtrare i risultati spazzatura.</p>
            </div>

            {/* ASSET E SKILL */}
            <div className="space-y-2">
                <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-4 h-4 text-emerald-400" />
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">I Tuoi Asset (Keyword)</label>
                </div>
                <textarea 
                    {...register("unfairAdvantages")} 
                    className="w-full bg-black/40 border border-gray-800 rounded-xl p-4 text-sm h-32 resize-none focus:border-emerald-500/50 outline-none transition-all placeholder-gray-700" 
                    placeholder="Es: Madrelingua Italiano, Laurea in Lettere, esperienza copywriting, veloce a scrivere..." 
                />
                <p className="text-[10px] text-gray-600">Queste keyword verranno usate per trovare lavori che richiedono specificamente TE.</p>
            </div>
          </div>
        </section>

        {/* SEZIONE 3: ISTRUZIONI SPECIALI */}
        <section className="bg-[#0f1115] p-8 rounded-2xl border border-white/5">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <FileText className="text-gray-400" /> Istruzioni Avanzate
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Note Libere per l'Agente</label>
              <textarea 
                {...register("specificQuestions")} 
                className="w-full bg-black/40 border border-gray-700 rounded-xl p-4 text-sm h-24 resize-none focus:border-white/30 outline-none transition-all placeholder-gray-600" 
                placeholder="Es: Cerca solo aziende che pagano in Crypto. Preferisco contratti a progetto brevi..." 
              />
            </div>
          </div>
        </section>

        {/* FEEDBACK STATUS */}
        {status === "success" && (
            <div className="fixed bottom-10 right-10 bg-emerald-900/90 border border-emerald-500/50 text-white px-6 py-4 rounded-xl shadow-2xl animate-bounce flex items-center gap-3 z-50 backdrop-blur-md">
                <Target className="w-6 h-6 text-emerald-400" />
                <div>
                    <p className="font-bold text-sm">Protocollo Aggiornato</p>
                    <p className="text-xs opacity-80">L'Agente userà i nuovi parametri nella prossima caccia.</p>
                </div>
            </div>
        )}
        
        {status === "error" && (
            <div className="bg-red-900/20 border border-red-500/50 text-red-200 p-4 rounded-xl text-center">
                Errore durante il salvataggio. Riprova.
            </div>
        )}

        {/* SUBMIT BUTTON */}
        <button 
            type="submit" 
            disabled={isSubmitting} 
            className="w-full bg-gradient-to-r from-white to-gray-200 text-black font-extrabold text-lg py-4 rounded-xl hover:scale-[1.01] hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] transition-all active:scale-95 disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-3"
        >
            {isSubmitting ? (
                <>Salvando...</>
            ) : (
                <>
                    <Target className="w-5 h-5" /> AGGIORNA PROTOCOLLO AGENTE
                </>
            )}
        </button>

      </form>
    </div>
  );
}
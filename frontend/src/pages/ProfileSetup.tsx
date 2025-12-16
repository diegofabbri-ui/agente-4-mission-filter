import { useEffect, useState } from "react";
import apiClient from "../lib/apiClient";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { 
  Target, 
  ShieldAlert, 
  Cpu, 
  Save, 
  Zap,
  Banknote, 
  Search, 
  FileText 
} from "lucide-react";

// --- SCHEMA DI VALIDAZIONE ---
const profileSchema = z.object({
  minHourlyRate: z.coerce.number().min(1, "Inserisci una tariffa minima valida."),
  dreamRole: z.string().min(3, "L'obiettivo è obbligatorio per orientare l'Agente."),
  whatToDo: z.string().optional(), // "Cosa vorresti fare?"
  whatToAvoid: z.string().optional(), // "Cosa non vorresti fare?"
  advancedInstructions: z.string().optional() // "Istruzioni Avanzate"
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function ProfileSetup() {
  const { register, handleSubmit, formState: { errors, isSubmitting }, setValue } = useForm<ProfileFormValues>();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  // --- CARICAMENTO DATI ---
  useEffect(() => {
    apiClient.get('/user/profile-data').then(res => {
      const d = res.data;
      if (d) {
        setValue("minHourlyRate", d.minHourlyRate);
        if (d.careerManifesto) {
          setValue("dreamRole", d.careerManifesto.dreamRole);
          setValue("whatToDo", d.careerManifesto.whatToDo);
          setValue("whatToAvoid", d.careerManifesto.whatToAvoid);
          setValue("advancedInstructions", d.careerManifesto.advancedInstructions);
        }
      }
    }).catch(console.error);
  }, [setValue]);

  // --- SALVATAGGIO ---
  const onSubmit = async (values: ProfileFormValues) => {
    setStatus("idle");
    
    if (!confirm("⚠️ CONFERMA AGGIORNAMENTO\n\nL'Agente archivierà le ricerche precedenti. L'AI analizzerà le tue nuove risposte per generare keyword di ricerca ottimizzate.\n\nProcedere?")) return;

    try {
      await apiClient.patch('/user/profile', values);
      setStatus("success");
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 pb-40 text-gray-100 font-sans">
      
      {/* --- HEADER --- */}
      <header className="mb-12 border-b border-gray-800 pb-8">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
            <Cpu className="w-8 h-8 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Configurazione Missione</h1>
            <p className="text-xs font-mono text-indigo-400 uppercase tracking-widest mt-1">Protocollo Operativo Agente v4.0</p>
          </div>
        </div>
        
        <div className="bg-[#0f1115] border-l-4 border-indigo-500 p-6 rounded-r-xl">
          <p className="text-gray-300 text-sm leading-relaxed">
            Rispondi a queste domande come se parlassi a un assistente umano.
            L'Intelligenza Artificiale analizzerà le tue risposte per creare i filtri di ricerca perfetti.
          </p>
        </div>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-10">
        
        {/* --- SEZIONE 1: IDENTITÀ & OBIETTIVO --- */}
        <section className="bg-[#0f1115] rounded-2xl border border-white/5 overflow-hidden">
          <div className="p-6 border-b border-white/5 flex items-center gap-3 bg-white/[0.02]">
            <Target className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white">Parametri Base</h2>
          </div>
          
          <div className="p-8 grid md:grid-cols-12 gap-8">
            {/* OBIETTIVO */}
            <div className="md:col-span-8">
              <label className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-2 block">
                Obiettivo Primario (Dream Role)
              </label>
              <input 
                {...register("dreamRole")} 
                className="w-full bg-black/40 border border-indigo-500/30 rounded-xl p-4 text-xl text-white placeholder-gray-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all" 
                placeholder="Es. Senior React Developer" 
              />
              {errors.dreamRole && <p className="text-red-400 text-xs mt-2">{errors.dreamRole.message}</p>}
              <p className="mt-2 text-xs text-gray-500 flex items-center gap-2">
                <Search className="w-3 h-3" />
                La "Bussola": definisce il ruolo o la nicchia principale.
              </p>
            </div>

            {/* TARIFFA */}
            <div className="md:col-span-4">
              <label className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 block">
                Tariffa Minima (€/h)
              </label>
              <div className="relative">
                <input 
                  type="number" 
                  {...register("minHourlyRate")} 
                  className="w-full bg-black/40 border border-gray-700 rounded-xl p-4 pl-10 text-xl font-mono text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all placeholder-gray-600" 
                  placeholder="20" 
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">€</span>
              </div>
            </div>
          </div>
        </section>

        {/* --- SEZIONE 2: PREFERENZE OPERATIVE (LE TUE RICHIESTE) --- */}
        <div className="grid md:grid-cols-2 gap-8">
          
          {/* COSA VORRESTI FARE (POSITIVE) */}
          <section className="bg-[#0f1115] rounded-2xl border border-emerald-900/30 hover:border-emerald-500/30 transition-colors group">
            <div className="p-6 border-b border-white/5 flex items-center gap-3">
              <Zap className="w-5 h-5 text-emerald-500 group-hover:scale-110 transition-transform" />
              <h3 className="font-bold text-white text-lg">Cosa vorresti fare?</h3>
            </div>
            <div className="p-6">
              <p className="text-xs text-gray-400 mb-3">
                Descrivi le tecnologie, i task o i settori che ti piacciono. L'AI estrarrà le <strong>Keyword Positive</strong> da qui.
              </p>
              <textarea 
                {...register("whatToDo")} 
                className="w-full bg-black/40 border border-gray-800 rounded-xl p-4 text-sm h-40 resize-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-900/20 outline-none transition-all placeholder-gray-700 leading-relaxed" 
                placeholder="Es. Voglio lavorare con Next.js e Tailwind. Mi piace creare interfacce utente pulite. Preferisco progetti Fintech o Crypto..." 
              />
            </div>
          </section>

          {/* COSA NON VORRESTI FARE (NEGATIVE) */}
          <section className="bg-[#0f1115] rounded-2xl border border-red-900/30 hover:border-red-500/30 transition-colors group">
            <div className="p-6 border-b border-white/5 flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-red-500 group-hover:scale-110 transition-transform" />
              <h3 className="font-bold text-white text-lg">Cosa non vorresti fare?</h3>
            </div>
            <div className="p-6">
              <p className="text-xs text-gray-400 mb-3">
                Descrivi ciò che odi. L'AI userà queste info per creare i <strong>Filtri Negativi</strong> ed escludere risultati spazzatura.
              </p>
              <textarea 
                {...register("whatToAvoid")} 
                className="w-full bg-black/40 border border-gray-800 rounded-xl p-4 text-sm h-40 resize-none focus:border-red-500/50 focus:ring-1 focus:ring-red-900/20 outline-none transition-all placeholder-gray-700 leading-relaxed" 
                placeholder="Es. Non voglio fare chiamate a freddo. Niente WordPress o Joomla. Evita aziende di betting o gambling. No MLM..." 
              />
            </div>
          </section>
        </div>

        {/* --- SEZIONE 3: ISTRUZIONI AVANZATE --- */}
        <section className="bg-[#0f1115] rounded-2xl border border-white/5">
          <div className="p-6 border-b border-white/5 flex items-center gap-3">
            <FileText className="w-5 h-5 text-purple-400" />
            <h3 className="font-bold text-white">Istruzioni Avanzate</h3>
          </div>
          <div className="p-6">
            <textarea 
              {...register("advancedInstructions")} 
              className="w-full bg-black/40 border border-gray-800 rounded-xl p-4 text-sm h-32 resize-none focus:border-purple-500/50 outline-none transition-all placeholder-gray-700 font-mono" 
              placeholder="// Regole extra per l'Agente. Es: 'Dai priorità a startup in fase Seed', 'Cerca solo contratti B2B', 'Ignora offerte su Upwork'..." 
            />
          </div>
        </section>

        {/* --- ACTION BAR --- */}
        <div className="sticky bottom-6 z-50">
          {status === "success" && (
            <div className="mb-4 bg-emerald-900/90 border border-emerald-500/50 text-white px-6 py-4 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-4 animate-in slide-in-from-bottom-5">
              <div className="p-2 bg-emerald-500 rounded-full text-black"><Cpu className="w-4 h-4" /></div>
              <div>
                <p className="font-bold text-sm">Protocollo Aggiornato & AI Avviata</p>
                <p className="text-xs opacity-90">L'Agente sta calcolando le nuove keyword e iniziando la caccia...</p>
              </div>
            </div>
          )}

          <button 
            type="submit" 
            disabled={isSubmitting} 
            className="w-full bg-white hover:bg-gray-200 text-black font-extrabold text-lg py-4 rounded-xl shadow-[0_0_30px_rgba(255,255,255,0.15)] hover:shadow-[0_0_50px_rgba(255,255,255,0.3)] transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2 animate-pulse">
                <Cpu className="w-5 h-5" /> GENERAZIONE KEYWORD IN CORSO...
              </span>
            ) : (
              <>
                <Save className="w-5 h-5" /> AGGIORNA PROTOCOLLO AGENTE
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  );
}
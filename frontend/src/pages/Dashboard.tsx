import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  User, ChevronDown, ChevronUp, Play, 
  CheckCircle, XCircle, ArrowRight, Briefcase, 
  FileText, Zap, AlertCircle, Loader2, Sparkles,
  Cpu, Activity, Lock
} from 'lucide-react';
import { Link } from 'react-router-dom';

// --- CONFIGURAZIONE ---
// Suggerimento: In produzione usa import.meta.env.VITE_API_BASE_URL
const API_BASE_URL = "https://agente-4-mission-filter-production.up.railway.app";

// --- TIPI ---
interface Mission {
  id: string;
  title: string;
  description: string;
  company_name: string;
  reward_amount: number;
  estimated_duration_hours: number;
  status: string;
  created_at: string;
  match_score?: number;
  analysis_notes?: string;
  final_deliverable_json?: any;
  final_work_content?: string;
  client_requirements?: string;
}

// --- COMPONENTI UI SENSORIALI ---

const GlassCard = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`relative bg-[#0f1115]/60 backdrop-blur-xl border border-white/5 shadow-2xl rounded-2xl overflow-hidden transition-all duration-500 hover:shadow-indigo-500/10 hover:border-white/10 ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
    {children}
  </div>
);

const SectionHeader = ({ title, icon: Icon, colorClass = "text-indigo-400", bgClass = "bg-indigo-500/10" }: { title: string, icon: any, colorClass?: string, bgClass?: string }) => (
  <div className="flex items-center gap-4 mb-8 group cursor-default">
    <div className={`p-3 rounded-xl ${bgClass} border border-white/5 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
      <Icon className={`w-6 h-6 ${colorClass}`} />
    </div>
    <h2 className="text-2xl font-bold text-white tracking-tight group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-gray-400 transition-all duration-300">
      {title}
    </h2>
  </div>
);

const ActionButton = ({ onClick, disabled, icon: Icon, variant = 'primary' }: { onClick: () => void, disabled?: boolean, icon: any, variant?: 'primary' | 'danger' | 'success' }) => {
  const baseClasses = "p-3 rounded-xl transition-all duration-300 flex items-center justify-center shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-indigo-500/20 hover:shadow-indigo-500/40",
    danger: "bg-gray-800/50 hover:bg-red-500/20 text-gray-400 hover:text-red-400 border border-transparent hover:border-red-500/30",
    success: "bg-gray-800/50 hover:bg-emerald-500/20 text-gray-400 hover:text-emerald-400 border border-transparent hover:border-emerald-500/30"
  };

  return (
    <button onClick={onClick} disabled={disabled} className={`${baseClasses} ${variants[variant]}`}>
      <Icon className="w-5 h-5" />
    </button>
  );
};

export default function Dashboard() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null); // Loading granulare
  
  // Stati Layout 2
  const [selectedDevMissionId, setSelectedDevMissionId] = useState<string>("");
  
  // Stati Layout 3
  const [clientInput, setClientInput] = useState("");
  const [executingId, setExecutingId] = useState<string | null>(null);

  // Effetto Mount (Animazione ingresso)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const fetchMissions = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/missions/my-missions?limit=50`);
      const parsedData = res.data.data.map((m: any) => ({
        ...m,
        final_deliverable_json: typeof m.final_deliverable_json === 'string' 
          ? JSON.parse(m.final_deliverable_json) 
          : m.final_deliverable_json
      }));
      setMissions(parsedData);
      
      const firstDev = parsedData.find((m: any) => m.status === 'developed');
      if (firstDev && !selectedDevMissionId) setSelectedDevMissionId(firstDev.id);

    } catch (e) { console.error("Errore fetch", e); }
  };

  useEffect(() => { fetchMissions(); }, []);

  // --- FILTRI ---
  const pendingMissions = missions.filter(m => m.status === 'pending');
  const developedMissions = missions.filter(m => m.status === 'developed');
  const activeMissions = missions.filter(m => ['active', 'completed'].includes(m.status));
  const rejectedMissions = missions.filter(m => m.status === 'rejected');

  // --- HANDLERS ---
  const handleDevelop = async (id: string) => {
    setLoadingId(id);
    try {
      await axios.post(`${API_BASE_URL}/api/missions/${id}/develop`);
      await fetchMissions();
    } catch (e) { alert("Errore sviluppo."); } 
    finally { setLoadingId(null); }
  };

  const handleReject = async (id: string) => {
    if(!confirm("Confermi lo scarto della missione?")) return;
    try {
      await axios.post(`${API_BASE_URL}/api/missions/${id}/reject`);
      await fetchMissions();
      setSelectedDevMissionId("");
    } catch (e) { alert("Errore rifiuto."); }
  };

  const handleAccept = async (id: string) => {
    try {
      await axios.patch(`${API_BASE_URL}/api/missions/${id}/status`, { status: 'active' });
      await fetchMissions();
    } catch (e) { alert("Errore accettazione."); }
  };

  const handleExecuteWork = async (id: string) => {
    if (!clientInput) return alert("Inserisci i requisiti del cliente!");
    setExecutingId(id);
    try {
      await axios.post(`${API_BASE_URL}/api/missions/${id}/execute`, { clientRequirements: clientInput });
      await fetchMissions();
      setClientInput("");
    } catch (e) { alert("Errore esecuzione."); } 
    finally { setExecutingId(null); }
  };

  const currentDevMission = developedMissions.find(m => m.id === selectedDevMissionId) || developedMissions[0];

  return (
    <div className={`min-h-screen bg-[#050507] text-gray-100 font-sans pb-20 selection:bg-indigo-500/30 selection:text-white transition-opacity duration-1000 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
      
      {/* BACKGROUND AMBIENTALE */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-900/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-900/10 rounded-full blur-[120px]" />
      </div>

      {/* NAVBAR SENSORIALE */}
      <nav className="sticky top-4 z-50 mx-4 md:mx-8 mb-12">
        <div className="bg-[#0f1115]/80 backdrop-blur-md border border-white/5 rounded-2xl px-6 py-4 flex justify-between items-center shadow-2xl">
          <div className="flex items-center gap-3 group">
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-indigo-500/50 transition-all duration-300 group-hover:scale-105">
                <span className="font-bold text-white text-lg">W</span>
              </div>
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-[#0f1115] rounded-full animate-pulse" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold tracking-tight text-white leading-none">MOON</span>
              <span className="text-[10px] font-medium text-gray-500 tracking-[0.2em] uppercase">Intelligence Core</span>
            </div>
          </div>
          <Link to="/profile" className="w-10 h-10 rounded-full bg-gray-800/50 hover:bg-white/10 flex items-center justify-center transition-all duration-300 border border-white/5 hover:border-white/20 group">
            <User className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
          </Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 relative z-10 space-y-16">

        {/* --- STADIO 1: DISCOVERY --- */}
        <section>
          <SectionHeader title="1. Radar Missioni" icon={Zap} colorClass="text-yellow-400" bgClass="bg-yellow-400/10" />
          
          <div className="grid grid-cols-1 gap-4">
            {pendingMissions.length === 0 ? (
              <GlassCard className="p-12 flex flex-col items-center justify-center text-center border-dashed border-gray-800">
                <div className="w-16 h-16 rounded-full bg-gray-800/50 flex items-center justify-center mb-4 animate-pulse">
                  <Activity className="w-8 h-8 text-gray-600" />
                </div>
                <p className="text-gray-500 text-lg">Scansione in corso... Nessun segnale rilevato.</p>
              </GlassCard>
            ) : (
              pendingMissions.map((mission, idx) => (
                <div key={mission.id} className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: `${idx * 100}ms` }}>
                  <MissionDiscoveryCard mission={mission} onDevelop={handleDevelop} loading={loadingId === mission.id} />
                </div>
              ))
            )}
          </div>
        </section>

        {/* --- STADIO 2: DEVELOPMENT --- */}
        <section className="relative group">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8">
            <SectionHeader title="2. Laboratorio Tattico" icon={Cpu} colorClass="text-indigo-400" bgClass="bg-indigo-500/10" />
            
            {/* SELETTORE FUTURISTICO */}
            <div className="relative w-full md:w-96 z-20">
              <select 
                value={selectedDevMissionId} 
                onChange={(e) => setSelectedDevMissionId(e.target.value)}
                className="w-full bg-[#0a0a0c] border border-gray-700 text-white text-sm rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 block p-3 pr-10 appearance-none shadow-xl transition-all hover:border-gray-600 cursor-pointer"
                disabled={developedMissions.length === 0}
              >
                {developedMissions.length === 0 && <option>In attesa di sviluppo...</option>}
                {developedMissions.map(m => (
                  <option key={m.id} value={m.id}>{m.title.substring(0, 50)}...</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-indigo-500">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          <GlassCard className="min-h-[600px] flex flex-col">
            {currentDevMission ? (
              <>
                {/* HEADSHEET */}
                <div className="p-6 bg-gradient-to-r from-gray-900/80 to-gray-900/40 border-b border-white/5 flex justify-between items-start md:items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 tracking-wider">STRATEGY READY</span>
                    </div>
                    <h3 className="text-xl font-bold text-white leading-tight">{currentDevMission.title}</h3>
                    <p className="text-sm text-gray-400 mt-1 flex items-center gap-2">
                      <Briefcase className="w-3 h-3" /> {currentDevMission.company_name}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <ActionButton onClick={() => handleReject(currentDevMission.id)} icon={XCircle} variant="danger" />
                    <div className="h-8 w-px bg-gray-800" />
                    <ActionButton onClick={() => handleAccept(currentDevMission.id)} icon={CheckCircle} variant="success" />
                  </div>
                </div>

                {/* WORKSPACE SCROLLABILE */}
                <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar relative">
                  
                  {/* BRIEF STRATEGICO */}
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-900/20 to-purple-900/20 border border-indigo-500/20 p-6">
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
                    <h4 className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-widest mb-3">
                      <Sparkles className="w-4 h-4" /> Strategic Insight
                    </h4>
                    <p className="text-indigo-100 text-sm leading-relaxed font-medium">
                      {currentDevMission.final_deliverable_json?.strategy_brief}
                    </p>
                  </div>

                  <div className="grid lg:grid-cols-2 gap-8">
                    {/* COLONNA A: COVER LETTER */}
                    <div className="space-y-3">
                      <Label text="Protocollo Candidatura" />
                      <div className="bg-black/40 backdrop-blur rounded-xl border border-white/5 p-5 font-mono text-xs text-gray-300 leading-relaxed whitespace-pre-wrap shadow-inner hover:border-white/10 transition-colors">
                        {currentDevMission.final_deliverable_json?.deliverable_content}
                      </div>
                    </div>
                    
                    {/* COLONNA B: BONUS ASSET */}
                    <div className="space-y-3">
                      <Label text={`Asset Bonus: ${currentDevMission.final_deliverable_json?.bonus_material_title}`} />
                      <div className="bg-emerald-900/5 backdrop-blur rounded-xl border border-emerald-500/10 p-5 font-mono text-xs text-emerald-100/90 leading-relaxed whitespace-pre-wrap shadow-inner hover:border-emerald-500/20 transition-colors">
                        {currentDevMission.final_deliverable_json?.bonus_material_content}
                      </div>
                    </div>
                  </div>

                  {/* EXECUTION STEPS */}
                  <div className="bg-gray-900/50 rounded-2xl p-6 border border-white/5">
                     <Label text="Sequenza Operativa" />
                     <div className="mt-4 space-y-3">
                        {currentDevMission.final_deliverable_json?.execution_steps?.map((step: string, i: number) => (
                          <div key={i} className="flex items-center gap-4 group">
                            <span className="w-6 h-6 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-400 group-hover:bg-indigo-600 group-hover:border-indigo-500 group-hover:text-white transition-colors">
                              {i+1}
                            </span>
                            <span className="text-sm text-gray-400 group-hover:text-gray-200 transition-colors">{step}</span>
                          </div>
                        ))}
                     </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-700 gap-4">
                <div className="w-20 h-20 rounded-full bg-gray-900 flex items-center justify-center border border-gray-800">
                  <Lock className="w-8 h-8 opacity-20" />
                </div>
                <p className="font-medium tracking-wide text-sm uppercase">Modulo Tattico Inattivo</p>
              </div>
            )}
          </GlassCard>
        </section>

        {/* --- STADIO 3: EXECUTION --- */}
        <section>
          <SectionHeader title="3. Esecuzione & Delivery" icon={Briefcase} colorClass="text-emerald-400" bgClass="bg-emerald-500/10" />

          <div className="space-y-12">
            {activeMissions.length === 0 && (
               <div className="text-center py-20 border-2 border-dashed border-gray-800 rounded-3xl opacity-50">
                 <p className="text-gray-500">Il laboratorio è vuoto. Accetta una missione per iniziare.</p>
               </div>
            )}

            {activeMissions.map(mission => (
              <GlassCard key={mission.id} className="p-8 border-l-4 border-l-emerald-500">
                <div className="flex flex-col md:flex-row items-center justify-between mb-8 pb-6 border-b border-white/5">
                  <div>
                    <h3 className="text-2xl font-bold text-white">{mission.title}</h3>
                    <p className="text-gray-500 text-sm mt-1">@ {mission.company_name}</p>
                  </div>
                  <div className="mt-4 md:mt-0">
                    {mission.status === 'completed' ? (
                      <span className="px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold tracking-wider shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                        MISSION COMPLETE
                      </span>
                    ) : (
                      <span className="px-4 py-1.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-xs font-bold tracking-wider animate-pulse">
                        ACTIVE EXECUTION
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col xl:flex-row items-stretch gap-6">
                  
                  {/* INPUT */}
                  <div className="flex-1 flex flex-col group">
                    <Label text="Input Cliente (Prompt)" />
                    <div className="relative flex-1">
                      <textarea
                        disabled={mission.status === 'completed'}
                        defaultValue={mission.client_requirements || ""}
                        onChange={(e) => setClientInput(e.target.value)}
                        placeholder="Incolla qui la risposta del cliente..."
                        className="w-full h-full min-h-[300px] bg-black/40 border border-gray-800 rounded-2xl p-6 text-sm text-gray-300 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none resize-none transition-all group-hover:border-gray-700/50 placeholder:text-gray-700"
                      />
                      <div className="absolute bottom-4 right-4 text-[10px] text-gray-600 uppercase font-bold tracking-widest pointer-events-none">Input Area</div>
                    </div>
                  </div>

                  {/* ACTION TRIGGER */}
                  <div className="flex flex-col items-center justify-center px-4 py-6 xl:py-0">
                    {executingId === mission.id ? (
                      <div className="relative">
                        <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 animate-pulse" />
                        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin relative z-10" />
                      </div>
                    ) : (
                      <button 
                        onClick={() => handleExecuteWork(mission.id)}
                        disabled={mission.status === 'completed'}
                        className={`group relative p-5 rounded-full transition-all duration-500 ${
                          mission.status === 'completed' 
                            ? 'bg-gray-800 cursor-not-allowed opacity-50' 
                            : 'bg-gradient-to-br from-indigo-600 to-purple-600 hover:scale-110 hover:shadow-[0_0_30px_rgba(99,102,241,0.4)]'
                        }`}
                      >
                         <ArrowRight className={`w-6 h-6 text-white transition-transform duration-300 ${mission.status !== 'completed' && 'group-hover:translate-x-1'}`} />
                      </button>
                    )}
                  </div>

                  {/* OUTPUT */}
                  <div className="flex-1 flex flex-col">
                     <Label text="Final Deliverable (Output)" />
                     <div className={`flex-1 rounded-2xl p-6 relative overflow-hidden min-h-[300px] transition-all duration-500 ${
                       mission.status === 'completed' 
                         ? 'bg-emerald-950/10 border border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.05)]' 
                         : 'bg-black/40 border border-gray-800 border-dashed'
                     }`}>
                        {mission.final_work_content ? (
                          <pre className="text-xs text-emerald-100 font-mono whitespace-pre-wrap h-full overflow-y-auto custom-scrollbar leading-relaxed">
                            {mission.final_work_content}
                          </pre>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-gray-700">
                            <Cpu className="w-12 h-12 mb-4 opacity-20" />
                            <span className="text-xs font-medium uppercase tracking-widest opacity-50">Waiting for processing...</span>
                          </div>
                        )}
                     </div>
                  </div>

                </div>
              </GlassCard>
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}

// --- SOTTO-COMPONENTI SENSORIALI ---

function MissionDiscoveryCard({ mission, onDevelop, loading }: { mission: Mission, onDevelop: (id: string) => void, loading: boolean }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={`relative bg-[#13151a] border border-gray-800/50 rounded-xl transition-all duration-300 overflow-hidden group ${isOpen ? 'shadow-2xl ring-1 ring-indigo-500/30' : 'hover:border-gray-700'}`}>
      {/* Barra laterale di stato */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-transparent via-indigo-500/0 to-transparent group-hover:via-indigo-500 transition-all duration-500" />

      <div className="p-5 flex items-center justify-between relative z-10">
        <div className="flex-1 cursor-pointer pr-4" onClick={() => setIsOpen(!isOpen)}>
          <div className="flex items-center gap-3 mb-2">
             <h3 className="font-bold text-white text-lg group-hover:text-indigo-200 transition-colors">{mission.title}</h3>
             <span className="text-[10px] bg-gray-800 border border-gray-700 px-2 py-0.5 rounded text-gray-400 uppercase tracking-wide">{mission.company_name}</span>
          </div>
          <div className="text-sm text-gray-500 flex gap-6 font-mono">
             <span className="flex items-center gap-1"><span className="text-emerald-400">€{mission.reward_amount}</span>/hr</span>
             <span className="flex items-center gap-1 text-indigo-400">Match: {mission.match_score}%</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
           <button onClick={() => setIsOpen(!isOpen)} className="text-gray-600 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5">
             {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
           </button>
           <button 
             onClick={() => onDevelop(mission.id)}
             disabled={loading}
             className="relative overflow-hidden bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg shadow-indigo-900/20 active:scale-95 disabled:opacity-50 disabled:scale-100 group/btn"
             title="Avvia Sviluppo"
           >
             {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play size={20} fill="currentColor" className="relative z-10" />}
             <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300" />
           </button>
        </div>
      </div>

      {/* Accordion Dettagli con animazione smooth */}
      <div className={`grid transition-all duration-500 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="px-5 pb-5 pt-0">
             <div className="pt-4 border-t border-gray-800/50 grid md:grid-cols-2 gap-6 text-sm">
                <div className="bg-indigo-900/10 p-4 rounded-lg border border-indigo-500/10">
                  <span className="block font-bold text-indigo-400 text-xs uppercase tracking-wider mb-2">Analisi AI</span>
                  <p className="text-indigo-100 leading-relaxed">{mission.analysis_notes}</p>
                </div>
                <div className="p-4 rounded-lg border border-gray-800/50">
                  <span className="block font-bold text-gray-500 text-xs uppercase tracking-wider mb-2">Source Brief</span>
                  <p className="text-gray-400 line-clamp-3 leading-relaxed italic">{mission.description}</p>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const Label = ({ text }: { text: string }) => (
  <h4 className="flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase tracking-[0.15em] mb-3 pl-1 border-l-2 border-indigo-500/50">
    {text}
  </h4>
);
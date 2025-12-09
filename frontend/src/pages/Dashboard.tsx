import React, { useState, useEffect, useRef } from 'react';
import apiClient from '../lib/apiClient';
import { 
  User, ChevronDown, ChevronUp, Play, 
  CheckCircle, XCircle, ArrowRight, Briefcase, 
  Loader2, Sparkles, Cpu, Activity, Lock, Search, Radar, AlertTriangle, ExternalLink, Paperclip, File as FileIcon, Zap, Calendar, Award
} from 'lucide-react';
import { Link } from 'react-router-dom';

// ==================================================================================
// 1. DEFINIZIONE TIPI E INTERFACCE
// ==================================================================================

interface Mission {
  id: string;
  title: string;
  description: string;
  company_name: string;
  source_url: string;
  reward_amount: number;
  estimated_duration_hours: number;
  status: string;
  created_at: string;
  match_score?: number;
  analysis_notes?: string;
  final_deliverable_json?: any;
  final_work_content?: string;
  client_requirements?: string;
  platform?: string;
  type?: 'daily' | 'weekly' | 'monthly'; // Supporto per i nuovi tipi
}

interface AttachedFile {
  name: string;
  type: string;
  content: string; 
}

// ==================================================================================
// 2. UTILS & HELPERS
// ==================================================================================

const readFileContent = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
      const reader = new FileReader();
      // Immagini -> Base64 (per GPT Vision in futuro)
      if (file.type.startsWith('image/')) {
          reader.readAsDataURL(file);
      } else {
          // Documenti/Codice -> Testo Semplice
          reader.readAsText(file);
      }
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
  });
};

// ==================================================================================
// 3. COMPONENTI UI GENERICI
// ==================================================================================

const GlassCard = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`relative bg-[#0f1115]/60 backdrop-blur-xl border border-white/5 shadow-2xl rounded-2xl overflow-hidden transition-all duration-500 hover:shadow-indigo-500/10 hover:border-white/10 ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
    {children}
  </div>
);

const SectionHeader = ({ title, icon: Icon, colorClass = "text-indigo-400", bgClass = "bg-indigo-500/10", rightElement }: { title: string, icon: any, colorClass?: string, bgClass?: string, rightElement?: React.ReactNode }) => (
  <div className="flex items-center justify-between mb-8 group cursor-default">
    <div className="flex items-center gap-4">
        <div className={`p-3 rounded-xl ${bgClass} border border-white/5 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
        <Icon className={`w-6 h-6 ${colorClass}`} />
        </div>
        <h2 className="text-2xl font-bold text-white tracking-tight group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-gray-400 transition-all duration-300">
        {title}
        </h2>
    </div>
    {rightElement}
  </div>
);

const ActionButton = ({ onClick, disabled, icon: Icon, variant = 'primary' }: { onClick: () => void, disabled?: boolean, icon: any, variant?: 'primary' | 'danger' | 'success' }) => {
  const baseClasses = "p-3 rounded-xl transition-all duration-300 flex items-center justify-center shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-indigo-500/20 hover:shadow-indigo-500/40",
    danger: "bg-gray-800/50 hover:bg-red-500/20 text-gray-400 hover:text-red-400 border border-transparent hover:border-red-500/30",
    success: "bg-gray-800/50 hover:bg-emerald-500/20 text-gray-400 hover:text-emerald-400 border border-transparent hover:border-emerald-500/30"
  };
  return <button onClick={onClick} disabled={disabled} className={`${baseClasses} ${variants[variant]}`}><Icon className="w-5 h-5" /></button>;
};

const NotificationToast = ({ message, type, onClose }: { message: string, type: 'success' | 'error', onClose: () => void }) => (
  <div className={`fixed top-24 right-6 z-50 flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl backdrop-blur-md border animate-in slide-in-from-right duration-500 ${type === 'success' ? 'bg-emerald-900/90 border-emerald-500/30 text-emerald-100' : 'bg-red-900/90 border-red-500/30 text-red-100'}`}>
    {type === 'success' ? <CheckCircle className="w-6 h-6 text-emerald-400" /> : <AlertTriangle className="w-6 h-6 text-red-400" />}
    <div className="flex flex-col">
        <span className="font-bold text-sm uppercase tracking-wide">{type === 'success' ? 'Successo' : 'Attenzione'}</span>
        <span className="font-medium text-sm opacity-90">{message}</span>
    </div>
    <button onClick={onClose} className="ml-4 p-1 hover:bg-white/10 rounded-full transition-colors"><XCircle className="w-5 h-5" /></button>
  </div>
);

const Label = ({ text }: { text: string }) => (<h4 className="flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase tracking-[0.15em] mb-3 pl-1 border-l-2 border-indigo-500/50">{text}</h4>);


// ==================================================================================
// 4. COMPONENTI SPECIFICI (Cards)
// ==================================================================================

// --- CARD MISSIONE ATTIVA (Layout 3 - Esecuzione) ---
function ActiveMissionCard({ mission, onExecute }: { mission: Mission, onExecute: (id: string, text: string, files: AttachedFile[]) => Promise<void> }) {
  // Stato locale isolato per ogni card
  const [localInput, setLocalInput] = useState(mission.client_requirements || "");
  const [localAttachments, setLocalAttachments] = useState<AttachedFile[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const processed: AttachedFile[] = [];
      for (const f of newFiles) {
        try {
          const content = await readFileContent(f);
          processed.push({ name: f.name, type: f.type, content });
        } catch (err) { console.error(err); }
      }
      setLocalAttachments([...localAttachments, ...processed]);
    }
  };

  const triggerExecution = async () => {
    // Validazione: Deve esserci testo OPPURE file OPPURE un requisito precedente
    const hasText = localInput && localInput.trim().length > 0;
    const hasFiles = localAttachments.length > 0;

    if (!hasText && !hasFiles && !mission.client_requirements) {
        alert("Inserisci un comando o allega un file per procedere.");
        return;
    }

    setIsExecuting(true);
    await onExecute(mission.id, localInput, localAttachments);
    setIsExecuting(false);
    
    // Non cancelliamo l'input per facilitare la "rifinitura" del prompt (Chat style)
    setLocalAttachments([]); // I file invece li togliamo dopo l'invio
  };

  return (
    <GlassCard className="p-8 border-l-4 border-l-emerald-500">
      <div className="mb-8 pb-6 border-b border-white/5">
        <div className="flex justify-between items-start">
            <div>
                <h3 className="text-2xl font-bold text-white">{mission.title}</h3>
                <p className="text-gray-500 text-sm mt-1">@ {mission.company_name}</p>
            </div>
            {/* Badge Tipo Missione */}
            {mission.type && (
                <span className={`px-3 py-1 rounded text-[10px] uppercase font-bold tracking-widest border 
                    ${mission.type === 'weekly' ? 'bg-blue-900/20 text-blue-400 border-blue-500/30' : 
                      mission.type === 'monthly' ? 'bg-purple-900/20 text-purple-400 border-purple-500/30' : 
                      'bg-yellow-900/20 text-yellow-400 border-yellow-500/30'}`}>
                    {mission.type}
                </span>
            )}
        </div>
      </div>
      
      <div className="flex flex-col xl:flex-row items-stretch gap-6">
        {/* INPUT AREA */}
        <div className="flex-1 flex flex-col group relative">
          <Label text="Input Cliente & Materiale (Chat)" />
          <div className="relative flex-1 bg-black/40 border border-gray-800 rounded-2xl overflow-hidden focus-within:border-indigo-500 transition-colors flex flex-col">
            <textarea 
              disabled={isExecuting} 
              value={localInput}
              onChange={(e) => setLocalInput(e.target.value)}
              placeholder="Scrivi qui la tua richiesta o allega file di supporto..." 
              className="w-full flex-1 bg-transparent border-none p-6 text-sm text-gray-300 outline-none resize-none placeholder:text-gray-700 font-mono" 
            />
            
            {/* AREA ALLEGATI */}
            <div className="p-4 border-t border-gray-800 bg-[#0a0a0c]/50 flex items-center justify-between">
                <div className="flex flex-wrap gap-2">
                  {localAttachments.map((file, i) => (
                      <div key={i} className="flex items-center gap-2 bg-indigo-900/20 border border-indigo-500/30 px-3 py-1 rounded-full text-xs text-indigo-300">
                          <FileIcon className="w-3 h-3" /> <span className="max-w-[100px] truncate">{file.name}</span>
                          <button onClick={() => setLocalAttachments(localAttachments.filter((_, idx) => idx !== i))} className="hover:text-white"><XCircle className="w-3 h-3" /></button>
                      </div>
                  ))}
                </div>
                <div className="flex items-center">
                  <input type="file" multiple ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                  <button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Allega File">
                      <Paperclip className="w-5 h-5" />
                  </button>
                </div>
            </div>
          </div>
        </div>

        {/* TASTO ESECUZIONE (Sempre attivo per Loop) */}
        <div className="flex flex-col items-center justify-center px-4">
          {isExecuting ? <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" /> : 
            <button onClick={triggerExecution} className="p-5 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 hover:scale-110 shadow-lg shadow-indigo-500/30 transition-all active:scale-95" title="Invia all'AI">
              <ArrowRight className="w-6 h-6 text-white" />
            </button>
          }
        </div>

        {/* OUTPUT AREA */}
        <div className="flex-1 flex flex-col">
          <Label text="Risposta AI (Latest)" />
          <div className={`flex-1 rounded-2xl p-6 relative overflow-hidden min-h-[300px] transition-all duration-500 ${mission.final_work_content ? 'bg-emerald-950/10 border border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.05)]' : 'bg-black/40 border border-gray-800 border-dashed'}`}>
            {mission.final_work_content ? (
                <pre className="text-xs text-emerald-100 font-mono whitespace-pre-wrap h-full overflow-y-auto custom-scrollbar leading-relaxed">
                    {mission.final_work_content}
                </pre>
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-700">
                    <Cpu className="w-12 h-12 mb-4 opacity-20" />
                    <span className="text-xs font-medium uppercase tracking-widest opacity-50">In attesa di input...</span>
                </div>
            )}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

// --- CARD DISCOVERY (Layout 1 - Radar) ---
function MissionDiscoveryCard({ mission, onDevelop, loading }: any) {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <div className={`relative bg-[#13151a] border border-gray-800/50 rounded-xl overflow-hidden mb-4 transition-all ${isOpen ? 'ring-1 ring-indigo-500/50 shadow-2xl' : 'hover:border-gray-700'}`}>
        
        {/* HEADER VISIBILE */}
        <div className="p-5 flex justify-between items-start cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
            <div className="flex items-start gap-4">
                {/* Visual Indicator Type */}
                <div className={`mt-1 w-1.5 h-10 rounded-full ${mission.type === 'monthly' ? 'bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]' : mission.type === 'weekly' ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]'}`}></div>
                
                <div>
                    <h3 className="text-white font-bold text-lg leading-tight group-hover:text-indigo-300 transition-colors">{mission.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-gray-400 bg-gray-800 px-2 py-0.5 rounded border border-gray-700 uppercase tracking-wide">{mission.company_name}</span>
                        <span className="text-[10px] text-gray-500 uppercase tracking-wide">• {mission.platform} • {mission.type ? mission.type.toUpperCase() : 'DAILY'}</span>
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-end gap-2">
                <span className="text-emerald-400 font-mono font-bold text-lg">€{mission.reward_amount}</span>
                <button 
                    onClick={(e) => { e.stopPropagation(); onDevelop(mission.id); }} 
                    disabled={loading} 
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-lg shadow-indigo-900/20 active:scale-95 disabled:opacity-50"
                >
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-current" />}
                    {loading ? 'WAIT' : 'START'}
                </button>
            </div>
        </div>

        {/* CONTENUTO ESPANSO (DESCRIZIONE + LINK) */}
        <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
            <div className="overflow-hidden">
                <div className="px-5 pb-5 pt-0 border-t border-gray-800/50">
                    
                    {/* Descrizione Completa */}
                    <div className="mt-4 mb-4">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest block mb-2">Briefing Missione</span>
                        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{mission.description}</p>
                    </div>

                    {/* Analisi AI e Link Fonte */}
                    <div className="flex items-center justify-between bg-black/20 p-3 rounded-lg border border-white/5">
                        <p className="text-xs text-indigo-300 italic">"{mission.analysis_notes}"</p>
                        
                        {mission.source_url && (
                            <a 
                                href={mission.source_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-white transition-colors bg-white/5 px-3 py-1.5 rounded hover:bg-white/10"
                                onClick={(e) => e.stopPropagation()} 
                            >
                                <ExternalLink className="w-3 h-3" /> VAI ALLA FONTE
                            </a>
                        )}
                    </div>
                </div>
            </div>
        </div>
      </div>
    );
}

// ==================================================================================
// 5. MAIN DASHBOARD PAGE
// ==================================================================================

export default function Dashboard() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isHunting, setIsHunting] = useState(false);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [selectedDevMissionId, setSelectedDevMissionId] = useState<string>("");
  const [mounted, setMounted] = useState(false);
  
  // SELETTORE MODALITÀ DI CACCIA
  const [huntMode, setHuntMode] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  useEffect(() => setMounted(true), []);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), type === 'error' ? 7000 : 4000);
  };

  const fetchMissions = async () => {
    try {
      const res = await apiClient.get('/missions/my-missions?limit=50');
      const parsedData = res.data.data.map((m: any) => ({
        ...m,
        final_deliverable_json: typeof m.final_deliverable_json === 'string' ? JSON.parse(m.final_deliverable_json) : m.final_deliverable_json
      }));
      setMissions(parsedData);
      const firstDev = parsedData.find((m: any) => m.status === 'developed');
      if (firstDev && !selectedDevMissionId) setSelectedDevMissionId(firstDev.id);
    } catch (e) { console.error("Errore fetch", e); }
  };
  useEffect(() => { fetchMissions(); }, []);

  const pendingMissions = missions.filter(m => m.status === 'pending');
  const developedMissions = missions.filter(m => m.status === 'developed');
  const activeMissions = missions.filter(m => ['active', 'completed'].includes(m.status));

  // --- HANDLERS ---
  
  const handleHunt = async () => {
    if (isHunting) return;
    setIsHunting(true);
    
    // Routing dinamico in base al Tab selezionato
    let endpoint = '/missions/hunt';
    if (huntMode === 'weekly') endpoint = '/missions/hunt/weekly';
    if (huntMode === 'monthly') endpoint = '/missions/hunt/monthly';

    try {
        const res = await apiClient.post(endpoint);
        if (res.data.success) {
            showNotification(`Caccia ${huntMode.toUpperCase()} completata! Trovate ${res.data.data.length} nuove opportunità.`, 'success');
            await fetchMissions();
        }
    } catch (e: any) {
        const errorMsg = e.response?.data?.error || "Errore sconosciuto.";
        if (errorMsg.includes("Quota")) showNotification(`🛑 LIMITE ${huntMode.toUpperCase()} RAGGIUNTO.`, 'error');
        else showNotification(`Errore Caccia: ${errorMsg}`, 'error');
    } finally { setIsHunting(false); }
  };

  const handleDevelop = async (id: string) => {
    setLoadingId(id);
    try {
      await apiClient.post(`/missions/${id}/develop`);
      await fetchMissions();
      showNotification("Strategia generata!", 'success');
    } catch (e) { showNotification("Errore sviluppo.", 'error'); } finally { setLoadingId(null); }
  };

  const handleReject = async (id: string) => {
    if(!confirm("Confermi lo scarto?")) return;
    try { await apiClient.post(`/missions/${id}/reject`); await fetchMissions(); setSelectedDevMissionId(""); showNotification("Missione rimossa.", 'success'); } catch (e) { showNotification("Errore rifiuto.", 'error'); }
  };
  const handleAccept = async (id: string) => {
    try { await apiClient.patch(`/missions/${id}/status`, { status: 'active' }); await fetchMissions(); showNotification("Missione accettata!", 'success'); } catch (e) { showNotification("Errore accettazione.", 'error'); }
  };

  const handleExecuteProxy = async (id: string, text: string, files: AttachedFile[]) => {
    try {
      await apiClient.post(`/missions/${id}/execute`, { clientRequirements: text, attachments: files });
      await fetchMissions();
      showNotification("Lavoro completato dall'AI!", 'success');
    } catch (e) { 
        showNotification("Errore esecuzione. Verifica stato missione.", 'error'); 
        throw e; 
    } 
  };

  const currentDevMission = developedMissions.find(m => m.id === selectedDevMissionId) || developedMissions[0];

  // Config UI dinamica
  const getHuntUI = () => {
      switch(huntMode) {
          case 'weekly': return { color: 'blue', label: 'CACCIA SETTIMANALE (SPRINT)', icon: Calendar };
          case 'monthly': return { color: 'purple', label: 'CACCIA MENSILE (RETAINER)', icon: Award };
          default: return { color: 'yellow', label: 'CACCIA GIORNALIERA (DAILY)', icon: Zap };
      }
  };
  const huntUI = getHuntUI();

  return (
    <div className={`min-h-screen bg-[#050507] text-gray-100 font-sans pb-20 selection:bg-indigo-500/30 selection:text-white transition-opacity duration-1000 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
      {notification && <NotificationToast message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
      <div className="fixed inset-0 pointer-events-none"><div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-900/10 rounded-full blur-[120px]" /><div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-900/10 rounded-full blur-[120px]" /></div>
      
      <nav className="sticky top-4 z-50 mx-4 md:mx-8 mb-12">
        <div className="bg-[#0f1115]/80 backdrop-blur-md border border-white/5 rounded-2xl px-6 py-4 flex justify-between items-center shadow-2xl">
          <div className="flex items-center gap-3"><div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center shadow-lg"><span className="font-bold text-white text-lg">W</span></div><div className="flex flex-col"><span className="text-lg font-bold tracking-tight text-white leading-none">MOON</span><span className="text-[10px] font-medium text-gray-500 tracking-[0.2em] uppercase">Intelligence Core</span></div></div>
          <Link to="/profile" className="w-10 h-10 rounded-full bg-gray-800/50 hover:bg-white/10 flex items-center justify-center border border-white/5"><User className="w-5 h-5 text-gray-400" /></Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 relative z-10 space-y-16">
        
        {/* 1. RADAR MISSIONI CON TAB */}
        <section>
          <SectionHeader title="1. Radar Missioni" icon={Radar} colorClass={`text-${huntUI.color}-400`} bgClass={`bg-${huntUI.color}-400/10`} 
            rightElement={
                <div className="flex flex-col items-end gap-3">
                    {/* TAB SELECTION */}
                    <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                        <button onClick={() => setHuntMode('daily')} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${huntMode === 'daily' ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'text-gray-500 hover:text-white'}`}>Daily</button>
                        <button onClick={() => setHuntMode('weekly')} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${huntMode === 'weekly' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-gray-500 hover:text-white'}`}>Weekly</button>
                        <button onClick={() => setHuntMode('monthly')} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${huntMode === 'monthly' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'text-gray-500 hover:text-white'}`}>Monthly</button>
                    </div>
                    
                    {/* BUTTON AVVIO */}
                    <button 
                        onClick={handleHunt} 
                        disabled={isHunting}
                        className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-bold tracking-wide transition-all shadow-xl active:scale-95 w-full justify-center
                        ${isHunting ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 
                          huntMode === 'weekly' ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-blue-500/20' :
                          huntMode === 'monthly' ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white shadow-purple-500/20' :
                          'bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white shadow-orange-500/20'
                        }`}
                    >
                        {isHunting ? <Loader2 className="w-4 h-4 animate-spin" /> : <huntUI.icon className="w-4 h-4" />}
                        {isHunting ? 'SCANNING...' : huntUI.label}
                    </button>
                </div>
            }
          />
          <div className="grid grid-cols-1 gap-4">
            {pendingMissions.length === 0 ? (
                <div className="p-12 text-center border-2 border-dashed border-gray-800 rounded-3xl opacity-50"><p className="text-gray-500">Radar Inattivo. Avvia la caccia.</p></div>
            ) : (
                pendingMissions.map((mission, idx) => (
                    <div key={mission.id} className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: `${idx * 100}ms` }}>
                        <MissionDiscoveryCard mission={mission} onDevelop={handleDevelop} loading={loadingId === mission.id} />
                    </div>
                ))
            )}
          </div>
        </section>

        {/* 2. LABORATORIO TATTICO */}
        <section>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8">
            <SectionHeader title="2. Laboratorio Tattico" icon={Cpu} colorClass="text-indigo-400" bgClass="bg-indigo-500/10" />
            <div className="relative w-full md:w-96 z-20"><select value={selectedDevMissionId} onChange={(e) => setSelectedDevMissionId(e.target.value)} className="w-full bg-[#0a0a0c] border border-gray-700 text-white text-sm rounded-xl block p-3 pr-10 shadow-xl" disabled={developedMissions.length === 0}>{developedMissions.map(m => (<option key={m.id} value={m.id}>{m.title.substring(0, 50)}...</option>))}</select></div>
          </div>
          <GlassCard className="min-h-[600px] flex flex-col">
            {currentDevMission ? (
              <div className="p-8 flex-1 overflow-y-auto space-y-8 custom-scrollbar">
                <div className="flex justify-between items-center"><h3 className="text-xl font-bold text-white">{currentDevMission.title}</h3>{currentDevMission.source_url && <a href={currentDevMission.source_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-indigo-400 hover:text-white text-xs font-bold uppercase tracking-widest bg-[#13151a] px-3 py-1 rounded border border-gray-700 hover:border-indigo-500 transition-all"><ExternalLink className="w-3 h-3" /> Link Diretto</a>}</div>
                <div className="grid lg:grid-cols-2 gap-8">
                    <div className="space-y-3"><Label text="Protocollo Candidatura" /><div className="bg-black/40 p-5 rounded-xl border border-white/5 font-mono text-xs text-gray-300 whitespace-pre-wrap">{currentDevMission.final_deliverable_json?.deliverable_content}</div></div>
                    <div className="space-y-3"><Label text="Asset Bonus" /><div className="bg-emerald-900/5 p-5 rounded-xl border border-emerald-500/10 font-mono text-xs text-emerald-100/90 whitespace-pre-wrap">{currentDevMission.final_deliverable_json?.bonus_material_content}</div></div>
                </div>
                <div className="flex gap-4 justify-end pt-4 border-t border-white/5"><ActionButton onClick={() => handleReject(currentDevMission.id)} icon={XCircle} variant="danger" /><ActionButton onClick={() => handleAccept(currentDevMission.id)} icon={CheckCircle} variant="success" /></div>
              </div>
            ) : <div className="flex flex-col items-center justify-center h-full text-gray-700"><Lock className="w-8 h-8 opacity-20" /><p className="text-sm uppercase tracking-widest">Modulo Inattivo</p></div>}
          </GlassCard>
        </section>

        {/* 3. ESECUZIONE & DELIVERY (CHAT MODE) */}
        <section>
          <SectionHeader title="3. Esecuzione & Delivery" icon={Briefcase} colorClass="text-emerald-400" bgClass="bg-emerald-500/10" />
          <div className="space-y-12">
            {activeMissions.length === 0 && <div className="text-center py-20 border-2 border-dashed border-gray-800 rounded-3xl opacity-50"><p className="text-gray-500">Nessuna missione in corso.</p></div>}
            {activeMissions.map(mission => (
              <ActiveMissionCard key={mission.id} mission={mission} onExecute={handleExecuteProxy} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
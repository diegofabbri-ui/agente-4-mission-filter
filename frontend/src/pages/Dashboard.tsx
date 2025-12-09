import React, { useState, useEffect, useRef } from 'react';
import apiClient from '../lib/apiClient';
import { 
  User, ChevronDown, ChevronUp, Play, CheckCircle, XCircle, ArrowRight, Briefcase, 
  Loader2, Sparkles, Cpu, Activity, Lock, Search, Radar, ExternalLink, Paperclip, File as FileIcon, Zap, Calendar, Award
} from 'lucide-react';
import { Link } from 'react-router-dom';

// ... (Interfacce Mission e AttachedFile uguali a prima) ...
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
  type?: 'daily' | 'weekly' | 'monthly';
  raw_data?: any; // Qui ci sono i dati del grafico
}

interface AttachedFile { name: string; type: string; content: string; }

const readFileContent = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
      const reader = new FileReader();
      if (file.type.startsWith('image/')) reader.readAsDataURL(file);
      else reader.readAsText(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
  });
};

const GlassCard = ({ children, className = "" }: any) => (
  <div className={`relative bg-[#0f1115]/60 backdrop-blur-xl border border-white/5 shadow-2xl rounded-2xl overflow-hidden ${className}`}>{children}</div>
);

// ... (SectionHeader, ActionButton, NotificationToast, Label rimangono uguali) ...
const SectionHeader = ({ title, icon: Icon, colorClass = "text-indigo-400", bgClass = "bg-indigo-500/10", rightElement }: any) => (
  <div className="flex items-center justify-between mb-8 group cursor-default">
    <div className="flex items-center gap-4">
        <div className={`p-3 rounded-xl ${bgClass} border border-white/5 shadow-lg group-hover:scale-110 transition-transform duration-300`}><Icon className={`w-6 h-6 ${colorClass}`} /></div>
        <h2 className="text-2xl font-bold text-white tracking-tight">{title}</h2>
    </div>
    {rightElement}
  </div>
);
const ActionButton = ({ onClick, disabled, icon: Icon, variant = 'primary' }: any) => {
    // ... (copia dal precedente se serve, o usa quello standard)
    return <button onClick={onClick} disabled={disabled} className="p-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white"><Icon className="w-5 h-5"/></button>
};
const NotificationToast = ({ message, type, onClose }: any) => (
    <div className={`fixed top-24 right-6 z-50 flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl backdrop-blur-md border animate-in slide-in-from-right duration-500 ${type === 'success' ? 'bg-emerald-900/90 border-emerald-500/30 text-emerald-100' : 'bg-red-900/90 border-red-500/30 text-red-100'}`}>
        <span>{message}</span><button onClick={onClose}><XCircle className="w-4 h-4"/></button>
    </div>
);
const Label = ({ text }: { text: string }) => (<h4 className="flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase tracking-[0.15em] mb-3 pl-1 border-l-2 border-indigo-500/50">{text}</h4>);


// --- NUOVO COMPONENTE: GRAFICO GEOMETRICO DINAMICO ---
const TaskPolygonGraph = ({ tasks }: { tasks: { label: string, percent: number }[] }) => {
    if (!tasks || tasks.length < 3) return null; // Minimo un triangolo

    const size = 100;
    const center = size / 2;
    const radius = 40;
    const sides = tasks.length;
    
    // Calcola i vertici del poligono
    const points = tasks.map((_, i) => {
        const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        return `${x},${y}`;
    }).join(' ');

    return (
        <div className="flex items-center gap-6 bg-black/20 p-4 rounded-xl border border-white/5">
            <div className="relative w-24 h-24 flex-shrink-0">
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                    {/* Poligono Sfondo */}
                    <polygon points={points} fill="rgba(99, 102, 241, 0.2)" stroke="rgba(99, 102, 241, 0.5)" strokeWidth="1" />
                    {/* Raggi dal centro */}
                    {tasks.map((_, i) => {
                        const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
                        const x = center + radius * Math.cos(angle);
                        const y = center + radius * Math.sin(angle);
                        return <line key={i} x1={center} y1={center} x2={x} y2={y} stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
                    })}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-white">{sides} Lati</span>
                </div>
            </div>
            
            {/* Legenda Percentuali */}
            <div className="flex-1 grid grid-cols-2 gap-2">
                {tasks.map((task, i) => (
                    <div key={i} className="flex flex-col">
                        <span className="text-[10px] text-gray-500 uppercase tracking-wide">{task.label}</span>
                        <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500" style={{ width: `${task.percent}%` }} />
                            </div>
                            <span className="text-xs font-mono text-indigo-300">{task.percent}%</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- CARD DISCOVERY AGGIORNATA (Layout 1) ---
function MissionDiscoveryCard({ mission, onDevelop, loading }: any) {
    const [isOpen, setIsOpen] = useState(false);
    
    // Estrazione dati per il grafico (se presenti nel raw_data)
    let tasksBreakdown = [];
    try {
        const raw = typeof mission.raw_data === 'string' ? JSON.parse(mission.raw_data) : mission.raw_data;
        tasksBreakdown = raw?.tasks_breakdown || [];
    } catch(e) {}

    return (
      <div className={`relative bg-[#13151a] border border-gray-800/50 rounded-xl overflow-hidden mb-4 transition-all ${isOpen ? 'ring-1 ring-indigo-500/50 shadow-2xl' : 'hover:border-gray-700'}`}>
        {/* HEADER */}
        <div className="p-5 flex justify-between items-start cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
            <div className="flex items-start gap-4">
                <div className={`mt-1 w-1.5 h-10 rounded-full ${mission.type === 'monthly' ? 'bg-purple-500' : mission.type === 'weekly' ? 'bg-blue-500' : 'bg-yellow-500'}`}></div>
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
                <button onClick={(e) => { e.stopPropagation(); onDevelop(mission.id); }} disabled={loading} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50">
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-current" />}
                    {loading ? 'WAIT' : 'START'}
                </button>
            </div>
        </div>

        {/* EXPANDED */}
        <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
            <div className="overflow-hidden">
                <div className="px-5 pb-5 pt-0 border-t border-gray-800/50">
                    
                    {/* Descrizione Completa */}
                    <div className="mt-4 mb-4">
                        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{mission.description}</p>
                    </div>

                    {/* Grafico Geometrico (Se ci sono i dati) */}
                    {tasksBreakdown.length > 0 && (
                        <div className="mb-4">
                            <TaskPolygonGraph tasks={tasksBreakdown} />
                        </div>
                    )}

                    {/* Link Fonte Corretto */}
                    <div className="flex items-center justify-between bg-black/20 p-3 rounded-lg border border-white/5">
                        <p className="text-xs text-indigo-300 italic">"{mission.analysis_notes}"</p>
                        {mission.source_url && (
                            <a href={mission.source_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-white transition-colors bg-white/5 px-3 py-1.5 rounded hover:bg-white/10" onClick={(e) => e.stopPropagation()}>
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

// --- ACTIVE MISSION CARD (Layout 3) ---
function ActiveMissionCard({ mission, onExecute }: { mission: Mission, onExecute: (id: string, text: string, files: AttachedFile[]) => Promise<void> }) {
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
    // Validazione leggera per permettere il chat-flow
    if (!localInput && localAttachments.length === 0 && !mission.client_requirements) {
        alert("Inserisci un input.");
        return;
    }
    setIsExecuting(true);
    await onExecute(mission.id, localInput, localAttachments);
    setIsExecuting(false);
    setLocalAttachments([]);
  };

  return (
    <GlassCard className="p-8 border-l-4 border-l-emerald-500">
      <div className="mb-8 pb-6 border-b border-white/5">
        <h3 className="text-2xl font-bold text-white">{mission.title}</h3>
        <p className="text-gray-500 text-sm mt-1">@ {mission.company_name}</p>
      </div>
      <div className="flex flex-col xl:flex-row items-stretch gap-6">
        <div className="flex-1 flex flex-col group relative">
          <Label text="Chat Esecutiva" />
          <div className="relative flex-1 bg-black/40 border border-gray-800 rounded-2xl overflow-hidden flex flex-col">
            <textarea disabled={isExecuting} value={localInput} onChange={(e) => setLocalInput(e.target.value)} placeholder="Scrivi all'Agente..." className="w-full flex-1 bg-transparent border-none p-6 text-sm text-gray-300 outline-none resize-none placeholder:text-gray-700 font-mono" />
            <div className="p-4 border-t border-gray-800 bg-[#0a0a0c]/50 flex items-center justify-between">
                <div className="flex flex-wrap gap-2">{localAttachments.map((file, i) => (<div key={i} className="text-xs text-indigo-300 flex items-center gap-1"><FileIcon className="w-3 h-3"/>{file.name}</div>))}</div>
                <div className="flex items-center"><button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-white"><Paperclip className="w-5 h-5" /></button><input type="file" multiple ref={fileInputRef} className="hidden" onChange={handleFileChange} /></div>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center px-4">
          <button onClick={triggerExecution} className="p-5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg">{isExecuting ? <Loader2 className="w-6 h-6 animate-spin" /> : <ArrowRight className="w-6 h-6" />}</button>
        </div>
        <div className="flex-1 flex flex-col"><Label text="Risposta AI" /><div className="flex-1 rounded-2xl p-6 bg-emerald-950/10 border border-emerald-500/30 min-h-[300px]"><pre className="text-xs text-emerald-100 font-mono whitespace-pre-wrap">{mission.final_work_content || "..."}</pre></div></div>
      </div>
    </GlassCard>
  );
}

// --- MAIN DASHBOARD ---
export default function Dashboard() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isHunting, setIsHunting] = useState(false);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [selectedDevMissionId, setSelectedDevMissionId] = useState<string>("");
  const [huntMode, setHuntMode] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const showNotification = (message: string, type: 'success' | 'error') => { setNotification({ message, type }); setTimeout(() => setNotification(null), 4000); };

  const fetchMissions = async () => {
    try {
      const res = await apiClient.get('/missions/my-missions?limit=50');
      const parsedData = res.data.data.map((m: any) => ({ ...m, final_deliverable_json: typeof m.final_deliverable_json === 'string' ? JSON.parse(m.final_deliverable_json) : m.final_deliverable_json }));
      setMissions(parsedData);
      const firstDev = parsedData.find((m: any) => m.status === 'developed');
      if (firstDev && !selectedDevMissionId) setSelectedDevMissionId(firstDev.id);
    } catch (e) { console.error(e); }
  };
  useEffect(() => { fetchMissions(); }, []);

  const handleHunt = async () => {
    if (isHunting) return;
    setIsHunting(true);
    let endpoint = '/missions/hunt';
    if (huntMode === 'weekly') endpoint = '/missions/hunt/weekly';
    if (huntMode === 'monthly') endpoint = '/missions/hunt/monthly';
    try {
        const res = await apiClient.post(endpoint);
        if (res.data.success) { showNotification(`Caccia ${huntMode} completata!`, 'success'); await fetchMissions(); }
    } catch (e: any) { showNotification(e.response?.data?.error || "Errore Caccia", 'error'); } 
    finally { setIsHunting(false); }
  };

  const handleDevelop = async (id: string) => { /* ... Logica Develop esistente ... */ setLoadingId(id); try { await apiClient.post(`/missions/${id}/develop`); await fetchMissions(); showNotification("Strategia generata!", 'success'); } catch (e) { showNotification("Errore sviluppo.", 'error'); } finally { setLoadingId(null); } };
  const handleReject = async (id: string) => { /* ... */ if(!confirm("Confermi lo scarto?")) return; try { await apiClient.post(`/missions/${id}/reject`); await fetchMissions(); setSelectedDevMissionId(""); showNotification("Missione rimossa.", 'success'); } catch (e) { showNotification("Errore rifiuto.", 'error'); } };
  const handleAccept = async (id: string) => { /* ... */ try { await apiClient.patch(`/missions/${id}/status`, { status: 'active' }); await fetchMissions(); showNotification("Missione accettata!", 'success'); } catch (e) { showNotification("Errore accettazione.", 'error'); } };
  const handleExecuteProxy = async (id: string, text: string, files: AttachedFile[]) => { try { await apiClient.post(`/missions/${id}/execute`, { clientRequirements: text, attachments: files }); await fetchMissions(); showNotification("Lavoro completato!", 'success'); } catch (e) { showNotification("Errore esecuzione.", 'error'); throw e; } };

  const pendingMissions = missions.filter(m => m.status === 'pending');
  const developedMissions = missions.filter(m => m.status === 'developed');
  const activeMissions = missions.filter(m => ['active', 'completed'].includes(m.status));
  const currentDevMission = developedMissions.find(m => m.id === selectedDevMissionId) || developedMissions[0];

  return (
    <div className="min-h-screen bg-[#050507] text-gray-100 font-sans pb-20 selection:bg-indigo-500/30">
      {notification && <NotificationToast message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
      <div className="fixed inset-0 pointer-events-none"><div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-900/10 rounded-full blur-[120px]" /><div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-900/10 rounded-full blur-[120px]" /></div>
      
      <main className="max-w-7xl mx-auto px-6 relative z-10 space-y-16 mt-12">
        {/* SEZIONE 1: RADAR */}
        <section>
          <SectionHeader title="1. Radar Missioni" icon={Radar} colorClass="text-yellow-400" bgClass="bg-yellow-400/10" 
            rightElement={
                <div className="flex flex-col items-end gap-3">
                    <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                        <button onClick={() => setHuntMode('daily')} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase ${huntMode === 'daily' ? 'bg-yellow-500 text-black' : 'text-gray-500'}`}>Daily</button>
                        <button onClick={() => setHuntMode('weekly')} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase ${huntMode === 'weekly' ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>Weekly</button>
                        <button onClick={() => setHuntMode('monthly')} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase ${huntMode === 'monthly' ? 'bg-purple-600 text-white' : 'text-gray-500'}`}>Monthly</button>
                    </div>
                    <button onClick={handleHunt} disabled={isHunting} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-yellow-600 to-orange-600 text-white font-bold shadow-xl active:scale-95 disabled:opacity-50">
                        {isHunting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} {isHunting ? 'SCANNING...' : `CACCIA ${huntMode.toUpperCase()}`}
                    </button>
                </div>
            }
          />
          <div className="grid grid-cols-1 gap-4">
            {pendingMissions.map((m) => (<MissionDiscoveryCard key={m.id} mission={m} onDevelop={handleDevelop} loading={loadingId === m.id} />))}
            {pendingMissions.length === 0 && <div className="text-center p-12 border-2 border-dashed border-gray-800 rounded-3xl opacity-50">Radar vuoto.</div>}
          </div>
        </section>

        {/* SEZIONE 2: LAB */}
        <section>
            <div className="flex justify-between items-center mb-8">
                <SectionHeader title="2. Lab Tattico" icon={Cpu} colorClass="text-indigo-400" bgClass="bg-indigo-500/10" />
                <select value={selectedDevMissionId} onChange={(e) => setSelectedDevMissionId(e.target.value)} className="bg-[#0a0a0c] border border-gray-700 text-white text-sm rounded-xl p-3 w-64">
                    {developedMissions.map(m => <option key={m.id} value={m.id}>{m.title.substring(0,30)}...</option>)}
                </select>
            </div>
            <GlassCard className="min-h-[500px] flex flex-col">
                {currentDevMission ? (
                    <div className="p-8 space-y-8">
                        <div className="flex justify-between"><h3 className="text-2xl font-bold">{currentDevMission.title}</h3>{currentDevMission.source_url && <a href={currentDevMission.source_url} target="_blank" className="text-xs bg-white/10 px-3 py-1 rounded">LINK DIRETTO</a>}</div>
                        <div className="grid grid-cols-2 gap-8">
                            <div><Label text="Candidatura" /><div className="bg-black/40 p-4 rounded text-xs text-gray-300 whitespace-pre-wrap">{currentDevMission.final_deliverable_json?.deliverable_content}</div></div>
                            <div><Label text="Bonus" /><div className="bg-emerald-900/10 p-4 rounded text-xs text-gray-300 whitespace-pre-wrap">{currentDevMission.final_deliverable_json?.bonus_material_content}</div></div>
                        </div>
                        <div className="flex justify-end gap-4"><ActionButton onClick={() => handleReject(currentDevMission.id)} icon={XCircle} variant="danger" /><ActionButton onClick={() => handleAccept(currentDevMission.id)} icon={CheckCircle} variant="success" /></div>
                    </div>
                ) : <div className="h-full flex items-center justify-center text-gray-600">Nessuna missione in sviluppo</div>}
            </GlassCard>
        </section>

        {/* SEZIONE 3: EXECUTION */}
        <section>
            <SectionHeader title="3. Execution" icon={Briefcase} colorClass="text-emerald-400" bgClass="bg-emerald-500/10" />
            <div className="space-y-12">
                {activeMissions.map(m => <ActiveMissionCard key={m.id} mission={m} onExecute={handleExecuteProxy} />)}
            </div>
        </section>
      </main>
    </div>
  );
}
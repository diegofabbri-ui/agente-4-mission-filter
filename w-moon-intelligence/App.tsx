import React, { useState, useEffect, useCallback } from 'react';
import { UserProfile, Mission, ScoredMission, Weights } from './types';
import { calculateScore, getDefaultWeights } from './services/scoringService';
import MissionCard from './components/MissionCard';
import AnalyzerModal from './components/AnalyzerModal';

// Dati Utente Mock in Italiano
const MOCK_USER: UserProfile = {
  id: 'u1',
  name: 'Alessandro Dev',
  skills: ['TypeScript', 'React', 'Node.js', 'Python', 'Tailwind'],
  weights: getDefaultWeights(),
  lastActiveDate: new Date(),
  avgHourlyRate: 45,
  successes: 12,
  failures: 1,
  streakCount: 5,
  trustMap: { 'Upwork': 0.8, 'Diretto': 0.6, 'Telegram': 0.1 },
  skillLevel: 7.5
};

// Missioni Iniziali Mock in Italiano
const INITIAL_MISSIONS: Mission[] = [
  {
    id: 1,
    title: 'Fix Loop Infinito React',
    description: 'Debug di un problema di dipendenza useEffect in un componente della dashboard.',
    category: 'Sviluppo',
    skillsRequired: ['React', 'Debugging'],
    reward: 150,
    estTime: 2,
    difficulty: 6,
    deadline: new Date(Date.now() + 24 * 3600 * 1000), // 24h da ora
    source: 'Upwork',
    cognitiveLoad: 7,
    physicalLoad: 1
  },
  {
    id: 2,
    title: 'Agente Trasferimento Denaro Facile',
    description: 'Ricevi fondi sul tuo conto e inviali ai nostri agenti via Telegram. Tieni il 10%!',
    category: 'Finanza',
    skillsRequired: ['Conto Bancario'],
    reward: 2000,
    estTime: 0.5,
    difficulty: 1,
    deadline: new Date(Date.now() + 48 * 3600 * 1000),
    source: 'Telegram',
    cognitiveLoad: 2,
    physicalLoad: 1
  },
  {
    id: 3,
    title: 'Sito Portfolio',
    description: 'Crea un sito personale per un fotografo usando Next.js.',
    category: 'Sviluppo',
    skillsRequired: ['React', 'Next.js', 'CSS'],
    reward: 500,
    estTime: 10,
    difficulty: 7,
    deadline: new Date(Date.now() + 72 * 3600 * 1000),
    source: 'Diretto',
    cognitiveLoad: 6,
    physicalLoad: 1
  }
];

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile>(MOCK_USER);
  const [missions, setMissions] = useState<Mission[]>(INITIAL_MISSIONS);
  const [scoredMissions, setScoredMissions] = useState<ScoredMission[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Core Scoring Effect
  useEffect(() => {
    const scored = missions.map(mission => {
      const scoreResult = calculateScore(user, mission);
      return { ...mission, score: scoreResult };
    });

    // Sort by score desc
    scored.sort((a, b) => b.score.finalScore - a.score.finalScore);
    setScoredMissions(scored);
  }, [missions, user]);

  const handleAddMission = (data: Partial<Mission>) => {
    const newMission: Mission = {
      id: Date.now(),
      title: data.title || "Nuova Task",
      description: data.description || "Nessuna descrizione fornita",
      category: data.category || "Generale",
      skillsRequired: data.skillsRequired || [],
      reward: data.reward || 0,
      estTime: data.estTime || 1,
      difficulty: data.difficulty || 5,
      // @ts-ignore - parsed deadline is usually just hours offset
      deadline: new Date(Date.now() + (data.deadlineHoursFromNow || 48) * 3600 * 1000),
      source: 'Import AI',
      cognitiveLoad: data.cognitiveLoad || 5,
      physicalLoad: data.physicalLoad || 1
    };

    setMissions(prev => [newMission, ...prev]);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white">
              W
            </div>
            <span className="font-bold text-lg tracking-tight">Moon Engine</span>
          </div>
          
          <div className="flex items-center gap-4">
             <div className="hidden sm:flex flex-col items-end mr-4">
                 <span className="text-xs text-slate-400">Agente Attuale</span>
                 <span className="text-sm font-semibold text-white">{user.name}</span>
             </div>
             <button 
                onClick={() => setIsModalOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-lg shadow-indigo-600/20 flex items-center gap-2"
             >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Nuova Missione
             </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Intro / Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
           <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl">
              <span className="text-slate-400 text-xs uppercase font-bold tracking-wider">Serie Attiva</span>
              <div className="text-3xl font-black text-white mt-1">{user.streakCount} <span className="text-sm text-slate-500 font-normal">giorni</span></div>
           </div>
           <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl">
              <span className="text-slate-400 text-xs uppercase font-bold tracking-wider">Livello Skill</span>
              <div className="text-3xl font-black text-white mt-1">{user.skillLevel}<span className="text-sm text-slate-500 font-normal">/10</span></div>
           </div>
           <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl">
              <span className="text-slate-400 text-xs uppercase font-bold tracking-wider">Tariffa Media</span>
              <div className="text-3xl font-black text-white mt-1">${user.avgHourlyRate}<span className="text-sm text-slate-500 font-normal">/ora</span></div>
           </div>
        </div>

        {/* Mission List */}
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">Missioni Raccomandate</h2>
                <span className="text-xs text-slate-500">{scoredMissions.length} disponibili</span>
            </div>
            
            <div className="grid gap-4">
                {scoredMissions.map((mission) => (
                    <MissionCard key={mission.id} mission={mission} />
                ))}
            </div>

            {scoredMissions.length === 0 && (
                <div className="text-center py-20 bg-slate-800/50 rounded-xl border border-dashed border-slate-700">
                    <p className="text-slate-500">Nessuna missione trovata. Usa l'Analizzatore IA per aggiungerne.</p>
                </div>
            )}
        </div>
      </main>

      <AnalyzerModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        onAnalyzeComplete={handleAddMission}
      />
    </div>
  );
};

export default App;
import React, { useState } from 'react';
import { ScoredMission } from '../types';
import RadarChart from './RadarChart';
import { suggestImprovements } from '../services/geminiService';

interface Props {
  mission: ScoredMission;
}

const MissionCard: React.FC<Props> = ({ mission }) => {
  const [showDetails, setShowDetails] = useState(false);
  const [aiTips, setAiTips] = useState<string | null>(null);
  const [loadingTips, setLoadingTips] = useState(false);

  const { score } = mission;
  const isSafe = !score.isRejected;
  
  // Color coding based on score
  let borderColor = "border-slate-700";
  let badgeColor = "bg-slate-700 text-slate-300";

  if (!isSafe) {
    borderColor = "border-red-500/50";
    badgeColor = "bg-red-500/20 text-red-400";
  } else if (score.finalScore > 80) {
    borderColor = "border-emerald-500/50";
    badgeColor = "bg-emerald-500/20 text-emerald-400";
  } else if (score.finalScore > 50) {
    borderColor = "border-blue-500/50";
    badgeColor = "bg-blue-500/20 text-blue-400";
  }

  const handleGetTips = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (aiTips) return;
    setLoadingTips(true);
    const tips = await suggestImprovements(mission);
    setAiTips(tips);
    setLoadingTips(false);
  };

  return (
    <div 
      onClick={() => setShowDetails(!showDetails)}
      className={`relative group bg-slate-800 rounded-xl border ${borderColor} p-5 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/10 cursor-pointer overflow-hidden`}
    >
      {/* Safety Overlay for Rejected items */}
      {!isSafe && (
        <div className="absolute top-0 right-0 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-bl-xl z-10">
          PERICOLO
        </div>
      )}

      <div className="flex justify-between items-start mb-2">
        <div>
            <h3 className="text-lg font-bold text-white group-hover:text-indigo-400 transition-colors">
            {mission.title}
            </h3>
            <div className="flex gap-2 mt-1">
                <span className="text-xs text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded">{mission.category}</span>
                <span className="text-xs text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded">{mission.source}</span>
            </div>
        </div>
        <div className={`text-2xl font-black ${isSafe ? 'text-white' : 'text-red-500'}`}>
          {isSafe ? Math.round(score.finalScore) : '0'}
          <span className="text-xs font-normal text-slate-500 block text-right">W-MOON</span>
        </div>
      </div>

      <p className="text-slate-400 text-sm line-clamp-2 mb-4">{mission.description}</p>

      <div className="flex items-center gap-4 text-sm text-slate-300 mb-4">
        <div className="flex items-center gap-1">
          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          ${mission.reward}
        </div>
        <div className="flex items-center gap-1">
          <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {mission.estTime}h
        </div>
        <div className="flex items-center gap-1">
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${badgeColor}`}>
                {isSafe ? (score.finalScore > 75 ? 'RACCOMANDATO' : 'OSSERVARE') : 'RISCHIO TRUFFA'}
            </span>
        </div>
      </div>

      {/* Expanded Details */}
      {showDetails && (
        <div className="mt-4 pt-4 border-t border-slate-700 animate-fadeIn">
          {isSafe ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                 <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Analisi Algoritmo</h4>
                 <ul className="space-y-1 text-sm text-slate-300">
                    <li className="flex justify-between"><span>Compatibilità Skill:</span> <span className="text-indigo-400">{(score.factors.x1 * 100).toFixed(0)}%</span></li>
                    <li className="flex justify-between"><span>Efficienza Tempo:</span> <span className="text-indigo-400">{(score.factors.x2 * 100).toFixed(0)}%</span></li>
                    <li className="flex justify-between"><span>Potenziale Crescita:</span> <span className="text-indigo-400">{(score.factors.x5 * 100).toFixed(0)}%</span></li>
                    <li className="flex justify-between"><span>Controllo Sicurezza:</span> <span className={score.factors.x4 > 0.8 ? "text-emerald-400" : "text-amber-400"}>{(score.factors.x4 * 100).toFixed(0)}%</span></li>
                 </ul>
                 
                 <div className="mt-4">
                     {!aiTips && !loadingTips && (
                         <button 
                            onClick={handleGetTips}
                            className="text-xs flex items-center gap-1 text-indigo-400 hover:text-indigo-300"
                         >
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1010 10A10 10 0 0012 2zm0 18a8 8 0 118-8 8 8 0 01-8 8zm1-13h-2v2h2zm0 4h-2v6h2z"/></svg>
                            Chiedi consigli a Gemini
                         </button>
                     )}
                     {loadingTips && <span className="text-xs text-slate-500 animate-pulse">Gemini sta pensando...</span>}
                     {aiTips && (
                         <div className="mt-2 p-2 bg-slate-900/50 rounded text-xs text-indigo-200 border border-indigo-500/20 italic">
                             "{aiTips}"
                         </div>
                     )}
                 </div>
              </div>
              <div className="h-40">
                <RadarChart scoring={score} />
              </div>
            </div>
          ) : (
            <div className="bg-red-900/20 p-4 rounded text-red-200 text-sm border border-red-500/20">
                <strong className="block text-red-400 mb-1">Attenzione</strong>
                {score.rejectionReason}
                <p className="mt-2 text-xs opacity-70">
                    Il motore W-Moon ha rilevato pattern coerenti con attività ad alto rischio o fraudolente (corrispondenza parole chiave o anomalia ricompensa/sforzo).
                </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MissionCard;
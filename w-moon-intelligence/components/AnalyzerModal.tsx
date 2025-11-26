import React, { useState } from 'react';
import { analyzeMissionContent } from '../services/geminiService';
import { Mission } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAnalyzeComplete: (missionData: Partial<Mission>) => void;
}

const AnalyzerModal: React.FC<Props> = ({ isOpen, onClose, onAnalyzeComplete }) => {
  const [text, setText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  if (!isOpen) return null;

  const handleAnalyze = async () => {
    if (!text.trim()) return;
    setIsAnalyzing(true);
    
    // Call Gemini
    const result = await analyzeMissionContent(text);
    
    setIsAnalyzing(false);
    onAnalyzeComplete(result);
    setText('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-800 rounded-2xl w-full max-w-2xl border border-slate-700 shadow-2xl">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
             <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
             </div>
             <div>
                 <h2 className="text-xl font-bold text-white">Analizzatore Missioni Gemini</h2>
                 <p className="text-slate-400 text-sm">Incolla una descrizione del lavoro o un messaggio. L'IA la strutturerà per il punteggio W-Moon.</p>
             </div>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Incolla qui il testo... es. 'Cerco sviluppatore React per fix menu, budget $100, urgente per domani.'"
            className="w-full h-40 bg-slate-900 border border-slate-700 rounded-xl p-4 text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
          />

          <div className="flex justify-end gap-3 mt-6">
            <button 
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
            >
              Annulla
            </button>
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !text.trim()}
              className={`px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow-lg shadow-indigo-500/20 transition-all flex items-center gap-2 ${isAnalyzing ? 'opacity-70 cursor-wait' : ''}`}
            >
              {isAnalyzing ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Elaborazione...
                </>
              ) : (
                <>
                    <span>Analizza e Aggiungi</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </>
              )}
            </button>
          </div>
        </div>
        <div className="bg-slate-900/50 px-6 py-3 rounded-b-2xl border-t border-slate-700">
             <p className="text-xs text-slate-500 flex items-center gap-2">
                 <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                 Potenziato da Gemini 2.5 Flash
             </p>
        </div>
      </div>
    </div>
  );
};

export default AnalyzerModal;
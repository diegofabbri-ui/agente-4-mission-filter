import { GoogleGenAI, Type } from "@google/genai";
import { Mission } from "../types";

const getAI = () => {
    if (!process.env.API_KEY) {
        console.warn("API Key not found in process.env");
        return null;
    }
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// Default extraction to ensure the UI works even if AI fails
const mockMission: Partial<Mission> = {
    title: "Task Sconosciuta",
    description: "Impossibile analizzare la descrizione.",
    reward: 0,
    estTime: 1,
    difficulty: 5,
    skillsRequired: [],
    cognitiveLoad: 5,
    physicalLoad: 1
};

export const analyzeMissionContent = async (text: string): Promise<Partial<Mission>> => {
    const ai = getAI();
    if (!ai) return mockMission;

    const prompt = `
    Analizza la seguente descrizione del lavoro/task ed estrai i dati strutturali per il motore di punteggio W-Moon.
    
    Testo da analizzare:
    "${text}"
    
    Restituisci un oggetto JSON con:
    - title (stringa, concisa, in italiano)
    - description (stringa, riassunto, in italiano)
    - category (stringa, es. 'coding', 'design', 'admin', in italiano se possibile)
    - skillsRequired (array di stringhe)
    - reward (numero, stima valore monetario in USD o EUR, se sconosciuto stima basandoti sulla difficoltà, default 50)
    - estTime (numero, ore, default 2)
    - difficulty (numero, scala 1-10)
    - cognitiveLoad (numero, scala 1-10)
    - physicalLoad (numero, scala 1-10)
    - deadlineHoursFromNow (numero, default 48 se non specificato)
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        description: { type: Type.STRING },
                        category: { type: Type.STRING },
                        skillsRequired: { type: Type.ARRAY, items: { type: Type.STRING } },
                        reward: { type: Type.NUMBER },
                        estTime: { type: Type.NUMBER },
                        difficulty: { type: Type.NUMBER },
                        cognitiveLoad: { type: Type.NUMBER },
                        physicalLoad: { type: Type.NUMBER },
                        deadlineHoursFromNow: { type: Type.NUMBER }
                    }
                }
            }
        });

        const data = JSON.parse(response.text);
        
        return data;

    } catch (error) {
        console.error("Gemini analysis failed:", error);
        return mockMission;
    }
};

export const suggestImprovements = async (mission: Mission): Promise<string> => {
    const ai = getAI();
    if (!ai) return "AI non disponibile.";

    const prompt = `
    Agisci come un career coach che ottimizza questa missione per un freelancer.
    Rispondi rigorosamente in ITALIANO.
    
    Missione: ${mission.title}
    Compenso: ${mission.reward}
    Tempo: ${mission.estTime}h
    Descrizione: ${mission.description}

    Suggerisci 3 consigli veloci per completarla efficacemente o negoziare termini migliori. Massimo 50 parole totali.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
        });
        return response.text;
    } catch (e) {
        return "Impossibile generare consigli.";
    }
}
import OpenAI from 'openai';
import { db } from '../infra/db';
import fs from 'fs';
import path from 'path';

// Configurazione AI coerente con gli altri servizi
const AI_CONFIG = {
  openai: {
    model: 'gpt-5.1-chat-latest', // Modello strategico per negoziazione
  }
};

// Interfaccia locale per i thread
export interface MissionThreadRow {
    id: string;
    mission_id: string | null;
    user_id: string | null;
    role: 'user' | 'assistant' | 'system' | null;
    content: string;
    created_at: Date | null;
}

export class MissionManagerService {
    private openai: OpenAI;
    private kbPath: string;

    constructor() {
        this.openai = new OpenAI({ 
            apiKey: process.env.OPENAI_API_KEY
        });
        
        const isProd = process.env.NODE_ENV === 'production';
        this.kbPath = isProd 
            ? path.join(process.cwd(), 'dist', 'knowledge_base', 'developer')
            : path.join(process.cwd(), 'src', 'knowledge_base', 'developer');
    }

    private loadPrompt(filename: string): string {
        try {
            return fs.readFileSync(path.join(this.kbPath, filename), 'utf-8');
        } catch (e) {
            console.error(`❌ Errore caricamento prompt: ${filename}`);
            return ""; 
        }
    }

    // ======================================================================
    // 1. GESTIONE MESSAGGI (Chat History & Memoria)
    // ======================================================================

    public async addMessage(missionId: string, userId: string, role: 'user' | 'assistant' | 'system', content: string): Promise<void> {
        await db.insertInto('mission_threads')
            .values({
                mission_id: missionId,
                user_id: userId,
                role: role,
                content: content,
                created_at: new Date().toISOString() as any
            })
            .execute();
    }

    public async getThreadHistory(missionId: string): Promise<MissionThreadRow[]> {
        const result = await db.selectFrom('mission_threads')
            .selectAll()
            .where('mission_id', '=', missionId)
            .orderBy('created_at', 'asc')
            .execute();
            
        return result as unknown as MissionThreadRow[];
    }

    // ======================================================================
    // 2. GENERAZIONE RISPOSTA STRATEGICA (Prompt 7)
    // ======================================================================

    public async generateReply(missionId: string, userId: string, userManifesto: any): Promise<string> {
        console.log(`💬 [MANAGER] Generazione risposta strategica per ${missionId}`);
        
        const history = await this.getThreadHistory(missionId);
        const mission = await db.selectFrom('missions').selectAll().where('id', '=', missionId).executeTakeFirst();
        
        if (!mission) throw new Error("Missione non trovata");

        const strategistPrompt = this.loadPrompt('prompt_7_reply_strategist.md');
        
        // Costruisce la storia della conversazione per GPT
        const messages: any[] = history.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
        }));

        // Recupera l'ultimo messaggio reale (ignora i messaggi di sistema se possibile, o li usa come contesto)
        const lastMsgObj = history.filter(h => h.role !== 'system').pop();
        const lastMsg = lastMsgObj ? lastMsgObj.content : "Inizio conversazione";

        // Inietta il Prompt Strategico come System Message
        messages.unshift({ 
            role: 'system', 
            content: strategistPrompt
                // Supporta sia placeholder vecchi {{}} che nuovi [] per sicurezza
                .replace(/{{MISSION_TITLE}}|\[MISSION_TITLE\]/g, mission.title)
                .replace(/{{MISSION_COMPANY}}|\[MISSION_COMPANY\]/g, mission.company_name || 'Sconosciuta')
                .replace(/{{USER_ADVANTAGES}}|\[USER_ADVANTAGES\]/g, JSON.stringify(userManifesto?.unfairAdvantages || []))
                .replace(/{{USER_SKILLS}}|\[USER_SKILLS\]/g, JSON.stringify(userManifesto?.keySkillsToAcquire || []))
                .replace(/{{CLIENT_LAST_MESSAGE}}|\[CLIENT_LAST_MESSAGE\]/g, lastMsg)
        });

        try {
            const completion = await this.openai.chat.completions.create({
                model: AI_CONFIG.openai.model, 
                messages: messages,
                // Rimosso temperature per compatibilità con modelli o1/latest
            });

            const reply = completion.choices[0].message.content || "Non sono riuscito a generare una risposta efficace.";
            
            // Salva la risposta nel DB
            await this.addMessage(missionId, userId, 'assistant', reply);
            
            return reply;

        } catch (e) {
            console.error('❌ Errore in generateReply:', e);
            return "Errore critico durante la generazione della risposta.";
        }
    }

    // ======================================================================
    // 3. GESTIONE STATI E AZIONI AUTOMATICHE (Trigger)
    // ======================================================================

    public async updateStatus(missionId: string, userId: string, newStatus: string): Promise<void> {
        const mission = await db.selectFrom('missions').selectAll().where('id', '=', missionId).executeTakeFirst();
        const profile = await db.selectFrom('user_ai_profile').select('career_manifesto').where('user_id', '=', userId).executeTakeFirst();
        
        if (!mission) return;
        
        // 1. Aggiorna lo stato nel DB
        await db.updateTable('missions')
            .set({ 
                status: newStatus,
                updated_at: new Date().toISOString() as any
            })
            .where('id', '=', missionId)
            .execute();

        console.log(`✅ Stato Missione ${missionId} aggiornato a: ${newStatus}`);

        // 2. Trigger Azioni Automatiche
        if (newStatus === 'interviewing') {
            // Se passiamo a "Colloquio", generiamo la scheda di preparazione (Prompt 8)
            await this.generateInterviewPrep(mission, userId, profile?.career_manifesto);
        } else if (newStatus === 'applied') {
            await this.addMessage(missionId, userId, 'system', '✅ Candidatura inviata. In attesa di risposta...');
        } else if (newStatus === 'rejected') {
            await this.addMessage(missionId, userId, 'system', '❌ Missione rifiutata/chiusa.');
        }
    }

    // Generatore "Scheda Tattica Colloquio" (Prompt 8)
    private async generateInterviewPrep(mission: any, userId: string, manifesto: any): Promise<void> {
        const prepPrompt = this.loadPrompt('prompt_8_interview_prep.md');
        
        const prompt = prepPrompt
            .replace(/{{MISSION_TITLE}}|\[MISSION_TITLE\]/g, mission.title)
            .replace(/{{MISSION_COMPANY}}|\[MISSION_COMPANY\]/g, mission.company_name || 'Azienda Target')
            .replace(/{{MISSION_DESCRIPTION}}|\[MISSION_DESCRIPTION\]/g, mission.description || 'N/A')
            .replace(/{{USER_ADVANTAGES}}|\[USER_ADVANTAGES\]/g, JSON.stringify(manifesto?.unfairAdvantages || []));

        try {
            const completion = await this.openai.chat.completions.create({
                model: AI_CONFIG.openai.model,
                messages: [{ role: 'system', content: prompt }]
            });

            const prepSheet = completion.choices[0].message.content || "Scheda non generabile.";
            
            // Salva la scheda nel thread come messaggio di sistema
            await this.addMessage(mission.id, userId, 'system', `📋 SCHEDA PREPARAZIONE COLLOQUIO:\n\n${prepSheet}`);
            console.log(`🔔 SCHEDA TATTICA GENERATA per ${mission.title}.`);

        } catch (e) {
            console.error('❌ Errore generazione prep sheet:', e);
        }
    }
}
import OpenAI from 'openai';
import { db } from '../infra/db';
import fs from 'fs';
import path from 'path';

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
            apiKey: process.env.OPENAI_API_KEY || "dummy-key" 
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

    // 1. GESTIONE MESSAGGI
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

    // 2. GENERAZIONE RISPOSTA STRATEGICA
    public async generateReply(missionId: string, userId: string, userManifesto: any): Promise<string> {
        const history = await this.getThreadHistory(missionId);
        const mission = await db.selectFrom('missions').selectAll().where('id', '=', missionId).executeTakeFirst();
        
        if (!mission) throw new Error("Missione non trovata");

        const strategistPrompt = this.loadPrompt('prompt_7_reply_strategist.md');
        
        const messages: any[] = history.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
        }));

        const lastMsg = history.length > 0 ? history[history.length - 1].content : "Nessun messaggio precedente";

        messages.unshift({ 
            role: 'system', 
            content: strategistPrompt
                .replace('{{MISSION_TITLE}}', mission.title)
                .replace('{{MISSION_COMPANY}}', mission.company_name || 'Sconosciuta')
                .replace('{{USER_ADVANTAGES}}', JSON.stringify(userManifesto?.unfairAdvantages || []))
                .replace('{{USER_SKILLS}}', JSON.stringify(userManifesto?.keySkillsToAcquire || []))
                .replace('{{CLIENT_LAST_MESSAGE}}', lastMsg)
        });

        try {
            const completion = await this.openai.chat.completions.create({
                model: 'gpt-4o', 
                messages: messages,
                temperature: 0.2 
            });

            const reply = completion.choices[0].message.content || "Non sono riuscito a generare una risposta efficace.";
            await this.addMessage(missionId, userId, 'assistant', reply);
            return reply;

        } catch (e) {
            console.error('❌ Errore in generateReply:', e);
            return "Errore critico durante la generazione della risposta.";
        }
    }

    // 3. GESTIONE STATI
    public async updateStatus(missionId: string, userId: string, newStatus: string): Promise<void> {
        const mission = await db.selectFrom('missions').selectAll().where('id', '=', missionId).executeTakeFirst();
        const profile = await db.selectFrom('user_ai_profile').select('career_manifesto').where('user_id', '=', userId).executeTakeFirst();
        
        if (!mission) return;
        
        await db.updateTable('missions')
            .set({ 
                status: newStatus as any, // FIX: Aggiunto cast per risolvere errore TS2322
                updated_at: new Date().toISOString() as any
            })
            .where('id', '=', missionId)
            .execute();

        if (newStatus === 'interviewing') {
            await this.generateInterviewPrep(mission, userId, profile?.career_manifesto);
        } else if (newStatus === 'applied') {
            await this.addMessage(missionId, userId, 'system', '✅ Candidatura inviata. In attesa di risposta...');
        } else if (newStatus === 'rejected') {
            await this.addMessage(missionId, userId, 'system', '❌ Missione rifiutata/chiusa.');
        }
    }

    private async generateInterviewPrep(mission: any, userId: string, manifesto: any): Promise<void> {
        const prepPrompt = this.loadPrompt('prompt_8_interview_prep.md');
        const prompt = prepPrompt
            .replace('{{MISSION_TITLE}}', mission.title)
            .replace('{{MISSION_COMPANY}}', mission.company_name || 'Azienda Target')
            .replace('{{MISSION_DESCRIPTION}}', mission.description || 'N/A')
            .replace('{{USER_ADVANTAGES}}', JSON.stringify(manifesto?.unfairAdvantages || []));

        try {
            const completion = await this.openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [{ role: 'system', content: prompt }]
            });
            const prepSheet = completion.choices[0].message.content || "Scheda non generabile.";
            await this.addMessage(mission.id, userId, 'system', `📋 SCHEDA PREPARAZIONE COLLOQUIO:\n\n${prepSheet}`);
        } catch (e) {}
    }
}
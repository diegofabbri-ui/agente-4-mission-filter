import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// --- DEFINIZIONE TIPI DATABASE ---

interface UserAIProfileTable {
  user_id: string;
  career_goal_json: any; // <--- AGGIUNTO: Era questo che mancava!
  career_manifesto: any;
  weights: any;          // Per il contatore delle ricerche
  created_at: Date;
  updated_at: Date;
}

interface MissionsTable {
  id: string;
  user_id: string | null;
  title: string;
  description: string | null;
  status: 'pending' | 'active' | 'developed' | 'completed' | 'rejected';
  source_url: string | null;
  reward_amount: number | null;
  estimated_duration_hours: number | null;
  created_at: Date;
  // Campi nuovi per Gig Economy
  platform: string | null;
  company_name: string | null;
  match_score: number | null;
  analysis_notes: string | null;
  raw_data: any;
  raw_category: string | null;
  source: string | null;
  // Campi per lo sviluppo
  final_deliverable_json: any;
  final_work_content: string | null;
  client_requirements: string | null;
  remote_type: string | null;
  skills_required: any;
  experience_level: string | null;
}

export interface Database {
  user_ai_profile: UserAIProfileTable;
  missions: MissionsTable;
}

// --- CONFIGURAZIONE CONNESSIONE ---

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // Necessario per Supabase da Railway
    }),
  }),
});
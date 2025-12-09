import { Kysely, PostgresDialect, Generated } from 'kysely';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// --- DEFINIZIONE TIPI DATABASE ---

// Tabella Utenti (Auth)
interface UsersTable {
  id: Generated<string>;
  email: string;
  password_hash: string;
  created_at: Generated<Date>;
}

// Tabella Chat Manager (Memoria della chat)
interface MissionThreadsTable {
  id: Generated<string>;
  mission_id: string;
  user_id: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  created_at: Generated<Date>;
}

// Tabella Profilo AI
interface UserAIProfileTable {
  user_id: string;
  career_goal_json: any;
  career_manifesto: any;
  weights: any;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

// Tabella Missioni
interface MissionsTable {
  id: Generated<string>; // Usa Generated per dire "lo fa il DB"
  user_id: string | null;
  title: string;
  description: string | null;
  status: 'pending' | 'active' | 'developed' | 'completed' | 'rejected';
  source_url: string | null;
  reward_amount: number | null;
  estimated_duration_hours: number | null;
  created_at: Generated<Date>; // Automatico
  updated_at: Generated<Date>; // Automatico o gestito via codice
  
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

// Interfaccia Globale del DB
export interface Database {
  users: UsersTable;                  // <--- AGGIUNTO
  mission_threads: MissionThreadsTable; // <--- AGGIUNTO
  user_ai_profile: UserAIProfileTable;
  missions: MissionsTable;
}

// --- CONFIGURAZIONE CONNESSIONE ---

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    }),
  }),
});
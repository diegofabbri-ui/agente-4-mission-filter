import { Generated, ColumnType } from 'kysely';

export interface Database {
  users: UserTable;
  missions: MissionsTable;
  user_ai_profile: UserAiProfileTable;
  mission_threads: MissionThreadTable; // Opzionale, se la usi
  knowledge_vectors: KnowledgeVectorsTable; // Fondamentale per il RAG
}

interface UserTable {
  id: string;
  email: string;
  full_name: string | null;
  password_hash: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  status: 'active' | 'inactive';
}

// --- FIX QUI: Aggiunte tutte le colonne mancanti ---
interface MissionsTable {
  id: string;
  user_id: string | null;
  title: string;
  description: string | null;
  source_url: string;
  company_name: string | null;
  platform: string | null;
  reward_amount: number | null;
  estimated_duration_hours: number | null;
  
  // Status aggiornati
  status: 'pending' | 'developed' | 'active' | 'completed' | 'rejected' | 'archived';
  
  // Campi AI / Orchestrator
  analysis_notes: string | null;
  final_deliverable_json: any | null; // JSONB
  final_work_content: string | null;
  
  // Colonne per la memoria della chat (Quelle che davano errore)
  conversation_history: any | null; // JSONB
  last_user_request: string | null;
  last_agent_response: string | null;
  
  // Campi tecnici
  type: 'daily' | 'weekly' | 'monthly' | null;
  command_count: number | null;
  max_commands: number | null;
  match_score: number | null;
  raw_data: any | null; // JSONB

  // Date gestite da Kysely come stringhe o Date
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, never>;
}

interface UserAiProfileTable {
  id: string;
  user_id: string;
  full_name: string | null;
  min_hourly_rate: number | null;
  career_goal_json: any;
  career_manifesto?: any;
  weights: any;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

interface MissionThreadTable {
  id: Generated<string>;
  mission_id: string | null;
  user_id: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: Generated<Date>;
}

interface KnowledgeVectorsTable {
  id: Generated<string>;
  content: string | null;
  metadata: any | null;
  embedding: any | null; // vector(1536) su DB
}

export type DB = Database;
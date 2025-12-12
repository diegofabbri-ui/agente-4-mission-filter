import { Generated } from 'kysely';

export interface Database {
  users: UserTable;
  missions: MissionTable;
  user_ai_profile: UserAiProfileTable;
  mission_threads: MissionThreadTable;
  user_preferences: UserPreferencesTable;
  mission_filters: MissionFiltersTable; // Tabella necessaria per la ricerca
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

interface MissionTable {
  id: Generated<string>;
  user_id: string | null;
  title: string;
  description: string | null;
  source_url: string;
  company_name: string | null;
  platform: string | null;
  reward_amount: number | null;
  estimated_duration_hours: number | null;
  status: 'pending' | 'developed' | 'active' | 'completed' | 'rejected' | 'archived';
  raw_category: string | null;
  remote_type: string | null;
  skills_required: string[] | null; // Gestito come JSON o Array
  experience_level: string | null;
  match_score: number | null;
  analysis_notes: string | null;
  final_deliverable_json: any | null; // Campo JSON per il piano strategico
  final_work_content: string | null;
  client_requirements: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  source: string | null;
  raw_data: any | null; // Campo JSON per dati grezzi
  type?: 'daily' | 'weekly' | 'monthly'; // Campo opzionale per il tipo di missione
  conversation_history?: any; // JSON per la storia della chat
  command_count?: number;
  max_commands?: number;
}

interface UserAiProfileTable {
  user_id: string;
  career_manifesto: any; // JSON
  weights: any; // JSON
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

interface MissionThreadTable {
  id: Generated<string>;
  mission_id: string | null;
  user_id: string | null;
  role: 'user' | 'assistant' | 'system'; // Ruoli standard chat
  content: string;
  created_at: Generated<Date>;
  // updated_at rimosso se non presente nello schema DB, altrimenti aggiungilo:
  updated_at?: Generated<Date>; 
}

interface UserPreferencesTable {
  user_id: string;
  min_hourly_rate: number | null;
}

// INTERFACCIA FILTRI COMPLETA (Allineata con l'ultimo SQL Fix)
interface MissionFiltersTable {
  id: Generated<string>;
  user_id: string;
  name: string | null;
  keywords: string[] | null; // Array di testo (Postgres text[])
  is_active: boolean;
  match_count: number;
  total_score: number;
  factors_breakdown: any;    // JSON (Postgres jsonb)
  last_match_at: Date | null;
  created_at: Generated<Date>;
}

// Alias per l'export utilizzato nel resto dell'applicazione
export type DB = Database;
import { Generated, ColumnType } from 'kysely';

export interface Database {
  users: UserTable;
  missions: MissionTable;
  user_ai_profile: UserAiProfileTable;
  mission_threads: MissionThreadTable;
  user_preferences: UserPreferencesTable;
  mission_filters: MissionFiltersTable;
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
  id: string;
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
  skills_required: string[] | null;
  experience_level: string | null;
  match_score: number | null;
  analysis_notes: string | null;
  final_deliverable_json: any | null;
  final_work_content: string | null;
  client_requirements: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, never>;
  source: string | null;
  raw_data: any | null;
  type?: 'daily' | 'weekly' | 'monthly';
  conversation_history?: any;
  command_count?: number;
  max_commands?: number;
}

// --- FIX: AGGIUNTE LE COLONNE MANCANTI ---
export interface UserAiProfileTable {
  id: string; // <--- MANCAVA
  user_id: string;
  
  // Campi per il Profilo Dinamico (necessari per user.routes.ts)
  full_name: string | null;
  min_hourly_rate: number | null;
  career_goal_json: any; // Nuovo sistema
  
  // Legacy
  career_manifesto: any; 
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
  updated_at?: Generated<Date>; 
}

interface UserPreferencesTable {
  user_id: string;
  min_hourly_rate: number | null;
}

interface MissionFiltersTable {
  id: Generated<string>;
  user_id: string;
  name: string | null;
  keywords: string[] | null;
  is_active: boolean;
  match_count: number;
  total_score: number;
  factors_breakdown: any;
  last_match_at: Date | null;
  created_at: Generated<Date>;
}

export type DB = Database;
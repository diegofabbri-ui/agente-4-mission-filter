import { Generated, ColumnType } from 'kysely';

export interface Database {
  missions: MissionsTable;
  user_ai_profile: UserAIProfileTable;
}

export interface MissionsTable {
  id: string;
  user_id: string;
  title: string;
  description: string;
  company_name: string;
  source_url: string;
  reward_amount: number;
  estimated_duration_hours: number;
  status: 'pending' | 'active' | 'developed' | 'completed' | 'rejected';
  created_at: ColumnType<Date, string | undefined, never>;
  match_score?: number;
  analysis_notes?: string;
  final_deliverable_json?: any; // JSON column
  final_work_content?: string;
  client_requirements?: string;
  platform?: string;
  type?: 'daily' | 'weekly' | 'monthly';
  raw_data?: any;
  conversation_history?: any; // JSON column
  command_count?: number;
  max_commands?: number;
}

export interface UserAIProfileTable {
  // Colonne fondamentali per il profilo Multi-Utente
  id: string;
  user_id: string;
  
  // Dati Anagrafici e Tariffari
  full_name: string;
  min_hourly_rate: number;
  
  // Il "Cervello" dell'Agente (Manifesto)
  career_goal_json: any; // JSON column che contiene dreamRole, antiVision, ecc.
  
  // Campi opzionali / tecnici
  weights?: any; // JSON column
  career_manifesto?: any; // JSON column (alias legacy o futuro)
  
  // Timestamps
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string | undefined>;
}
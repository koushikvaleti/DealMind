import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Deal = {
  id: string;
  user_id: string;
  company_name: string;
  deal_value: number;
  industry: string;
  stage: string;
  decision_maker: string;
  health_score: number;
  risk_level: string;
  risk_summary: string;
  next_action: string;
  last_interaction: string | null;
  created_at: string;
  updated_at: string;
};

export type Customer = { id: string; deal_id: string; name: string; role: string; email: string; company: string; notes: string; created_at: string };
export type Conversation = { id: string; deal_id: string; user_id: string; role: 'user' | 'assistant' | 'system'; message: string; created_at: string };
export type Memory = { id: string; deal_id: string; user_id: string; hindsight_memory_id: string | null; memory_type: string; content: string; source: string; importance: number; created_at: string; updated_at: string };
export type Insight = { id: string; deal_id: string; user_id: string; type: string; title: string; description: string; severity: string; source: string; created_at: string };

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type GameSession = {
  id: string;
  status: 'lobby' | 'stage1' | 'stage2' | 'stage3' | 'completed';
  current_stage: number;
  enabled_stages: number[];
  is_ready: boolean;
  starts_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Player = {
  id: string;
  game_session_id: string;
  name: string;
  photo_url: string | null;
  is_spectator: boolean;
  is_eliminated: boolean;
  is_kicked: boolean;
  eliminated_at_stage: number | null;
  joined_at: string;
};

export type StageScore = {
  id: string;
  player_id: string;
  game_session_id: string;
  stage: number;
  score: number;
  rank: number | null;
  created_at: string;
};

export type ImageQuestion = {
  id: string;
  image_url: string;
  correct_answer: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
};

export type PlayerProgress = {
  id: string;
  player_id: string;
  game_session_id: string;
  stage: number;
  progress: number;
  elapsed_time: number;
  status: 'waiting' | 'playing' | 'finished';
  updated_at: string;
  round_results?: string;
};

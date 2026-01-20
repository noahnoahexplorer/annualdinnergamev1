import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============================================
// CYBER GENESIS - DATABASE TYPES
// ============================================

// Table names with cg_ prefix
export const TABLES = {
  events: 'cg_events',
  gameSessions: 'cg_game_sessions',
  players: 'cg_players',
  stageScores: 'cg_stage_scores',
  playerProgress: 'cg_player_progress',
} as const;

// Master Event type for multi-session support
export type GameEvent = {
  id: string;
  name: string;
  current_round: number;
  status: 'created' | 'round1' | 'round1_complete' | 'round2' | 'round2_complete' | 'round3' | 'completed';
  created_at: string;
};

export type GameSession = {
  id: string;
  event_id: string | null;
  round_number: number;
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
  event_id: string | null;
  name: string;
  photo_url: string | null;
  avatar_color: string;
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
  time_taken: number | null;
  rank: number | null;
  created_at: string;
};

export type PlayerProgress = {
  id: string;
  player_id: string;
  game_session_id: string;
  stage: number;
  progress: number;
  current_score: number;
  elapsed_time: number;
  status: 'waiting' | 'playing' | 'finished';
  extra_data: Record<string, unknown> | null;
  updated_at: string;
};

// Legacy type aliases for backwards compatibility
export type ImageQuestion = {
  id: string;
  image_url: string;
  correct_answer: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
};

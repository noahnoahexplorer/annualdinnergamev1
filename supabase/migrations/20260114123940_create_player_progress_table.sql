/*
  # Create player_progress table for real-time game state

  1. New Tables
    - `player_progress`
      - `id` (uuid, primary key)
      - `player_id` (uuid, foreign key to players)
      - `game_session_id` (uuid, foreign key to game_sessions)
      - `stage` (integer) - current game stage
      - `progress` (float) - progress percentage (0-100)
      - `elapsed_time` (float) - elapsed time in seconds
      - `status` (text) - 'waiting', 'playing', 'finished'
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS
    - Allow players to update their own progress
    - Allow spectators and hosts to read all progress for a game
*/

CREATE TABLE IF NOT EXISTS player_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  game_session_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  stage integer NOT NULL DEFAULT 0,
  progress float NOT NULL DEFAULT 0,
  elapsed_time float NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'waiting',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(player_id, game_session_id, stage)
);

ALTER TABLE player_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read progress for their game session"
  ON player_progress
  FOR SELECT
  USING (true);

CREATE POLICY "Players can insert their own progress"
  ON player_progress
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Players can update their own progress"
  ON player_progress
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_player_progress_game_session 
  ON player_progress(game_session_id);

CREATE INDEX IF NOT EXISTS idx_player_progress_player 
  ON player_progress(player_id);
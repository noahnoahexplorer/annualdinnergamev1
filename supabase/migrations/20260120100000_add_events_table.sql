/*
  # Multi-Session Event System

  1. New Tables
    - `cg_events` (Master Event)
      - `id` (uuid, primary key)
      - `name` (text) - Event name
      - `current_round` (integer) - Current round number (1, 2, or 3)
      - `status` (text) - Event status
      - `created_at` (timestamptz)

  2. Modified Tables
    - `cg_game_sessions` - Add event_id and round_number
    - `cg_players` - Add event_id for player continuity across sessions

  3. Purpose
    Allow splitting the game into 3 separate sessions (one per round)
    while maintaining player identity across all rounds.
*/

-- Create the master events table
CREATE TABLE IF NOT EXISTS cg_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'CYBER GENESIS',
  current_round integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'created',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on events table
ALTER TABLE cg_events ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read events
CREATE POLICY "Anyone can read events"
  ON cg_events
  FOR SELECT
  USING (true);

-- Allow anyone to insert events (admin creates)
CREATE POLICY "Anyone can create events"
  ON cg_events
  FOR INSERT
  WITH CHECK (true);

-- Allow anyone to update events
CREATE POLICY "Anyone can update events"
  ON cg_events
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Add event_id and round_number to game_sessions
ALTER TABLE cg_game_sessions 
ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES cg_events(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS round_number integer DEFAULT 1;

-- Add event_id to players for cross-session identity
ALTER TABLE cg_players 
ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES cg_events(id) ON DELETE CASCADE;

-- Create index for efficient event lookups
CREATE INDEX IF NOT EXISTS idx_cg_game_sessions_event_id 
  ON cg_game_sessions(event_id);

CREATE INDEX IF NOT EXISTS idx_cg_players_event_id 
  ON cg_players(event_id);

-- Create index for player name lookup within an event
CREATE INDEX IF NOT EXISTS idx_cg_players_event_name 
  ON cg_players(event_id, name);

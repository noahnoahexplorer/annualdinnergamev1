/*
  # Game Site Database Schema

  Run this SQL in your Supabase SQL editor to create the required tables.

  1. Tables:
    - game_sessions: Tracks game state and current stage
    - players: Stores player info including photos and elimination status
    - stage_scores: Records player scores for each stage
    - image_questions: Stores questions for the image guessing game

  2. Security:
    - RLS enabled on all tables with public access for game functionality
*/

-- Game Sessions Table
CREATE TABLE IF NOT EXISTS game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'lobby',
  current_stage integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_sessions' AND policyname = 'gs_sel') THEN
    CREATE POLICY "gs_sel" ON game_sessions FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_sessions' AND policyname = 'gs_ins') THEN
    CREATE POLICY "gs_ins" ON game_sessions FOR INSERT WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_sessions' AND policyname = 'gs_upd') THEN
    CREATE POLICY "gs_upd" ON game_sessions FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Players Table
CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  name text NOT NULL,
  photo_url text,
  is_spectator boolean NOT NULL DEFAULT false,
  is_eliminated boolean NOT NULL DEFAULT false,
  eliminated_at_stage integer,
  joined_at timestamptz DEFAULT now()
);

ALTER TABLE players ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'players' AND policyname = 'pl_sel') THEN
    CREATE POLICY "pl_sel" ON players FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'players' AND policyname = 'pl_ins') THEN
    CREATE POLICY "pl_ins" ON players FOR INSERT WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'players' AND policyname = 'pl_upd') THEN
    CREATE POLICY "pl_upd" ON players FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Stage Scores Table
CREATE TABLE IF NOT EXISTS stage_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  game_session_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  stage integer NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  rank integer,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stage_scores ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stage_scores' AND policyname = 'ss_sel') THEN
    CREATE POLICY "ss_sel" ON stage_scores FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stage_scores' AND policyname = 'ss_ins') THEN
    CREATE POLICY "ss_ins" ON stage_scores FOR INSERT WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stage_scores' AND policyname = 'ss_upd') THEN
    CREATE POLICY "ss_upd" ON stage_scores FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Image Questions Table (for the guessing game)
CREATE TABLE IF NOT EXISTS image_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL,
  correct_answer text NOT NULL,
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text NOT NULL,
  option_d text NOT NULL
);

ALTER TABLE image_questions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'image_questions' AND policyname = 'iq_sel') THEN
    CREATE POLICY "iq_sel" ON image_questions FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'image_questions' AND policyname = 'iq_ins') THEN
    CREATE POLICY "iq_ins" ON image_questions FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- Enable realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE game_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE stage_scores;

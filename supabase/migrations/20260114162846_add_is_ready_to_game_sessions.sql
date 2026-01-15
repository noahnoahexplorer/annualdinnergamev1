/*
  # Add is_ready field to game_sessions

  1. Changes
    - Adds `is_ready` boolean field to `game_sessions` table
    - Defaults to false
    - Used to indicate when host has clicked "Ready" and players should prepare

  2. Purpose
    - Allow host to signal readiness before starting countdown
    - Players can see "Get Ready!" status when host clicks ready
    - Improves game flow and player preparation time
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_sessions' AND column_name = 'is_ready'
  ) THEN
    ALTER TABLE game_sessions ADD COLUMN is_ready boolean DEFAULT false;
  END IF;
END $$;

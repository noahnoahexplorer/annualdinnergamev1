/*
  # Add enabled stages to game sessions

  1. Changes
    - Add `enabled_stages` column to game_sessions table
    - Stores array of integers representing which stages are enabled (e.g., [1, 2, 3])
    - Defaults to all stages enabled [1, 2, 3]
  
  2. Notes
    - This allows game hosts to select which stages to include when creating a game
    - Empty array means no stages (invalid game)
    - Array can contain any combination of 1, 2, or 3
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'game_sessions' AND column_name = 'enabled_stages'
  ) THEN
    ALTER TABLE game_sessions 
    ADD COLUMN enabled_stages integer[] DEFAULT ARRAY[1, 2, 3];
  END IF;
END $$;

-- Update existing records to have all stages enabled
UPDATE game_sessions 
SET enabled_stages = ARRAY[1, 2, 3] 
WHERE enabled_stages IS NULL;
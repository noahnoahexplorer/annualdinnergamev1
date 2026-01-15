/*
  # Add Unique Constraint to Stage Scores

  1. Changes
    - Add unique constraint on (player_id, game_session_id, stage) to prevent duplicate score entries
    - This ensures each player can only have one score per stage per game
  
  2. Notes
    - Removes any existing duplicate entries before adding the constraint
    - Keeps the earliest score entry for each player/game/stage combination
*/

-- Remove duplicate entries, keeping only the earliest one for each player/game/stage
DELETE FROM stage_scores
WHERE id NOT IN (
  SELECT DISTINCT ON (player_id, game_session_id, stage) id
  FROM stage_scores
  ORDER BY player_id, game_session_id, stage, created_at ASC
);

-- Add unique constraint to prevent future duplicates
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'stage_scores_player_game_stage_unique'
  ) THEN
    ALTER TABLE stage_scores 
    ADD CONSTRAINT stage_scores_player_game_stage_unique 
    UNIQUE (player_id, game_session_id, stage);
  END IF;
END $$;
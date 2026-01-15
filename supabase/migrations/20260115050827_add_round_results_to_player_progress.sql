/*
  # Add Round Results Field to Player Progress

  1. Changes
    - Add `round_results` text field to store per-round outcomes for Rock Paper Scissors
    - This field stores results as a string like "WDLWW" (Win, Draw, Lose, Win, Win)

  2. Purpose
    - Enables spectator view to display color-coded round indicators
    - Green for wins, grey for draws, red for losses
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'player_progress' AND column_name = 'round_results'
  ) THEN
    ALTER TABLE player_progress ADD COLUMN round_results text DEFAULT '';
  END IF;
END $$;
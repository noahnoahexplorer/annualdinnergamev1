/*
  # Add starts_at column to game_sessions

  1. Changes
    - Add `starts_at` column to `game_sessions` table to track when a game should start
    - This enables countdown functionality where spectators can start the game
      and players see a countdown before competing

  2. Usage
    - When spectator clicks "Start Game", starts_at is set to current time + 5 seconds
    - Players check if starts_at is in the future to show countdown
    - Game becomes active when current time passes starts_at
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_sessions' AND column_name = 'starts_at'
  ) THEN
    ALTER TABLE game_sessions ADD COLUMN starts_at timestamptz;
  END IF;
END $$;
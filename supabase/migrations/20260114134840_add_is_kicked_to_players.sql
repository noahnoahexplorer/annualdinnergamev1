/*
  # Add kick functionality to players

  1. Changes
    - Add `is_kicked` column to players table to track kicked players
    - Defaults to false
  
  2. Purpose
    - Allow spectators to kick players from the lobby
    - Players will be notified when they are kicked
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'is_kicked'
  ) THEN
    ALTER TABLE players ADD COLUMN is_kicked boolean NOT NULL DEFAULT false;
  END IF;
END $$;
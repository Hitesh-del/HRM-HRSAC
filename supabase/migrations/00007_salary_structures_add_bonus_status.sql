
-- Add bonus and status columns to salary_structures
ALTER TABLE salary_structures
  ADD COLUMN IF NOT EXISTS bonus numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Enable realtime (safety)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE salary_structures;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

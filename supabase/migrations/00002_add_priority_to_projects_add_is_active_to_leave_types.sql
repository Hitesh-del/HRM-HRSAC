-- Add priority column to projects table
ALTER TABLE projects ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical'));

-- Add is_active column to leave_types if missing
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Add description column to leave_types if missing
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS description TEXT;

-- Seed default leave types if none exist
INSERT INTO leave_types (name, description, max_days_per_year, carry_forward, is_active)
SELECT name, description, max_days_per_year, false, true FROM (VALUES
  ('Casual Leave', 'For personal and miscellaneous needs', 12),
  ('Sick Leave', 'For medical illness and health recovery', 10),
  ('Earned Leave', 'Accrued through work tenure', 15),
  ('Annual Leave', 'Yearly planned holiday', 20),
  ('Maternity Leave', 'For female employees during childbirth', 90),
  ('Paternity Leave', 'For male employees during childbirth', 5),
  ('Unpaid Leave', 'Leave without pay when other leaves exhausted', 0)
) AS v(name, description, max_days_per_year)
WHERE NOT EXISTS (SELECT 1 FROM leave_types LIMIT 1);
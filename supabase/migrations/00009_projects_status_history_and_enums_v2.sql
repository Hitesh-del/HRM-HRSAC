
-- 1. Add pending and in_progress to project_status enum
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'in_progress';

-- 2. Add new columns to projects table
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_history JSONB DEFAULT '[]'::jsonb;

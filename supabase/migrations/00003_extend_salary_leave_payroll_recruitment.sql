
-- 1. Extend leave_status enum with hierarchical workflow values
ALTER TYPE leave_status ADD VALUE IF NOT EXISTS 'manager_approved';
ALTER TYPE leave_status ADD VALUE IF NOT EXISTS 'director_review';
ALTER TYPE leave_status ADD VALUE IF NOT EXISTS 'under_manager_review';

-- 2. Extend payroll_status enum with 'paid' if missing
-- Already has: draft, processed, paid

-- 3. Add manager_comment column and manager_id to leave_requests
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_comment text,
  ADD COLUMN IF NOT EXISTS manager_reviewed_at timestamptz;

-- 4. Add leave_approval_policy to company_settings
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS leave_approval_policy text NOT NULL DEFAULT 'director_required'
  CHECK (leave_approval_policy IN ('manager_only', 'director_required'));

-- 5. Extend salary_structures with additional HRM columns
ALTER TABLE salary_structures
  ADD COLUMN IF NOT EXISTS medical_allowance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS special_allowance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pf_deduction numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS esi_deduction numeric NOT NULL DEFAULT 0;

-- 6. Extend payroll table with additional breakdown columns
ALTER TABLE payroll
  ADD COLUMN IF NOT EXISTS medical_allowance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS special_allowance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pf_deduction numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS esi_deduction numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_pay numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unpaid_leave_deduction numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_deduction numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_hours numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_days integer NOT NULL DEFAULT 0;

-- 7. Create job_applications table for internal employee applications
CREATE TABLE IF NOT EXISTS job_applications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id uuid NOT NULL REFERENCES job_openings(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cover_letter text,
  resume_url text,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','under_review','interview_scheduled','offer_extended','hired','rejected')),
  interview_date timestamptz,
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id, applicant_id)
);

-- 8. Add experience_required and skills fields to job_openings if missing
ALTER TABLE job_openings
  ADD COLUMN IF NOT EXISTS experience_required text,
  ADD COLUMN IF NOT EXISTS skills_required text;

-- 9. Enable RLS on job_applications
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;

-- 10. Policies for job_applications
CREATE POLICY "Employees can insert own applications"
  ON job_applications FOR INSERT TO authenticated
  WITH CHECK (applicant_id = auth.uid());

CREATE POLICY "Employees can view own applications"
  ON job_applications FOR SELECT TO authenticated
  USING (
    applicant_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('director','management')
    )
  );

CREATE POLICY "Director can update any application"
  ON job_applications FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director')
  );

CREATE POLICY "Management can update dept applications"
  ON job_applications FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles mgr
      JOIN job_openings jo ON jo.id = job_applications.job_id
      WHERE mgr.id = auth.uid() AND mgr.role = 'management'
        AND mgr.department_id = jo.department_id
    )
  );

-- 11. Enable realtime on job_applications
ALTER PUBLICATION supabase_realtime ADD TABLE job_applications;

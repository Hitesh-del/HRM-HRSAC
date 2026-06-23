
-- 1. Add shift_type column to shifts table
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS shift_type text NOT NULL DEFAULT 'general';
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2. Add kpi/task scores to performance_reviews
ALTER TABLE performance_reviews ADD COLUMN IF NOT EXISTS kpi_score numeric DEFAULT 0;
ALTER TABLE performance_reviews ADD COLUMN IF NOT EXISTS task_completion_score numeric DEFAULT 0;
ALTER TABLE performance_reviews ADD COLUMN IF NOT EXISTS attendance_score numeric DEFAULT 0;
ALTER TABLE performance_reviews ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'draft';

-- 3. Enable realtime on salary_structures, shifts, shift_assignments, performance_reviews
ALTER PUBLICATION supabase_realtime ADD TABLE salary_structures;
ALTER PUBLICATION supabase_realtime ADD TABLE shifts;
ALTER PUBLICATION supabase_realtime ADD TABLE shift_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE performance_reviews;

-- 4. Add management RLS policy for salary_structures (read dept employee salaries)
CREATE POLICY "Management view dept salary_structures" ON salary_structures
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles mgr
      JOIN profiles emp ON emp.id = salary_structures.employee_id
      WHERE mgr.id = auth.uid()
        AND mgr.role = 'management'
        AND emp.department_id = mgr.department_id
    )
  );

-- 5. Add management RLS for payroll (view dept payroll)
CREATE POLICY "Management view dept payroll" ON payroll
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles mgr
      JOIN profiles emp ON emp.id = payroll.employee_id
      WHERE mgr.id = auth.uid()
        AND mgr.role = 'management'
        AND emp.department_id = mgr.department_id
    )
  );

-- 6. Allow directors to view/manage all shifts
-- (already exists via "Director manages shifts" ALL policy)

-- 7. Enable realtime on attendance (already on, but ensure)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE attendance;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 8. Enable realtime on leave_requests
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE leave_requests;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

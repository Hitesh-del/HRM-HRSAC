
-- 1. Add 'generated' and 'pending' to payroll_status enum
ALTER TYPE payroll_status ADD VALUE IF NOT EXISTS 'generated';
ALTER TYPE payroll_status ADD VALUE IF NOT EXISTS 'pending';

-- 2. Ensure RLS allows director to INSERT payroll records
-- (existing policy covers ALL, but we verify the INSERT path explicitly via a separate policy)
-- Drop the overly broad "Director full access payroll" and replace with SECURITY DEFINER helper
DROP POLICY IF EXISTS "Director full access payroll" ON payroll;

CREATE POLICY "Director full access payroll" ON payroll
  FOR ALL TO authenticated
  USING (is_director(auth.uid()))
  WITH CHECK (is_director(auth.uid()));

-- 3. Also allow the director to upsert (duplicate guard via ON CONFLICT later in app)
-- Ensure payroll has a unique constraint on (employee_id, month, year) for upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payroll_employee_month_year_unique' AND conrelid = 'payroll'::regclass
  ) THEN
    ALTER TABLE payroll ADD CONSTRAINT payroll_employee_month_year_unique
      UNIQUE (employee_id, month, year);
  END IF;
END $$;

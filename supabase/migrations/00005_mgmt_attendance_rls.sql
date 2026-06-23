
-- Allow management to insert/update their own attendance (like employees)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Management own attendance" ON attendance;
END $$;

CREATE POLICY "Management own attendance" ON attendance
  FOR ALL TO authenticated
  USING (
    employee_id = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'management')
  )
  WITH CHECK (
    employee_id = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'management')
  );

-- Allow management to view their department's attendance (already exists via dept member fetch)
-- Make sure employees can also insert their own records (SELECT already exists, add INSERT/UPDATE)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Employees manage own attendance" ON attendance;
END $$;

CREATE POLICY "Employees manage own attendance" ON attendance
  FOR ALL TO authenticated
  USING (
    employee_id = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('employee', 'management'))
  )
  WITH CHECK (
    employee_id = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('employee', 'management'))
  );

-- Drop the old policy that excluded intern role
DROP POLICY "Employees manage own attendance" ON attendance;

-- Recreate with intern included
CREATE POLICY "Employees manage own attendance" ON attendance
FOR ALL TO authenticated
USING (
  employee_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['employee'::user_role, 'management'::user_role, 'intern'::user_role])
  )
)
WITH CHECK (
  employee_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['employee'::user_role, 'management'::user_role, 'intern'::user_role])
  )
);
-- Allow interns to see their own project_members rows
DROP POLICY "Employees view own project_members" ON project_members;
CREATE POLICY "Employees view own project_members" ON project_members
FOR SELECT TO authenticated
USING (employee_id = auth.uid());

-- Allow interns to see projects they are assigned to
DROP POLICY "Employees view assigned projects" ON projects;
CREATE POLICY "Employees view assigned projects" ON projects
FOR SELECT TO authenticated
USING (
  id IN (
    SELECT project_id FROM project_members WHERE employee_id = auth.uid()
  )
);

-- Allow management to manage their own leave requests (submit + view)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Management manage own leave requests" ON leave_requests;
END $$;

CREATE POLICY "Management manage own leave requests" ON leave_requests
  FOR ALL TO authenticated
  USING (
    employee_id = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'management')
  )
  WITH CHECK (
    employee_id = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'management')
  );

-- Enable realtime on job_applications
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE job_applications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enable realtime on performance_reviews (already done but safety)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE performance_reviews;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

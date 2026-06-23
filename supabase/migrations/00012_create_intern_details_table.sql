
-- 1. Create intern_details table
CREATE TABLE intern_details (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  college_name         text,
  internship_role      text,
  mobile_number        text,
  start_date           date NOT NULL,
  end_date             date NOT NULL,
  duration_months      numeric(5,1),
  reporting_manager_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status               text NOT NULL DEFAULT 'created'
                         CHECK (status IN ('created','active','in_progress','completed','expired')),
  notes                text,
  created_by           uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE intern_details ENABLE ROW LEVEL SECURITY;

-- 3. Director: full access
CREATE POLICY "director_all_intern_details" ON intern_details
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director')
  );

-- 4. Management: only interns in their department
CREATE POLICY "management_dept_intern_details" ON intern_details
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles m
      WHERE m.id = auth.uid() AND m.role = 'management'
        AND EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = intern_details.profile_id
            AND p.department_id = m.department_id
        )
    )
  );

-- 5. Intern: own record only
CREATE POLICY "intern_own_detail" ON intern_details
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

-- 6. Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE intern_details;

-- 7. Updated_at trigger
CREATE OR REPLACE FUNCTION set_intern_details_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER intern_details_updated_at
  BEFORE UPDATE ON intern_details
  FOR EACH ROW EXECUTE FUNCTION set_intern_details_updated_at();

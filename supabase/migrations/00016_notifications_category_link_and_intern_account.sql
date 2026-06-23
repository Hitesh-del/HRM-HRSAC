-- 1. Extend notification_type enum with missing categories
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'asset';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'internship';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'system';

-- 2. Add link_url and category to notifications for navigation + filtering
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link_url text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category text DEFAULT 'system';

-- 3. Update existing notifications to have a category derived from type
UPDATE notifications SET category = type::text WHERE category IS NULL OR category = 'system';

-- 4. Add is_account_disabled flag specifically for interns
--    (we reuse profiles.is_active — no new column needed,
--     but we add a disable_reason for the login error message)
ALTER TABLE intern_details ADD COLUMN IF NOT EXISTS account_disabled boolean NOT NULL DEFAULT false;

-- 5. RLS: allow management to update intern_details (for enable/disable)
CREATE POLICY "Management can update dept intern account status"
  ON intern_details FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles mgr
      JOIN profiles intern_profile ON intern_profile.id = intern_details.profile_id
      WHERE mgr.id = auth.uid()
        AND mgr.role = 'management'
        AND mgr.department_id = intern_profile.department_id
    )
  );

-- 6. RLS: allow director to update intern_details
CREATE POLICY "Director can update intern account status"
  ON intern_details FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director')
  );

-- 7. Allow any authenticated user to insert notifications (for client-side triggers)
-- Policy already exists: "System can insert notifications" covers anon inserts
-- Add policy so authenticated users can also insert
CREATE POLICY "Authenticated users can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);
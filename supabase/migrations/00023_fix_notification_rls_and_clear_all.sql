
-- Drop the overly-broad director ALL policy (directors were seeing every user's notifications)
DROP POLICY IF EXISTS "Director full access notifications" ON notifications;

-- Users can delete their own notifications (needed for "Clear All")
CREATE POLICY "Users delete own notifications" ON notifications
  FOR DELETE TO authenticated
  USING (recipient_id = auth.uid());

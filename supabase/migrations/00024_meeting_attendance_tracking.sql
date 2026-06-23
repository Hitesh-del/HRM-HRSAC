
-- Add attendance tracking columns to meeting_participants
ALTER TABLE meeting_participants
  ADD COLUMN left_at          timestamptz DEFAULT NULL,
  ADD COLUMN duration_minutes integer     DEFAULT NULL,
  ADD COLUMN attendance_status text        NOT NULL DEFAULT 'pending'
    CHECK (attendance_status IN ('pending', 'joined', 'attended', 'absent'));

-- Index for attendance queries
CREATE INDEX idx_meeting_participants_attendance
  ON meeting_participants(meeting_id, attendance_status);

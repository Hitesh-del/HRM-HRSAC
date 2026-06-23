-- 1. Ensure 'on_leave' exists in the attendance_status enum (already added, guard with do-nothing)
DO $$ BEGIN
  ALTER TYPE attendance_status ADD VALUE 'on_leave';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Function: when a leave_request is approved, upsert on_leave attendance rows
--    for every calendar day in [start_date, end_date].
--    If a day already has a check-in (employee came in), leave the record untouched.
CREATE OR REPLACE FUNCTION sync_leave_to_attendance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  d DATE;
BEGIN
  -- Only act when status transitions TO 'approved'
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    d := NEW.start_date::DATE;
    WHILE d <= NEW.end_date::DATE LOOP
      -- Upsert: insert if no record exists; if record exists but no check_in, override to on_leave
      INSERT INTO attendance (employee_id, date, status)
      VALUES (NEW.employee_id, d, 'on_leave')
      ON CONFLICT (employee_id, date)
      DO UPDATE SET status = 'on_leave'
        WHERE attendance.check_in_time IS NULL;
      d := d + INTERVAL '1 day';
    END LOOP;
  END IF;

  -- If leave is revoked (approved → rejected/cancelled/pending), revert on_leave rows back to absent
  IF OLD.status = 'approved' AND NEW.status <> 'approved' THEN
    d := NEW.start_date::DATE;
    WHILE d <= NEW.end_date::DATE LOOP
      UPDATE attendance
        SET status = 'absent'
      WHERE employee_id = NEW.employee_id
        AND date = d
        AND status = 'on_leave'
        AND check_in_time IS NULL;
      d := d + INTERVAL '1 day';
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Attach trigger to leave_requests
DROP TRIGGER IF EXISTS trg_leave_attendance_sync ON leave_requests;
CREATE TRIGGER trg_leave_attendance_sync
  AFTER UPDATE ON leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION sync_leave_to_attendance();

-- 4. Unique constraint on (employee_id, date) needed for ON CONFLICT — add if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_employee_id_date_key'
      AND conrelid = 'attendance'::regclass
  ) THEN
    ALTER TABLE attendance ADD CONSTRAINT attendance_employee_id_date_key UNIQUE (employee_id, date);
  END IF;
END $$;

-- 5. Back-fill: fix any existing approved leaves that were missed
DO $$
DECLARE
  lr RECORD;
  d  DATE;
BEGIN
  FOR lr IN
    SELECT employee_id, start_date::DATE AS sd, end_date::DATE AS ed
    FROM leave_requests
    WHERE status = 'approved'
  LOOP
    d := lr.sd;
    WHILE d <= lr.ed LOOP
      INSERT INTO attendance (employee_id, date, status)
      VALUES (lr.employee_id, d, 'on_leave')
      ON CONFLICT (employee_id, date)
      DO UPDATE SET status = 'on_leave'
        WHERE attendance.check_in_time IS NULL;
      d := d + INTERVAL '1 day';
    END LOOP;
  END LOOP;
END $$;
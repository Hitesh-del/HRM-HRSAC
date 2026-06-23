
-- 1. Work Schedule table (one row per company)
CREATE TABLE company_work_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_settings_id uuid NOT NULL REFERENCES company_settings(id) ON DELETE CASCADE,
  -- Working days as booleans
  monday    boolean NOT NULL DEFAULT true,
  tuesday   boolean NOT NULL DEFAULT true,
  wednesday boolean NOT NULL DEFAULT true,
  thursday  boolean NOT NULL DEFAULT true,
  friday    boolean NOT NULL DEFAULT true,
  saturday  boolean NOT NULL DEFAULT false,
  sunday    boolean NOT NULL DEFAULT false,
  -- Working hours stored as HH:MM strings
  start_time text NOT NULL DEFAULT '09:00',
  end_time   text NOT NULL DEFAULT '17:00',
  -- Late arrival thresholds (minutes after start_time)
  late_threshold_few  integer NOT NULL DEFAULT 10,  -- > 0 and <= this → few minutes late
  late_threshold_late integer NOT NULL DEFAULT 30,  -- > few and <= this → late; beyond → very late
  -- Early checkout: minutes before end_time
  early_threshold_few     integer NOT NULL DEFAULT 10,
  early_threshold_early   integer NOT NULL DEFAULT 30,
  -- Half day: checkout before halfway through workday
  half_day_threshold_pct  integer NOT NULL DEFAULT 50, -- % of workday completed
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Holidays table
CREATE TABLE holidays (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_settings_id uuid NOT NULL REFERENCES company_settings(id) ON DELETE CASCADE,
  name       text NOT NULL,
  date       date NOT NULL,
  reason     text,
  type       text NOT NULL DEFAULT 'public',  -- public | company | emergency | festival
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX holidays_company_date_uidx ON holidays(company_settings_id, date);

-- 3. Extend attendance: new statuses + derived columns
-- Add new status values by altering the column (it was text-based already compatible)
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS late_minutes       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS early_minutes      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_label         text,       -- "Few Minutes Late" | "Late" | "Very Late"
  ADD COLUMN IF NOT EXISTS early_label        text,       -- "Few Minutes Early" | "Early Checkout" | "Half Day"
  ADD COLUMN IF NOT EXISTS checkout_label     text;       -- overtime label

-- Update status type to support new values (we store as text)
-- Existing values: present | absent | late | half_day | on_leave
-- New values added: overtime | holiday | weekend_off
-- No change needed to column type since it is already text.

-- 4. RLS policies
ALTER TABLE company_work_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays               ENABLE ROW LEVEL SECURITY;

-- Work schedule: everyone can read; only director can write
CREATE POLICY "work_schedule_read_all" ON company_work_schedule
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "work_schedule_director_write" ON company_work_schedule
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director')
  );

-- Holidays: everyone can read; only director can write
CREATE POLICY "holidays_read_all" ON holidays
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "holidays_director_write" ON holidays
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director')
  );

-- 5. Enable realtime for holidays so all panels update live
ALTER PUBLICATION supabase_realtime ADD TABLE holidays;
ALTER PUBLICATION supabase_realtime ADD TABLE company_work_schedule;

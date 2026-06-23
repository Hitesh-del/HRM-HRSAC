
-- ─── meetings ────────────────────────────────────────────────────────────────
CREATE TABLE meetings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  description   text,
  room_id       text NOT NULL UNIQUE DEFAULT ('hrm-' || replace(gen_random_uuid()::text, '-', '')),
  organizer_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  meeting_type  text NOT NULL DEFAULT 'team'
                CHECK (meeting_type IN ('department','team','one_on_one','all_hands')),
  status        text NOT NULL DEFAULT 'scheduled'
                CHECK (status IN ('scheduled','in_progress','ended','cancelled')),
  start_time    timestamptz NOT NULL,
  end_time      timestamptz NOT NULL,
  agenda        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── meeting_participants ─────────────────────────────────────────────────────
CREATE TABLE meeting_participants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'participant'
              CHECK (role IN ('moderator','participant')),
  joined_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, profile_id)
);

-- ─── indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX meetings_organizer_idx        ON meetings(organizer_id);
CREATE INDEX meetings_start_time_idx       ON meetings(start_time);
CREATE INDEX meetings_status_idx           ON meetings(status);
CREATE INDEX meeting_participants_meeting  ON meeting_participants(meeting_id);
CREATE INDEX meeting_participants_profile  ON meeting_participants(profile_id);

-- ─── auto-update updated_at ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_meetings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION touch_meetings_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE meetings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_participants ENABLE ROW LEVEL SECURITY;

-- Helper: is the caller a director or management?
CREATE OR REPLACE FUNCTION is_director_or_management()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('director','management')
      AND is_active = true
  );
$$;

-- Helper: can caller see a given meeting?
CREATE OR REPLACE FUNCTION can_view_meeting(meeting_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    is_director_or_management()
    OR
    EXISTS (
      SELECT 1 FROM meeting_participants mp
      WHERE mp.meeting_id = $1
        AND mp.profile_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = $1 AND m.organizer_id = auth.uid()
    );
$$;

-- Helper: can caller modify (own organizer or director)?
CREATE OR REPLACE FUNCTION can_modify_meeting(meeting_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM meetings m
      JOIN profiles p ON p.id = auth.uid()
      WHERE m.id = $1
        AND (m.organizer_id = auth.uid() OR p.role = 'director')
        AND p.is_active = true
    );
$$;

-- MEETINGS policies
CREATE POLICY "meetings_select" ON meetings
  FOR SELECT TO authenticated USING (can_view_meeting(id));

CREATE POLICY "meetings_insert" ON meetings
  FOR INSERT TO authenticated
  WITH CHECK (is_director_or_management() AND organizer_id = auth.uid());

CREATE POLICY "meetings_update" ON meetings
  FOR UPDATE TO authenticated USING (can_modify_meeting(id));

CREATE POLICY "meetings_delete" ON meetings
  FOR DELETE TO authenticated USING (can_modify_meeting(id));

-- PARTICIPANTS policies
CREATE POLICY "participants_select" ON meeting_participants
  FOR SELECT TO authenticated USING (
    is_director_or_management()
    OR profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM meetings m WHERE m.id = meeting_id AND m.organizer_id = auth.uid()
    )
  );

CREATE POLICY "participants_insert" ON meeting_participants
  FOR INSERT TO authenticated WITH CHECK (
    is_director_or_management()
  );

CREATE POLICY "participants_update" ON meeting_participants
  FOR UPDATE TO authenticated USING (
    profile_id = auth.uid()
    OR is_director_or_management()
  );

CREATE POLICY "participants_delete" ON meeting_participants
  FOR DELETE TO authenticated USING (
    is_director_or_management()
    OR EXISTS (
      SELECT 1 FROM meetings m WHERE m.id = meeting_id AND m.organizer_id = auth.uid()
    )
  );

-- ─── Realtime ─────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE meetings;
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_participants;


-- trusted_devices: stores verified devices per user
CREATE TABLE trusted_devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id     text NOT NULL,
  device_name   text NOT NULL DEFAULT 'Unknown Device',
  browser       text NOT NULL DEFAULT 'Unknown Browser',
  ip_address    text,
  verified_at   timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now(),
  is_active     boolean NOT NULL DEFAULT true,
  UNIQUE (user_id, device_id)
);

-- device_otp_verifications: one-time OTP records
CREATE TABLE device_otp_verifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id   text NOT NULL,
  otp_hash    text NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  is_used     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- security_logs: audit trail of all device security events
CREATE TYPE security_event_type AS ENUM (
  'new_device_login',
  'otp_verification_success',
  'otp_verification_failed',
  'device_removed',
  'multiple_failed_attempts',
  'trusted_device_login'
);

CREATE TYPE security_verification_status AS ENUM (
  'direct',
  'otp_verified',
  'failed'
);

CREATE TABLE security_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name           text NOT NULL DEFAULT '',
  user_role           text NOT NULL DEFAULT '',
  device_id           text,
  device_name         text,
  browser             text,
  ip_address          text,
  event_type          security_event_type NOT NULL,
  verification_status security_verification_status NOT NULL DEFAULT 'failed',
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE trusted_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_otp_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_logs ENABLE ROW LEVEL SECURITY;

-- trusted_devices: users can read/delete their own; service role handles inserts
CREATE POLICY "users_select_own_trusted_devices" ON trusted_devices
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "users_delete_own_trusted_devices" ON trusted_devices
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- OTPs: service role only (via edge function); users cannot read raw hashes
-- security_logs: directors can read all; users can read their own
CREATE POLICY "directors_select_security_logs" ON security_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'director'
    )
  );

CREATE POLICY "users_select_own_security_logs" ON security_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Realtime for trusted_devices
ALTER PUBLICATION supabase_realtime ADD TABLE trusted_devices;
ALTER PUBLICATION supabase_realtime ADD TABLE security_logs;

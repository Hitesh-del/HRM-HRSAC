
-- 1. Add missing columns to support_tickets
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS attachment_url TEXT;

-- 2. Enable realtime on support_tickets
ALTER PUBLICATION supabase_realtime ADD TABLE support_tickets;

-- 3. Create resumes storage bucket (public read so managers can view/download)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('resumes', 'resumes', true, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['application/pdf'];

-- 4. RLS: allow authenticated users to insert their own resumes
CREATE POLICY "Authenticated users can upload resumes"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'resumes');

CREATE POLICY "Anyone can read resumes"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'resumes');

CREATE POLICY "Users can delete own resumes"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

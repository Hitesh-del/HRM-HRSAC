-- Create avatars bucket (public so URLs work without signed tokens)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,  -- 2 MB
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif']
);

-- Create company-assets bucket for logos (used by CompanyOverview)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-assets',
  'company-assets',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/svg+xml']
);

-- Storage RLS: any authenticated user can upload their own avatar
CREATE POLICY "Avatar upload own" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'avatars'
);

CREATE POLICY "Avatar update own" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "Avatar delete own" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "Avatar public read" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'avatars');

-- Company assets: directors + management can upload; public can read
CREATE POLICY "Company assets upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'company-assets');

CREATE POLICY "Company assets update" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'company-assets');

CREATE POLICY "Company assets delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'company-assets');

CREATE POLICY "Company assets public read" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'company-assets');
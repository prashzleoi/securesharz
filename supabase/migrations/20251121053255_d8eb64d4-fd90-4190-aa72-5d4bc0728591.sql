-- Drop insecure RLS policy
DROP POLICY IF EXISTS "Anyone can view shared pages with valid token" ON public.shared_pages;

-- Create URN table for login-less user identity
CREATE TABLE IF NOT EXISTS public.urns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  urn text UNIQUE NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  is_anonymous boolean NOT NULL DEFAULT true,
  CONSTRAINT valid_email CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Enable RLS on urns
ALTER TABLE public.urns ENABLE ROW LEVEL SECURITY;

-- URN policies
CREATE POLICY "Users can view their own URN"
  ON public.urns FOR SELECT
  USING (urn = current_setting('request.jwt.claims', true)::json->>'urn');

CREATE POLICY "Service role has full access to urns"
  ON public.urns FOR ALL
  USING (auth.role() = 'service_role');

-- Modify shared_pages table
ALTER TABLE public.shared_pages 
  ADD COLUMN IF NOT EXISTS urn_id uuid REFERENCES public.urns(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS content_type text,
  ADD COLUMN IF NOT EXISTS custom_slug text UNIQUE,
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS access_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_access_count integer;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_shared_pages_custom_slug ON public.shared_pages(custom_slug);
CREATE INDEX IF NOT EXISTS idx_shared_pages_share_token ON public.shared_pages(share_token);
CREATE INDEX IF NOT EXISTS idx_shared_pages_urn_id ON public.shared_pages(urn_id);

-- Update RLS policies for shared_pages
DROP POLICY IF EXISTS "Users can view their own shared pages" ON public.shared_pages;
DROP POLICY IF EXISTS "Users can create shared pages" ON public.shared_pages;
DROP POLICY IF EXISTS "Users can update their own shared pages" ON public.shared_pages;
DROP POLICY IF EXISTS "Users can delete their own shared pages" ON public.shared_pages;

CREATE POLICY "URN owners can view their shares"
  ON public.shared_pages FOR SELECT
  USING (
    urn_id IN (
      SELECT id FROM public.urns 
      WHERE urn = current_setting('request.jwt.claims', true)::json->>'urn'
    )
    OR deleted_at IS NULL
  );

CREATE POLICY "URN owners can create shares"
  ON public.shared_pages FOR INSERT
  WITH CHECK (
    urn_id IN (
      SELECT id FROM public.urns 
      WHERE urn = current_setting('request.jwt.claims', true)::json->>'urn'
    )
  );

CREATE POLICY "URN owners can update their shares"
  ON public.shared_pages FOR UPDATE
  USING (
    urn_id IN (
      SELECT id FROM public.urns 
      WHERE urn = current_setting('request.jwt.claims', true)::json->>'urn'
    )
  );

CREATE POLICY "URN owners can delete their shares"
  ON public.shared_pages FOR DELETE
  USING (
    urn_id IN (
      SELECT id FROM public.urns 
      WHERE urn = current_setting('request.jwt.claims', true)::json->>'urn'
    )
  );

CREATE POLICY "Service role has full access to shared_pages"
  ON public.shared_pages FOR ALL
  USING (auth.role() = 'service_role');

-- Create storage bucket for shared content
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shared-content',
  'shared-content',
  false,
  524288000, -- 500 MB
  ARRAY[
    'image/*',
    'video/*',
    'audio/*',
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/*'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for shared-content bucket
CREATE POLICY "Service role can manage all files"
  ON storage.objects FOR ALL
  USING (bucket_id = 'shared-content' AND auth.role() = 'service_role');

-- Function to cleanup expired shares (soft delete after 30 days)
CREATE OR REPLACE FUNCTION public.cleanup_expired_shares()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.shared_pages
  SET deleted_at = now()
  WHERE expires_at < now() - INTERVAL '30 days'
    AND deleted_at IS NULL;
END;
$$;

-- Function to update URN last seen
CREATE OR REPLACE FUNCTION public.update_urn_last_seen(urn_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.urns
  SET last_seen_at = now()
  WHERE urn = urn_value;
END;
$$;

-- Function to validate and sanitize URLs
CREATE OR REPLACE FUNCTION public.validate_url(url_input text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if URL starts with http:// or https://
  IF url_input !~* '^https?://' THEN
    RETURN false;
  END IF;
  
  -- Check for basic URL structure
  IF url_input !~* '^https?://[a-z0-9\-._~:/?#\[\]@!$&''()*+,;=%]+$' THEN
    RETURN false;
  END IF;
  
  -- Reject javascript: and data: schemes
  IF url_input ~* '^(javascript|data):' THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;
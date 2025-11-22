-- Add 2FA support to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS two_factor_secret text,
ADD COLUMN IF NOT EXISTS two_factor_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS two_factor_backup_codes text[];

-- Create 2FA verification attempts table for rate limiting
CREATE TABLE IF NOT EXISTS public.two_factor_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  success boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.two_factor_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own 2FA attempts"
ON public.two_factor_attempts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access to 2FA attempts"
ON public.two_factor_attempts FOR ALL
USING (auth.role() = 'service_role');

-- Function to check 2FA rate limiting
CREATE OR REPLACE FUNCTION check_2fa_rate_limit(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_attempts integer;
BEGIN
  -- Count failed attempts in last 15 minutes
  SELECT COUNT(*)
  INTO recent_attempts
  FROM public.two_factor_attempts
  WHERE user_id = p_user_id
    AND success = false
    AND created_at > now() - interval '15 minutes';
  
  -- Allow max 5 failed attempts per 15 minutes
  RETURN recent_attempts < 5;
END;
$$;

-- Add comprehensive URL validation
CREATE OR REPLACE FUNCTION validate_url_comprehensive(url_input text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reject null or empty
  IF url_input IS NULL OR trim(url_input) = '' THEN
    RETURN false;
  END IF;
  
  -- Check if URL starts with http:// or https://
  IF url_input !~* '^https?://' THEN
    RETURN false;
  END IF;
  
  -- Reject dangerous schemes
  IF url_input ~* '^(javascript|data|file|vbscript):' THEN
    RETURN false;
  END IF;
  
  -- Reject localhost and internal IPs
  IF url_input ~* '(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)' THEN
    RETURN false;
  END IF;
  
  -- Check for basic URL structure with proper domain
  IF url_input !~* '^https?://[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*[a-z0-9\-._~:/?#\[\]@!$&''()*+,;=%]*$' THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;
-- Create rate limiting table
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  attempts INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_key_window ON public.rate_limits(key, window_start);

-- Enable RLS
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role has full access to rate_limits"
ON public.rate_limits
FOR ALL
USING (auth.role() = 'service_role');

-- Auto-cleanup old rate limit entries (older than 1 hour)
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  DELETE FROM public.rate_limits
  WHERE window_start < now() - INTERVAL '1 hour';
END;
$$;

-- Function to check and update rate limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  rate_key TEXT,
  max_attempts INTEGER,
  window_minutes INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  current_attempts INTEGER;
  window_start_time TIMESTAMPTZ;
BEGIN
  -- Calculate window start time
  window_start_time := now() - (window_minutes || ' minutes')::INTERVAL;
  
  -- Get current attempts within the window
  SELECT COALESCE(SUM(attempts), 0)
  INTO current_attempts
  FROM public.rate_limits
  WHERE key = rate_key
    AND window_start >= window_start_time;
  
  -- Check if limit exceeded
  IF current_attempts >= max_attempts THEN
    RETURN FALSE;
  END IF;
  
  -- Insert new attempt
  INSERT INTO public.rate_limits (key, attempts, window_start)
  VALUES (rate_key, 1, now())
  ON CONFLICT DO NOTHING;
  
  RETURN TRUE;
END;
$$;
-- Create audit logs table for security monitoring
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  event_category TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  share_id UUID REFERENCES public.shared_pages(id) ON DELETE CASCADE,
  urn_id UUID REFERENCES public.urns(id) ON DELETE SET NULL,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for fast querying
CREATE INDEX idx_audit_logs_event_type ON public.audit_logs(event_type);
CREATE INDEX idx_audit_logs_severity ON public.audit_logs(severity);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_share_id ON public.audit_logs(share_id);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view audit logs (for security dashboard)
CREATE POLICY "Anyone can view audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (true);

-- Function to log security events
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type TEXT,
  p_event_category TEXT,
  p_severity TEXT,
  p_share_id UUID DEFAULT NULL,
  p_urn_id UUID DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    event_type,
    event_category,
    severity,
    share_id,
    urn_id,
    ip_address,
    user_agent,
    metadata
  ) VALUES (
    p_event_type,
    p_event_category,
    p_severity,
    p_share_id,
    p_urn_id,
    p_ip_address,
    p_user_agent,
    p_metadata
  )
  RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$;

-- Function to get security metrics
CREATE OR REPLACE FUNCTION public.get_security_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_shares', (
      SELECT COUNT(*) FROM public.shared_pages WHERE deleted_at IS NULL
    ),
    'active_shares', (
      SELECT COUNT(*) FROM public.shared_pages 
      WHERE deleted_at IS NULL AND expires_at > now()
    ),
    'expired_shares', (
      SELECT COUNT(*) FROM public.shared_pages 
      WHERE deleted_at IS NULL AND expires_at <= now()
    ),
    'total_accesses', (
      SELECT COALESCE(SUM(access_count), 0) FROM public.shared_pages
    ),
    'total_urns', (
      SELECT COUNT(*) FROM public.urns
    ),
    'recent_failures', (
      SELECT COUNT(*) FROM public.audit_logs 
      WHERE severity IN ('error', 'critical') 
      AND created_at > now() - INTERVAL '24 hours'
    ),
    'rate_limit_hits', (
      SELECT COUNT(*) FROM public.audit_logs 
      WHERE event_type = 'rate_limit_exceeded' 
      AND created_at > now() - INTERVAL '24 hours'
    ),
    'failed_passwords', (
      SELECT COUNT(*) FROM public.audit_logs 
      WHERE event_type = 'password_failed' 
      AND created_at > now() - INTERVAL '24 hours'
    ),
    'storage_used_mb', (
      SELECT COALESCE(ROUND(SUM(LENGTH(encrypted_content)::numeric / 1024 / 1024), 2), 0)
      FROM public.shared_pages
      WHERE deleted_at IS NULL
    ),
    'encryption_distribution', (
      SELECT jsonb_object_agg(
        COALESCE(encryption_metadata->>'algorithm', 'legacy'), 
        count
      )
      FROM (
        SELECT 
          encryption_metadata->>'algorithm' as algorithm,
          COUNT(*) as count
        FROM public.shared_pages
        WHERE deleted_at IS NULL
        GROUP BY encryption_metadata->>'algorithm'
      ) subquery
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Function to cleanup old audit logs (keep last 30 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  DELETE FROM public.audit_logs
  WHERE created_at < now() - INTERVAL '30 days';
END;
$$;
-- Enable pg_cron extension for scheduled cleanup
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule automatic cleanup of expired shares every hour
-- This will run the cleanup function to delete expired files from storage
SELECT cron.schedule(
  'cleanup-expired-shares',
  '0 * * * *', -- Every hour at minute 0
  $$SELECT public.cleanup_expired_share_files()$$
);

-- Add comment for documentation
COMMENT ON EXTENSION pg_cron IS 'Schedules cleanup of expired share files every hour';
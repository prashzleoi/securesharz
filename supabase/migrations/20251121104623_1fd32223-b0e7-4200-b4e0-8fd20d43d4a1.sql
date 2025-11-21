-- Add automatic storage cleanup for expired shares
-- This function deletes files from storage when shares expire

CREATE OR REPLACE FUNCTION public.cleanup_expired_share_files()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  expired_share RECORD;
BEGIN
  -- Find all expired shares with files that haven't been cleaned up
  FOR expired_share IN 
    SELECT id, file_path
    FROM public.shared_pages
    WHERE file_path IS NOT NULL
      AND expires_at < now()
      AND deleted_at IS NULL
  LOOP
    -- Delete file from storage
    BEGIN
      DELETE FROM storage.objects
      WHERE bucket_id = 'shared-content'
        AND name = expired_share.file_path;
      
      -- Mark share as deleted
      UPDATE public.shared_pages
      SET deleted_at = now()
      WHERE id = expired_share.id;
      
      RAISE LOG 'Cleaned up expired share file: %', expired_share.file_path;
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG 'Error cleaning up file %: %', expired_share.file_path, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- Create a trigger to automatically cleanup on share access
CREATE OR REPLACE FUNCTION public.trigger_cleanup_on_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If this share just reached max access count, schedule cleanup
  IF NEW.max_access_count IS NOT NULL 
     AND NEW.access_count >= NEW.max_access_count 
     AND OLD.access_count < NEW.max_access_count THEN
    
    -- Mark as deleted immediately
    NEW.deleted_at = now();
    
    -- Delete file from storage if exists
    IF NEW.file_path IS NOT NULL THEN
      DELETE FROM storage.objects
      WHERE bucket_id = 'shared-content'
        AND name = NEW.file_path;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_cleanup_max_access ON public.shared_pages;

-- Create trigger on access count update
CREATE TRIGGER trigger_cleanup_max_access
  BEFORE UPDATE OF access_count ON public.shared_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_cleanup_on_access();

-- Add comments for documentation
COMMENT ON FUNCTION public.cleanup_expired_share_files() IS 'Automatically deletes expired share files from storage';
COMMENT ON FUNCTION public.trigger_cleanup_on_access() IS 'Triggers cleanup when max access count is reached';
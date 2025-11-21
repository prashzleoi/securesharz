-- Fix database schema issues preventing share creation

-- Make user_id nullable since we're using URN-based auth
ALTER TABLE shared_pages 
ALTER COLUMN user_id DROP NOT NULL;

-- Make encrypted_content nullable since file-only shares don't have URL content
ALTER TABLE shared_pages 
ALTER COLUMN encrypted_content DROP NOT NULL;

-- Add constraint to ensure either user_id or urn_id exists
ALTER TABLE shared_pages
ADD CONSTRAINT user_or_urn_required 
CHECK (user_id IS NOT NULL OR urn_id IS NOT NULL);
-- Update shared_pages RLS policies to use user_id instead of urn_id
DROP POLICY IF EXISTS "URN owners can view their shares" ON public.shared_pages;
DROP POLICY IF EXISTS "URN owners can create shares" ON public.shared_pages;
DROP POLICY IF EXISTS "URN owners can update their shares" ON public.shared_pages;
DROP POLICY IF EXISTS "URN owners can delete their shares" ON public.shared_pages;

-- Create new authentication-based policies
CREATE POLICY "Users can view their own shares"
  ON public.shared_pages FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own shares"
  ON public.shared_pages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own shares"
  ON public.shared_pages FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own shares"
  ON public.shared_pages FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow anyone (authenticated or not) to view active shares for accessing shared content
CREATE POLICY "Anyone can view active shares for access"
  ON public.shared_pages FOR SELECT
  TO anon, authenticated
  USING (deleted_at IS NULL);
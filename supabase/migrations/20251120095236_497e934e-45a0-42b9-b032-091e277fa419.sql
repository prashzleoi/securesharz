-- Update handle_new_user function to add email validation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate email format
  IF new.email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email format: %', new.email;
  END IF;
  
  INSERT INTO public.profiles (user_id, email)
  VALUES (new.id, new.email);
  
  RETURN new;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error creating profile for user %: %', new.id, SQLERRM;
    RETURN new;  -- Don't block user creation
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
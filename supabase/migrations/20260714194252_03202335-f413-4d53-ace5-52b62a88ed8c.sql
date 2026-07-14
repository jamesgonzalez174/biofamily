CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _phone text := NULLIF(trim(NEW.raw_user_meta_data->>'phone'), '');
BEGIN
  IF _phone IS NULL AND (NEW.raw_app_meta_data->>'provider') IS DISTINCT FROM 'google' THEN
    RAISE EXCEPTION 'Phone number is required' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    _phone
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END; $function$;
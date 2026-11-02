CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _phone text := NULLIF(trim(NEW.raw_user_meta_data->>'phone'), '');
  _source text := NULLIF(NEW.raw_user_meta_data->>'referral_source', '');
  _rep uuid;
BEGIN
  IF _phone IS NULL AND (NEW.raw_app_meta_data->>'provider') IS DISTINCT FROM 'google' THEN
    RAISE EXCEPTION 'Phone number is required' USING ERRCODE = 'check_violation';
  END IF;

  IF _source IS NOT NULL AND _source NOT IN ('email','sales_rep','social_media','friend','pharmacy','other') THEN
    _source := NULL;
  END IF;
  IF _source = 'sales_rep' THEN
    SELECT id INTO _rep FROM public.sales_reps
     WHERE is_active AND id::text = NEW.raw_user_meta_data->>'sales_rep_id';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone, referral_source, sales_rep_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    _phone,
    _source,
    _rep
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END; $function$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_unique ON public.profiles (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique ON public.profiles (phone) WHERE phone IS NOT NULL AND phone <> '';

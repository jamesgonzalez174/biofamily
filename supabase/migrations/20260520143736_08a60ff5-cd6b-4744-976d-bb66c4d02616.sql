
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(),'admin'));

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  points_balance INTEGER NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'Bronze',
  lifetime_points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE INDEX profiles_email_idx ON public.profiles (lower(email));

CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins read all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update profiles" ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(),'admin'));

-- Auto-create profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated-at helper
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Prizes
CREATE TABLE public.prizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  point_cost INTEGER NOT NULL CHECK (point_cost >= 0),
  stock INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.prizes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER prizes_updated BEFORE UPDATE ON public.prizes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE POLICY "Anyone authed can view active prizes" ON public.prizes FOR SELECT
  TO authenticated USING (is_active OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage prizes" ON public.prizes FOR ALL
  USING (public.has_role(auth.uid(),'admin'));

-- Redemptions
CREATE TYPE public.redemption_status AS ENUM ('pending','shipped','claimed','cancelled');

CREATE TABLE public.redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prize_id UUID NOT NULL REFERENCES public.prizes(id),
  prize_name TEXT NOT NULL,
  points_spent INTEGER NOT NULL,
  status redemption_status NOT NULL DEFAULT 'pending',
  tracking_info TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER redemptions_updated BEFORE UPDATE ON public.redemptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE POLICY "Users view own redemptions" ON public.redemptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins view all redemptions" ON public.redemptions FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update redemptions" ON public.redemptions FOR UPDATE USING (public.has_role(auth.uid(),'admin'));

-- Points ledger
CREATE TABLE public.points_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual', -- 'zoho','redemption','manual','signup'
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;
CREATE INDEX ledger_user_idx ON public.points_ledger (user_id, created_at DESC);

CREATE POLICY "Users view own ledger" ON public.points_ledger FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins view all ledger" ON public.points_ledger FOR SELECT USING (public.has_role(auth.uid(),'admin'));

-- SKU points
CREATE TABLE public.sku_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  name TEXT,
  points_per_unit INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sku_points ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER sku_points_updated BEFORE UPDATE ON public.sku_points
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE POLICY "Admins manage skus" ON public.sku_points FOR ALL USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins view skus" ON public.sku_points FOR SELECT USING (public.has_role(auth.uid(),'admin'));

-- Settings (singleton row)
CREATE TABLE public.settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  points_per_dollar NUMERIC NOT NULL DEFAULT 1,
  enable_invoice_total_fallback BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.settings (id) VALUES (1);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER settings_updated BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE POLICY "Anyone authed reads settings" ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins update settings" ON public.settings FOR UPDATE USING (public.has_role(auth.uid(),'admin'));

-- Zoho events log
CREATE TABLE public.zoho_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE,
  event_type TEXT,
  customer_email TEXT,
  payload JSONB NOT NULL,
  points_awarded INTEGER DEFAULT 0,
  processed BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.zoho_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view zoho events" ON public.zoho_events FOR SELECT USING (public.has_role(auth.uid(),'admin'));

-- Storage bucket for prize images
INSERT INTO storage.buckets (id, name, public) VALUES ('prize-images', 'prize-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read prize images" ON storage.objects FOR SELECT USING (bucket_id = 'prize-images');
CREATE POLICY "Admins upload prize images" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'prize-images' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update prize images" ON storage.objects FOR UPDATE
  USING (bucket_id = 'prize-images' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete prize images" ON storage.objects FOR DELETE
  USING (bucket_id = 'prize-images' AND public.has_role(auth.uid(),'admin'));

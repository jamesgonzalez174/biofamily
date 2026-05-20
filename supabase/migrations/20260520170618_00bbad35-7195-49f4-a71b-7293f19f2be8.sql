CREATE TABLE public.zoho_customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  zoho_contact_id TEXT NOT NULL UNIQUE,
  email TEXT,
  full_name TEXT,
  company_name TEXT,
  loyalty_points NUMERIC,
  history_points NUMERIC,
  raw JSONB,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX zoho_customers_email_idx ON public.zoho_customers (lower(email));
ALTER TABLE public.zoho_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read zoho_customers" ON public.zoho_customers FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins write zoho_customers" ON public.zoho_customers FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
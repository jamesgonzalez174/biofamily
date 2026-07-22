
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  zoho_invoice_id TEXT NOT NULL UNIQUE,
  invoice_number TEXT,
  zoho_contact_id TEXT,
  pharmacy_id UUID REFERENCES public.pharmacies(id) ON DELETE SET NULL,
  invoice_date DATE,
  due_date DATE,
  total NUMERIC,
  balance NUMERIC,
  currency_code TEXT,
  status TEXT,
  raw JSONB,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX invoices_pharmacy_id_idx ON public.invoices(pharmacy_id);
CREATE INDEX invoices_zoho_contact_id_idx ON public.invoices(zoho_contact_id);
CREATE INDEX invoices_invoice_number_idx ON public.invoices(invoice_number);

GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view invoices"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER invoices_set_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

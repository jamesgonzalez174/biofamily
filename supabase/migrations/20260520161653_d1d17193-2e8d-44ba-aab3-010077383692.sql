
CREATE TABLE public.statuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url TEXT NOT NULL,
  caption TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours')
);

ALTER TABLE public.statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage statuses" ON public.statuses
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authed view active statuses" ON public.statuses
  FOR SELECT TO authenticated
  USING (expires_at > now() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_statuses_active ON public.statuses(expires_at DESC);

-- Public storage bucket for status images
INSERT INTO storage.buckets (id, name, public) VALUES ('statuses', 'statuses', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read statuses bucket" ON storage.objects
  FOR SELECT USING (bucket_id = 'statuses');

CREATE POLICY "Admins upload statuses" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'statuses' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete statuses" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'statuses' AND public.has_role(auth.uid(), 'admin'));

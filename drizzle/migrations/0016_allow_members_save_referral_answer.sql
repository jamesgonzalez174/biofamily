-- Members can save only their own "how did you find out about the app" answer again.
-- 0012 narrowed profile updates to pharmacy_id + full_name, which also blocked these two
-- columns, so the pop-up could never be dismissed permanently.
GRANT UPDATE (referral_source, sales_rep_id) ON public.profiles TO authenticated;
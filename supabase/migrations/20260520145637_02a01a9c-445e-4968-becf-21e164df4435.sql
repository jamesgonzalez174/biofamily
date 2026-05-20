
-- Promote to admin
INSERT INTO public.user_roles (user_id, role)
VALUES ('d81e4875-03ed-4c2c-9b93-086fa7b307e1', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Give 5000 starter points
UPDATE public.profiles
SET points_balance = 5000, lifetime_points = 5000, tier = 'Silver'
WHERE id = 'd81e4875-03ed-4c2c-9b93-086fa7b307e1';

INSERT INTO public.points_ledger (user_id, delta, reason, source)
VALUES ('d81e4875-03ed-4c2c-9b93-086fa7b307e1', 5000, 'Welcome bonus', 'manual');

-- Sample prizes
INSERT INTO public.prizes (name, description, point_cost, stock, is_active) VALUES
('$10 Gift Card', 'Digital gift card delivered by email.', 500, 100, true),
('Branded Coffee Mug', 'Ceramic 12oz mug with our logo.', 800, 50, true),
('Wireless Earbuds', 'Bluetooth 5.3 earbuds with charging case.', 3500, 20, true),
('Premium Hoodie', 'Soft fleece hoodie, unisex sizing.', 2500, 30, true),
('Smart Water Bottle', 'Tracks hydration through the day.', 1800, 25, true),
('Mystery Box', 'Surprise bundle of goodies worth $50+.', 4000, 10, true);

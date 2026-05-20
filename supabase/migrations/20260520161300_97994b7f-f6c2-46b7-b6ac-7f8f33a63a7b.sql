UPDATE prizes SET image_url = CASE name
  WHEN '$10 Gift Card' THEN 'https://images.unsplash.com/photo-1607344645866-009c320b63e0?w=800&q=80'
  WHEN 'Branded Coffee Mug' THEN 'https://images.unsplash.com/photo-1577937927133-66ef06acdf18?w=800&q=80'
  WHEN 'Smart Water Bottle' THEN 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800&q=80'
  WHEN 'Premium Hoodie' THEN 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800&q=80'
  WHEN 'Wireless Earbuds' THEN 'https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=800&q=80'
  WHEN 'Mystery Box' THEN 'https://images.unsplash.com/photo-1513885535751-8b9238bd345a?w=800&q=80'
END
WHERE name IN ('$10 Gift Card','Branded Coffee Mug','Smart Water Bottle','Premium Hoodie','Wireless Earbuds','Mystery Box');
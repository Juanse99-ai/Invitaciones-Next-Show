-- ============================================================
-- NEXT SHOW · Seed
-- Migration 20260510000005
-- - 1 evento (NEXT SHOW · Toromobolo + Jair Luquez · 2026-08-15)
-- - 2 zonas (Risas $100k × 200 general, Cantas $150k × 100 numbered)
-- - 100 seats (4 filas A-D × 25 sillas, pasillo entre 12 y 13)
-- - 1 referrer organico default
-- - 1 storage bucket privado 'tickets'
-- ============================================================

-- Evento principal
INSERT INTO events (slug, name, event_date, venue, total_capacity, status, settings)
VALUES (
  'nextshow-torombolo-jair-2026',
  'NEXT SHOW · Toromobolo Welc''h + Jair Luquez',
  '2026-08-15 20:00:00-05',
  'Sabanalarga, Atlántico',
  300,
  'selling',
  jsonb_build_object(
    'door_pin', '1234',
    'admin_pins', jsonb_build_array('123456'),
    'staff_names', jsonb_build_array('Carlos', 'Andrés', 'María', 'Luis'),
    'refund_cutoff_days', 7,
    'max_seats_per_order', 10,
    'hold_minutes', 10,
    'host', 'Natalya Ruiz Blel'
  )
);

-- Zonas
WITH e AS (SELECT id FROM events WHERE slug = 'nextshow-torombolo-jair-2026')
INSERT INTO zones (event_id, code, name, price_cop, capacity, seating_mode, display_order)
SELECT e.id, 'risas',  'Risas',  100000, 200, 'general',  1 FROM e
UNION ALL
SELECT e.id, 'cantas', 'Cantas', 150000, 100, 'numbered', 2 FROM e;

-- Seats Cantas: 4 filas A-D × 25 sillas (1-25), pasillo entre 12 y 13
WITH cantas AS (SELECT id FROM zones WHERE code = 'cantas')
INSERT INTO seats (zone_id, row_label, seat_number, side)
SELECT
  cantas.id,
  row_label,
  seat_number,
  CASE WHEN seat_number <= 12 THEN 'izq' ELSE 'der' END
FROM cantas,
     unnest(ARRAY['A','B','C','D']) AS row_label,
     generate_series(1, 25) AS seat_number;

-- Referrer organico default
INSERT INTO referrers (type, name, notes)
VALUES ('organico', 'Tráfico orgánico', 'Default cuando no hay UTM ni cupón');

-- Storage bucket privado para PDFs de boletas
INSERT INTO storage.buckets (id, name, public)
VALUES ('tickets', 'tickets', false)
ON CONFLICT (id) DO NOTHING;

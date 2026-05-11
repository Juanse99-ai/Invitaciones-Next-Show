-- ============================================================
-- NEXT SHOW · Views
-- Migration 20260510000003
-- - v_seat_availability  : estado por silla (sold/held/free) [Cantas]
-- - v_zone_availability  : conteos por zona (Risas + Cantas)
-- - v_referrer_stats     : KPIs de referrers
-- - v_coupon_funnel      : funnel de cupones
-- - v_seat_heatmap       : orden de venta por silla (analytics)
-- ============================================================

-- Disponibilidad por silla (Cantas)
CREATE OR REPLACE VIEW v_seat_availability AS
SELECT
  s.id AS seat_id,
  s.zone_id,
  s.row_label,
  s.seat_number,
  s.side,
  CASE
    WHEN t.id IS NOT NULL THEN 'sold'
    WHEN h.id IS NOT NULL AND h.expires_at > now() THEN 'held'
    ELSE 'free'
  END AS status,
  t.id AS ticket_id,
  h.expires_at AS held_until
FROM seats s
LEFT JOIN tickets t ON t.seat_id = s.id
  AND EXISTS (SELECT 1 FROM orders o WHERE o.id = t.order_id AND o.status = 'paid')
LEFT JOIN seat_holds h ON h.seat_id = s.id AND h.expires_at > now();

-- Disponibilidad por zona (Risas + Cantas)
CREATE OR REPLACE VIEW v_zone_availability AS
SELECT
  z.id AS zone_id,
  z.event_id,
  z.code,
  z.name,
  z.capacity,
  z.price_cop,
  z.seating_mode,
  COALESCE(sold.cnt, 0) AS sold,
  COALESCE(held.cnt, 0) AS held,
  z.capacity - COALESCE(sold.cnt, 0) - COALESCE(held.cnt, 0) AS available
FROM zones z
LEFT JOIN LATERAL (
  SELECT count(*)::int AS cnt
  FROM tickets t
  JOIN orders o ON o.id = t.order_id
  WHERE o.zone_id = z.id AND o.status = 'paid'
) sold ON true
LEFT JOIN LATERAL (
  SELECT count(*)::int AS cnt
  FROM orders o2
  WHERE o2.zone_id = z.id
    AND o2.status = 'pending'
    AND o2.expires_at > now()
) held ON true;

-- Stats referrers
CREATE OR REPLACE VIEW v_referrer_stats AS
SELECT
  r.id AS referrer_id,
  r.name,
  r.type,
  r.commission_pct,
  COUNT(DISTINCT c.id) AS coupons_emitted,
  COALESCE(SUM(c.uses_count), 0) AS coupons_used,
  COALESCE(SUM(o.total_cop) FILTER (WHERE o.status = 'paid'), 0) AS attributed_revenue_cop,
  COALESCE(SUM(o.total_cop) FILTER (WHERE o.status = 'paid'), 0)
    * COALESCE(r.commission_pct, 0) / 100.0 AS calculated_commission_cop
FROM referrers r
LEFT JOIN coupons c ON c.referrer_id = r.id
LEFT JOIN orders  o ON o.referrer_id = r.id
GROUP BY r.id;

-- Funnel cupones
CREATE OR REPLACE VIEW v_coupon_funnel AS
SELECT
  c.id AS coupon_id,
  c.code,
  c.discount_cop,
  c.max_uses,
  c.uses_count,
  c.status,
  c.created_at AS emitted_at,
  ROUND(100.0 * c.uses_count / NULLIF(c.max_uses, 0), 1) AS conversion_pct
FROM coupons c;

-- Heatmap venta (Fase 2 base)
CREATE OR REPLACE VIEW v_seat_heatmap AS
SELECT
  s.id AS seat_id,
  s.row_label,
  s.seat_number,
  o.paid_at AS sold_at,
  ROW_NUMBER() OVER (ORDER BY o.paid_at) AS sale_order_index
FROM seats s
JOIN tickets t ON t.seat_id = s.id
JOIN orders  o ON o.id = t.order_id
WHERE o.status = 'paid'
ORDER BY o.paid_at;

-- Grant SELECT on availability views to anon (read-only public data)
GRANT SELECT ON v_seat_availability TO anon;
GRANT SELECT ON v_zone_availability TO anon;

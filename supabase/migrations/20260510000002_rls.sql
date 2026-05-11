-- ============================================================
-- NEXT SHOW · Row Level Security
-- Migration 20260510000002
-- Habilita RLS en todas las tablas y crea policies mínimas
-- para el rol anon (lectura de catálogo + insert de leads/waitlist).
-- Todas las demás escrituras pasan por Edge Functions con
-- service_role (bypass automático de RLS).
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones          ENABLE ROW LEVEL SECURITY;
ALTER TABLE seats          ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons        ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE seat_holds     ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE blacklist      ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist       ENABLE ROW LEVEL SECURITY;
ALTER TABLE walkup_queue   ENABLE ROW LEVEL SECURITY;

-- Anon: read public catalog
CREATE POLICY anon_read_events ON events FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_zones  ON zones  FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_seats  ON seats  FOR SELECT TO anon USING (true);

-- Anon: insert leads (existing form en landing)
CREATE POLICY anon_insert_leads ON leads FOR INSERT TO anon WITH CHECK (true);

-- Anon: insert waitlist
CREATE POLICY anon_insert_waitlist ON waitlist FOR INSERT TO anon WITH CHECK (true);

-- Anon: read coupon to validate (only active, only fields needed)
CREATE POLICY anon_read_active_coupons ON coupons FOR SELECT TO anon
  USING (status = 'active' AND uses_count < max_uses
         AND (valid_from IS NULL OR valid_from <= now())
         AND (valid_until IS NULL OR valid_until >= now()));

-- All other writes go through Edge Functions with service_role.
-- Service role bypasses RLS automatically.

-- DENY everything else for anon (implícito — RLS habilitado sin policy = deny).

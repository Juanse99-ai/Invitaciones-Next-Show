-- ============================================================
-- NEXT SHOW · Init Schema
-- Migration 20260510000001
-- Tables: events, zones, seats, referrers, coupons, orders,
--         tickets, seat_holds, delivery_log, entry_attempts,
--         leads, blacklist, waitlist, walkup_queue
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- pg_cron se intenta crear en la migración 20260510000004_pg_cron.sql
-- con guardia condicional: en local Supabase puede no estar disponible.

-- ============ EVENTS ============
CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  event_date timestamptz NOT NULL,
  venue text NOT NULL,
  total_capacity int NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','selling','sold_out','closed','cancelled')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ ZONES ============
CREATE TABLE zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  price_cop int NOT NULL,
  capacity int NOT NULL,
  seating_mode text NOT NULL CHECK (seating_mode IN ('general','numbered')),
  display_order int NOT NULL DEFAULT 0,
  UNIQUE (event_id, code)
);

-- ============ SEATS ============
CREATE TABLE seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  row_label text NOT NULL,
  seat_number int NOT NULL,
  side text NOT NULL CHECK (side IN ('izq','der')),
  UNIQUE (zone_id, row_label, seat_number)
);
CREATE INDEX idx_seats_zone ON seats(zone_id);

-- ============ REFERRERS ============
CREATE TABLE referrers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('lead_propio','influencer','staff','sponsor','organico')),
  name text NOT NULL,
  contact text,
  commission_pct numeric(5,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ COUPONS ============
CREATE TABLE coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  discount_cop int NOT NULL,
  max_uses int NOT NULL DEFAULT 1,
  uses_count int NOT NULL DEFAULT 0,
  referrer_id uuid REFERENCES referrers(id) ON DELETE SET NULL,
  valid_from timestamptz,
  valid_until timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','exhausted')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coupons_code ON coupons(code) WHERE status = 'active';

-- ============ ORDERS ============
CREATE SEQUENCE order_number_seq START 1;

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL DEFAULT ('NS-2026-' || lpad(nextval('order_number_seq')::text, 5, '0')),
  event_id uuid NOT NULL REFERENCES events(id),
  zone_id uuid NOT NULL REFERENCES zones(id),
  buyer_name text NOT NULL,
  buyer_id_number text NOT NULL,
  buyer_phone text NOT NULL,
  buyer_email text NOT NULL,
  quantity int NOT NULL CHECK (quantity > 0),
  subtotal_cop int NOT NULL,
  discount_cop int NOT NULL DEFAULT 0,
  total_cop int NOT NULL,
  coupon_id uuid REFERENCES coupons(id),
  referrer_id uuid REFERENCES referrers(id),
  attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','expired','failed','refunded','manual_review')),
  wompi_transaction_id text UNIQUE,
  wompi_reference text UNIQUE NOT NULL,
  client_ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  refunded_at timestamptz
);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_buyer_id ON orders(buyer_id_number);
CREATE INDEX idx_orders_buyer_phone ON orders(buyer_phone);
CREATE INDEX idx_orders_wompi_ref ON orders(wompi_reference);

-- ============ TICKETS ============
CREATE TABLE tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  ticket_code text UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  seat_id uuid REFERENCES seats(id),
  attendee_name text,
  attendee_id_number text,
  transferred_at timestamptz,
  transferred_from text,
  checked_in_at timestamptz,
  checked_in_by text,
  pdf_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seat_id)
);
CREATE INDEX idx_tickets_order ON tickets(order_id);
CREATE INDEX idx_tickets_code ON tickets(ticket_code);
CREATE INDEX idx_tickets_attendee_id ON tickets(attendee_id_number);

-- ============ SEAT_HOLDS ============
CREATE TABLE seat_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_id uuid NOT NULL UNIQUE REFERENCES seats(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_seat_holds_expires ON seat_holds(expires_at);

-- ============ DELIVERY_LOG ============
CREATE TABLE delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_delivery_log_status ON delivery_log(status, attempts);

-- ============ ENTRY_ATTEMPTS ============
CREATE TABLE entry_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES tickets(id),
  ticket_code_raw text NOT NULL,
  result text NOT NULL CHECK (result IN ('ok','already_used','invalid','unpaid','wrong_date')),
  forced boolean NOT NULL DEFAULT false,
  staff_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_entry_attempts_ticket ON entry_attempts(ticket_id);

-- ============ LEADS (existente, idempotente) ============
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  celular text NOT NULL,
  email text NOT NULL,
  municipio text,
  zona_interes text,
  acepta_comunicaciones boolean NOT NULL DEFAULT true,
  evento_id text NOT NULL,
  origen text NOT NULL DEFAULT 'landing-presale',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ BLACKLIST ============
CREATE TABLE blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id),
  id_number text NOT NULL,
  phone text,
  reason text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_blacklist_id ON blacklist(id_number);

-- ============ WAITLIST (Fase 2 stub) ============
CREATE TABLE waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id),
  zone_id uuid NOT NULL REFERENCES zones(id),
  name text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz
);

-- ============ WALKUP_QUEUE ============
CREATE TABLE walkup_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id),
  name text NOT NULL,
  id_number text NOT NULL,
  phone text,
  position int NOT NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','admitted','left')),
  created_at timestamptz NOT NULL DEFAULT now()
);

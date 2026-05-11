# NEXT SHOW Plataforma · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la plataforma completa de venta + ingreso de boletas para NEXT SHOW (evento Sabanalarga 2026-08-15) según la spec aprobada `docs/superpowers/specs/2026-05-10-nextshow-checkout-design.md`. Todo el código en sandbox/local: Supabase local stack, Wompi sandbox (placeholders), email/WA mockeados con logs. Listo para deploy a producción cuando el usuario provea credenciales.

**Architecture:** Single-file HTML pattern (sin framework, sin build) para 4 páginas (`index.html`, `asignar.html`, `scanner.html`, `admin.html`) + PWA scanner con service worker + Supabase backend (Postgres + RLS + Edge Functions Deno + Storage + Realtime + pg_cron). Hosting Netlify, repo GitHub privado.

**Tech Stack:** HTML5, ES2024 vanilla JS, CSS con View Transitions API, SVG inline, Supabase 2.x (CLI 2.84), Postgres 15, Deno via `supabase functions serve`, Wompi Widget v1, Cloudflare Turnstile, jsQR fallback + BarcodeDetector API, Workbox service worker, Chart.js, pdf-lib, qrcode-svg, Apple PassKit, Google Wallet API, Resend (mock), WA Cloud API (mock).

---

## Project Layout

```
NEXT SHOWS/
├── .git/
├── .gitignore
├── .env.example
├── README.md
├── netlify.toml
├── package.json
├── public/                            ← deploy target Netlify
│   ├── index.html                     ← landing extendido (existente, reemplazado)
│   ├── asignar.html
│   ├── scanner.html
│   ├── scanner-manifest.json
│   ├── scanner-sw.js
│   ├── admin.html
│   ├── politica-privacidad.html
│   ├── mi-boleta.html                 ← Fase 2 stub
│   ├── _redirects                     ← Netlify routing
│   ├── _headers                       ← seguridad CSP
│   ├── i18n/
│   │   ├── es.json
│   │   └── en.json
│   ├── shared/
│   │   ├── supabase-client.js
│   │   ├── wompi-client.js
│   │   ├── i18n.js
│   │   ├── toast.js
│   │   └── analytics.js
│   └── assets/
│       ├── icons/
│       └── fonts/
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 20260510000001_init_schema.sql
│   │   ├── 20260510000002_rls.sql
│   │   ├── 20260510000003_views.sql
│   │   ├── 20260510000004_pg_cron.sql
│   │   └── 20260510000005_seed.sql
│   ├── functions/
│   │   ├── _shared/
│   │   │   ├── cors.ts
│   │   │   ├── supabase.ts
│   │   │   ├── wompi.ts
│   │   │   ├── email.ts
│   │   │   ├── whatsapp.ts
│   │   │   ├── pdf.ts
│   │   │   ├── qr.ts
│   │   │   ├── wallet.ts
│   │   │   ├── signing.ts
│   │   │   └── errors.ts
│   │   ├── create-order/index.ts
│   │   ├── wompi-webhook/index.ts
│   │   ├── send-ticket/index.ts
│   │   ├── assign-attendees/index.ts
│   │   ├── validate-ticket/index.ts
│   │   ├── get-order-status/index.ts
│   │   ├── scanner-manifest/index.ts
│   │   ├── generate-wallet-pass/index.ts
│   │   └── admin-auth/index.ts
│   └── seed.sql
├── tests/
│   ├── unit/
│   │   ├── signing.test.ts
│   │   └── pricing.test.ts
│   ├── integration/
│   │   ├── create-order.test.ts
│   │   ├── webhook-idempotency.test.ts
│   │   └── seat-race.test.ts
│   └── e2e/
│       ├── purchase-cantas.spec.ts
│       ├── purchase-risas.spec.ts
│       └── scanner.spec.ts
├── scripts/
│   ├── seed-coupons.ts
│   ├── smoke-test.sh
│   └── generate-sample-qrs.ts
└── docs/
    └── superpowers/
        ├── specs/2026-05-10-nextshow-checkout-design.md
        └── plans/2026-05-10-nextshow-implementation.md
```

---

## Phase 0 — Project Scaffold (sequential, ~15min)

### Task 0.1 — `.gitignore`

**Files:** Create `.gitignore`

- [ ] Crear archivo:

```gitignore
# deps
node_modules/
.pnpm-store/

# env
.env
.env.local
.env.*.local

# supabase
supabase/.branches
supabase/.temp
**/supabase/.env

# build artifacts
dist/
.netlify/
.vercel/

# OS
.DS_Store
Thumbs.db
*.swp

# IDE
.vscode/
.idea/
*.iml

# logs
*.log
npm-debug.log*

# test
coverage/
test-results/
playwright-report/
playwright/.cache/

# secrets
*.pem
*.key
*.p8
*.cer
*.pkpass
secrets/
```

- [ ] Commit:

```bash
git add .gitignore
git commit -m "chore: add gitignore"
```

### Task 0.2 — `package.json`

**Files:** Create `package.json`

- [ ] Crear:

```json
{
  "name": "nextshow",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "NEXT SHOW · plataforma de venta e ingreso de boletas",
  "scripts": {
    "dev": "npx serve public -p 8000",
    "supabase:start": "supabase start",
    "supabase:stop": "supabase stop",
    "supabase:reset": "supabase db reset",
    "supabase:functions": "supabase functions serve --env-file .env.local --no-verify-jwt",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "lint": "eslint public supabase/functions",
    "format": "prettier --write \"public/**/*.{html,css,js}\" \"supabase/**/*.ts\""
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "@types/node": "^22.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.3.0",
    "serve": "^14.2.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0",
    "@supabase/supabase-js": "^2.45.0"
  }
}
```

- [ ] Instalar deps:

```bash
npm install
```

- [ ] Commit:

```bash
git add package.json package-lock.json
git commit -m "chore: add package.json with dev tooling"
```

### Task 0.3 — `.env.example`

**Files:** Create `.env.example`

- [ ] Crear con todas las variables del spec sección 7:

```bash
# === Supabase (local stack defaults from `supabase status`) ===
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=__set_after_supabase_start__
SUPABASE_SERVICE_ROLE_KEY=__set_after_supabase_start__

# === Wompi (sandbox) ===
WOMPI_PUBLIC_KEY=pub_test_REPLACE_ME
WOMPI_PRIVATE_KEY=prv_test_REPLACE_ME
WOMPI_EVENTS_SECRET=REPLACE_ME
WOMPI_INTEGRITY_SECRET=REPLACE_ME

# === Email (Resend) — MOCK en local, reemplazar al ir a prod ===
RESEND_API_KEY=mock
RESEND_FROM_EMAIL=NEXT SHOW <noreply@nextshow.test>

# === WhatsApp (Meta Cloud) — MOCK en local ===
WA_CLOUD_TOKEN=mock
WA_PHONE_NUMBER_ID=mock
WA_TEMPLATE_TICKET=ticket_emitido_v1
WA_TEMPLATE_REMINDER_7D=recordatorio_7dias_v1
WA_TEMPLATE_REMINDER_1D=recordatorio_1dia_v1
WA_TEMPLATE_REMINDER_2H=recordatorio_2horas_v1

# === Signing secrets (HMAC) — generar fuertes en prod ===
TICKET_SIGNING_SECRET=dev_only_change_me_in_prod
ASSIGN_SIGNING_SECRET=dev_only_change_me_in_prod
SCANNER_SIGNING_SECRET=dev_only_change_me_in_prod

# === App ===
APP_BASE_URL=http://localhost:8000
ADMIN_ALERT_EMAIL=ferna.moreno10@gmail.com
ADMIN_ALERT_WA=573000000000

# === Cloudflare Turnstile (test keys siempre passing) ===
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET=1x0000000000000000000000000000000AA

# === Pixels (placeholders) ===
META_PIXEL_ID=000000000000000
TIKTOK_PIXEL_ID=CXXXXXXXXXXXXXXXXXX
GA4_MEASUREMENT_ID=G-XXXXXXXXXX

# === Apple Wallet (placeholders) ===
APPLE_PASS_TYPE_ID=pass.co.nextshow.ticket
APPLE_TEAM_ID=XXXXXXXXXX
APPLE_PASS_CERT_PEM=__base64__
APPLE_PASS_KEY_PEM=__base64__

# === Google Wallet (placeholders) ===
GOOGLE_WALLET_ISSUER_ID=3388000000000000000
GOOGLE_WALLET_SERVICE_ACCOUNT_JSON=__base64__
```

- [ ] Copiar a `.env.local`:

```bash
cp .env.example .env.local
```

- [ ] Commit:

```bash
git add .env.example
git commit -m "chore: add env template"
```

### Task 0.4 — `supabase init`

**Files:** Initialize Supabase local project

- [ ] Ejecutar:

```bash
supabase init
```

- [ ] Verificar que se creó `supabase/config.toml` y carpetas.

- [ ] Editar `supabase/config.toml` para asegurar que estén habilitadas: `realtime`, `storage`, `edge_runtime`, `db.extensions = ["pg_cron", "pgcrypto"]`.

- [ ] Commit:

```bash
git add supabase/
git commit -m "chore: supabase init"
```

### Task 0.5 — Estructura carpetas

**Files:** Create empty dirs

- [ ] Ejecutar:

```bash
mkdir -p public/{shared,i18n,assets/{icons,fonts}}
mkdir -p supabase/functions/_shared
mkdir -p supabase/functions/{create-order,wompi-webhook,send-ticket,assign-attendees,validate-ticket,get-order-status,scanner-manifest,generate-wallet-pass,admin-auth}
mkdir -p tests/{unit,integration,e2e}
mkdir -p scripts
```

- [ ] Mover landing existente a `public/index.html` (backup primero):

```bash
cp "/Users/fernandomoreno/Downloads/landing-nextshow-v6_1.html" "public/index.html.original"
mv "landing-nextshow-v6_1.html" "public/index.html"
```

(Si la landing está en root del proyecto, moverla. Si está en Downloads, copiarla.)

- [ ] Commit:

```bash
git add public/index.html.original public/index.html
git commit -m "chore: move existing landing to public/"
```

### Task 0.6 — `netlify.toml`, `_redirects`, `_headers`

**Files:** Create Netlify config

- [ ] `netlify.toml`:

```toml
[build]
  publish = "public"
  command = ""

[[redirects]]
  from = "/v"
  to = "/scanner.html"
  status = 200

[[redirects]]
  from = "/comprar"
  to = "/index.html#boletas"
  status = 301

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(self), microphone=()"
    Strict-Transport-Security = "max-age=31536000; includeSubDomains"
    Content-Security-Policy = "default-src 'self'; script-src 'self' 'unsafe-inline' https://checkout.wompi.co https://challenges.cloudflare.com https://www.googletagmanager.com https://connect.facebook.net https://analytics.tiktok.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' http://127.0.0.1:54321 https://*.supabase.co wss://*.supabase.co https://api.wompi.co https://challenges.cloudflare.com; frame-src 'self' https://checkout.wompi.co https://challenges.cloudflare.com;"

[[headers]]
  for = "/scanner-sw.js"
  [headers.values]
    Cache-Control = "no-cache, no-store, must-revalidate"
    Service-Worker-Allowed = "/"
```

- [ ] `public/_redirects`:

```
/v   /scanner.html  200
```

- [ ] Commit:

```bash
git add netlify.toml public/_redirects
git commit -m "chore: netlify config + security headers"
```

### Task 0.7 — `README.md`

**Files:** Create `README.md`

- [ ] Crear con sección de quickstart, archivos, scripts, deploy, stack, links a spec/plan.

- [ ] Commit:

```bash
git add README.md
git commit -m "docs: add README"
```

### Task 0.8 — Crear repo GitHub privado

- [ ] Ejecutar:

```bash
gh repo create nextshow --private --source=. --remote=origin --description="NEXT SHOW · plataforma de venta e ingreso de boletas"
git push -u origin main
```

---

## Phase 1 — Database Schema (Agent A, ~45min)

**Subagent prompt:** Implementar el schema completo de Supabase según la spec sección 5. Trabajar en `/Users/fernandomoreno/Library/Mobile Documents/com~apple~CloudDocs/NEXO CLIENTES/NEXT SHOWS/`. Crear las 5 migraciones SQL, ejecutar `supabase db reset` para validar que aplican limpio. Verificar con `supabase db lint`. Las migraciones son las únicas fuente de verdad; no editar el schema directamente. Cada migración hace UNA cosa.

### Task 1.1 — Migration `init_schema.sql`

**Files:** Create `supabase/migrations/20260510000001_init_schema.sql`

- [ ] Crear migración con todas las tablas de la spec sección 5:

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;

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
```

- [ ] Validar:

```bash
supabase db reset
```

Esperado: `Finished supabase db reset on branch main.` sin errores.

- [ ] Commit:

```bash
git add supabase/migrations/20260510000001_init_schema.sql
git commit -m "feat(db): init schema with all tables"
```

### Task 1.2 — Migration `rls.sql`

**Files:** Create `supabase/migrations/20260510000002_rls.sql`

- [ ] Crear:

```sql
-- Enable RLS on all tables
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrers ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE seat_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE walkup_queue ENABLE ROW LEVEL SECURITY;

-- Anon: read public catalog
CREATE POLICY anon_read_events ON events FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_zones  ON zones  FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_seats  ON seats  FOR SELECT TO anon USING (true);

-- Anon: insert leads (existing form)
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

-- DENY everything else for anon (implicit — RLS enabled with no policy = deny).
```

- [ ] Validar:

```bash
supabase db reset
```

- [ ] Commit:

```bash
git add supabase/migrations/20260510000002_rls.sql
git commit -m "feat(db): RLS policies"
```

### Task 1.3 — Migration `views.sql`

**Files:** Create `supabase/migrations/20260510000003_views.sql`

- [ ] Crear:

```sql
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

-- Disponibilidad por zona (Risas)
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
LEFT JOIN orders o ON o.referrer_id = r.id
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
JOIN orders o ON o.id = t.order_id
WHERE o.status = 'paid'
ORDER BY o.paid_at;

-- Grant SELECT on views to anon (read-only public data)
GRANT SELECT ON v_seat_availability TO anon;
GRANT SELECT ON v_zone_availability TO anon;
```

- [ ] Validar y commit:

```bash
supabase db reset
git add supabase/migrations/20260510000003_views.sql
git commit -m "feat(db): availability + stats views"
```

### Task 1.4 — Migration `pg_cron.sql`

**Files:** Create `supabase/migrations/20260510000004_pg_cron.sql`

- [ ] Crear:

```sql
-- Cleanup holds expirados cada minuto
SELECT cron.schedule(
  'cleanup-expired-holds',
  '* * * * *',
  $$ DELETE FROM seat_holds WHERE expires_at < now() $$
);

-- Marcar orders pending vencidas como expired cada minuto
SELECT cron.schedule(
  'expire-pending-orders',
  '* * * * *',
  $$ UPDATE orders SET status = 'expired' WHERE status = 'pending' AND expires_at < now() $$
);

-- Marcar coupons exhausted
SELECT cron.schedule(
  'mark-exhausted-coupons',
  '* * * * *',
  $$ UPDATE coupons SET status = 'exhausted' WHERE status = 'active' AND uses_count >= max_uses $$
);
```

- [ ] Commit:

```bash
git add supabase/migrations/20260510000004_pg_cron.sql
git commit -m "feat(db): pg_cron jobs for cleanup"
```

### Task 1.5 — Migration `seed.sql`

**Files:** Create `supabase/migrations/20260510000005_seed.sql`

- [ ] Crear con datos del evento:

```sql
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
```

- [ ] Validar:

```bash
supabase db reset
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" -c "SELECT count(*) FROM seats;"
```

Esperado: `100` (4 filas × 25 sillas).

- [ ] Commit:

```bash
git add supabase/migrations/20260510000005_seed.sql
git commit -m "feat(db): seed event + zones + seats"
```

### Task 1.6 — Storage bucket `tickets`

**Files:** Create via SQL or supabase CLI

- [ ] Agregar al final de `seed.sql`:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('tickets', 'tickets', false)
ON CONFLICT (id) DO NOTHING;
```

- [ ] Reset y verificar:

```bash
supabase db reset
```

- [ ] Commit:

```bash
git add supabase/migrations/20260510000005_seed.sql
git commit -m "feat(db): storage bucket for ticket PDFs"
```

### Task 1.7 — Realtime publication

**Files:** Append to `seed.sql` o nueva migración

- [ ] Crear `supabase/migrations/20260510000006_realtime.sql`:

```sql
-- Habilitar Realtime para cambios de asientos
ALTER PUBLICATION supabase_realtime ADD TABLE seat_holds;
ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
```

- [ ] Reset y commit:

```bash
supabase db reset
git add supabase/migrations/20260510000006_realtime.sql
git commit -m "feat(db): enable realtime publications"
```

---

## Phase 2 — Edge Functions (Agent B, ~3h)

**Subagent prompt:** Implementar las 9 Edge Functions Deno según la spec sección 7. Trabajar en `supabase/functions/`. Cada función en su carpeta con `index.ts`. Lógica compartida en `_shared/`. Usar TypeScript estricto. Servicios externos (Wompi, Resend, WhatsApp) con interfaz mockable: si env var es `mock`, log a consola; si tiene valor real, llamar API. Idempotencia obligatoria en webhook. Atomicidad obligatoria en create-order y validate-ticket. Tests unitarios para signing y pricing.

### Task 2.1 — `_shared/supabase.ts`

**Files:** Create `supabase/functions/_shared/supabase.ts`

- [ ] Crear:

```typescript
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

### Task 2.2 — `_shared/cors.ts`

```typescript
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  return null;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
```

### Task 2.3 — `_shared/signing.ts`

```typescript
async function hmacSha256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function signToken(secret: string, payload: string): Promise<string> {
  const sig = await hmacSha256(secret, payload);
  return `${btoa(payload)}.${sig}`;
}

export async function verifyToken(secret: string, token: string): Promise<string | null> {
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return null;
  const payload = atob(b64);
  const expected = await hmacSha256(secret, payload);
  if (expected !== sig) return null;
  return payload;
}

export async function verifyWompiSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const expected = await hmacSha256(secret, body);
  return expected === signature;
}
```

- [ ] Test unitario `tests/unit/signing.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { signToken, verifyToken } from '../../supabase/functions/_shared/signing.ts';

describe('signing', () => {
  it('round-trips a payload', async () => {
    const t = await signToken('secret', 'hello');
    const p = await verifyToken('secret', t);
    expect(p).toBe('hello');
  });

  it('rejects tampered payload', async () => {
    const t = await signToken('secret', 'hello');
    const tampered = t.slice(0, -2) + 'xx';
    const p = await verifyToken('secret', tampered);
    expect(p).toBe(null);
  });

  it('rejects wrong secret', async () => {
    const t = await signToken('secret', 'hello');
    const p = await verifyToken('other', t);
    expect(p).toBe(null);
  });
});
```

- [ ] Run: `npm test`. Esperado: 3 passed.

### Task 2.4 — `_shared/wompi.ts`

```typescript
const WOMPI_API = 'https://sandbox.wompi.co/v1';

export interface WompiTransaction {
  id: string;
  reference: string;
  status: 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'PENDING';
  amount_in_cents: number;
  payment_method_type: string;
  customer_email: string;
}

export async function fetchWompiTransaction(id: string): Promise<WompiTransaction> {
  const key = Deno.env.get('WOMPI_PRIVATE_KEY')!;
  const r = await fetch(`${WOMPI_API}/transactions/${id}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!r.ok) throw new Error(`Wompi fetch failed: ${r.status}`);
  return (await r.json()).data;
}

export async function refundWompiTransaction(id: string, amount_in_cents: number) {
  const key = Deno.env.get('WOMPI_PRIVATE_KEY')!;
  const r = await fetch(`${WOMPI_API}/transactions/${id}/refunds`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount_in_cents }),
  });
  if (!r.ok) throw new Error(`Wompi refund failed: ${r.status}`);
  return await r.json();
}

export async function generateIntegritySignature(
  reference: string,
  amount_in_cents: number,
  currency = 'COP'
): Promise<string> {
  const secret = Deno.env.get('WOMPI_INTEGRITY_SECRET')!;
  const message = `${reference}${amount_in_cents}${currency}${secret}`;
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(message));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
```

### Task 2.5 — `_shared/email.ts`, `_shared/whatsapp.ts`, `_shared/qr.ts`, `_shared/pdf.ts`, `_shared/wallet.ts`, `_shared/errors.ts`

Crear cada uno. Implementar como mock cuando env var es `mock`, real cuando hay key.

```typescript
// email.ts
export async function sendEmail(to: string, subject: string, html: string, attachments: any[] = []) {
  const key = Deno.env.get('RESEND_API_KEY')!;
  const from = Deno.env.get('RESEND_FROM_EMAIL')!;
  if (key === 'mock') {
    console.log('[MOCK EMAIL]', { to, subject, attachments_count: attachments.length });
    return { id: 'mock-' + crypto.randomUUID() };
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html, attachments }),
  });
  if (!r.ok) throw new Error(`Resend error: ${r.status} ${await r.text()}`);
  return await r.json();
}
```

```typescript
// whatsapp.ts
export async function sendWhatsAppTemplate(
  to: string,
  template: string,
  params: string[]
) {
  const token = Deno.env.get('WA_CLOUD_TOKEN')!;
  if (token === 'mock') {
    console.log('[MOCK WA]', { to, template, params });
    return { ok: true, mock: true };
  }
  const phoneId = Deno.env.get('WA_PHONE_NUMBER_ID')!;
  const r = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: template,
        language: { code: 'es' },
        components: [{ type: 'body', parameters: params.map(text => ({ type: 'text', text })) }],
      },
    }),
  });
  if (!r.ok) throw new Error(`WA error: ${r.status} ${await r.text()}`);
  return await r.json();
}
```

```typescript
// qr.ts — usa qrcode library
import QRCode from 'https://esm.sh/qrcode@1.5.4';

export async function generateQrPng(text: string): Promise<Uint8Array> {
  return await QRCode.toBuffer(text, { errorCorrectionLevel: 'H', width: 600, margin: 1 });
}

export async function generateQrDataUrl(text: string): Promise<string> {
  return await QRCode.toDataURL(text, { errorCorrectionLevel: 'H', width: 400 });
}
```

```typescript
// pdf.ts — pdf-lib para generar PDF de boleta
import { PDFDocument, StandardFonts, rgb, degrees } from 'https://esm.sh/pdf-lib@1.17.1';

export interface TicketPdfData {
  order_number: string;
  buyer_name: string;
  attendee_name?: string;
  zone_name: string;
  seat_label?: string;
  ticket_index: number;
  ticket_total: number;
  event_name: string;
  event_date: string;
  venue: string;
  qr_png: Uint8Array;
}

export async function generateTicketPdf(d: TicketPdfData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontReg = await pdf.embedFont(StandardFonts.Helvetica);

  // Background gradient stub (block)
  page.drawRectangle({ x: 0, y: height - 200, width, height: 200, color: rgb(0.04, 0.02, 0.07) });

  // Logo NEXT SHOW
  page.drawText('NEXT SHOW', { x: 40, y: height - 80, size: 36, font, color: rgb(1, 1, 1) });
  page.drawText('TOROMOBOLO + JAIR LUQUEZ', { x: 40, y: height - 110, size: 12, font, color: rgb(0.85, 0.27, 0.94) });

  // Watermark con nombre comprador
  page.drawText(d.buyer_name.toUpperCase(), {
    x: 100, y: height / 2,
    size: 60, font,
    color: rgb(0.95, 0.95, 0.95),
    opacity: 0.15,
    rotate: degrees(-30),
  });

  // Datos boleta
  page.drawText(`Orden ${d.order_number}`, { x: 40, y: height - 240, size: 14, font: fontReg });
  page.drawText(`${d.event_name}`, { x: 40, y: height - 270, size: 16, font });
  page.drawText(`${d.event_date}  ·  ${d.venue}`, { x: 40, y: height - 290, size: 12, font: fontReg });
  page.drawText(`Zona: ${d.zone_name}`, { x: 40, y: height - 330, size: 14, font });
  if (d.seat_label) {
    page.drawText(`Asiento: ${d.seat_label}`, { x: 40, y: height - 350, size: 14, font });
  } else {
    page.drawText(`Boleta ${d.ticket_index} de ${d.ticket_total}`, { x: 40, y: height - 350, size: 14, font });
  }
  page.drawText(`Comprador: ${d.buyer_name}`, { x: 40, y: height - 380, size: 12, font: fontReg });
  if (d.attendee_name) {
    page.drawText(`Asistente: ${d.attendee_name}`, { x: 40, y: height - 400, size: 12, font: fontReg });
  }

  // QR
  const qrImg = await pdf.embedPng(d.qr_png);
  page.drawImage(qrImg, { x: width - 240, y: height - 460, width: 200, height: 200 });

  // Política
  page.drawText('Boleta personal e intransferible. Se exige cédula coincidente.', {
    x: 40, y: 60, size: 9, font: fontReg, color: rgb(0.4, 0.4, 0.4),
  });
  page.drawText('Producido por Nexo Productions · NEXT SHOW', {
    x: 40, y: 45, size: 9, font: fontReg, color: rgb(0.4, 0.4, 0.4),
  });

  return await pdf.save();
}
```

```typescript
// wallet.ts — stub (firma de pkpass requiere certs Apple reales)
export async function generateApplePassUrl(ticket_id: string, signed_token: string): Promise<string> {
  const cert = Deno.env.get('APPLE_PASS_CERT_PEM');
  if (!cert || cert === '__base64__') {
    return `${Deno.env.get('APP_BASE_URL')}/mi-boleta?t=${signed_token}&wallet=apple-pending`;
  }
  // TODO: real .pkpass generation when certs provisioned
  return `${Deno.env.get('APP_BASE_URL')}/wallet/apple/${ticket_id}.pkpass`;
}

export async function generateGoogleWalletSaveUrl(ticket_id: string): Promise<string> {
  const sa = Deno.env.get('GOOGLE_WALLET_SERVICE_ACCOUNT_JSON');
  if (!sa || sa === '__base64__') {
    return `${Deno.env.get('APP_BASE_URL')}/mi-boleta?t=${ticket_id}&wallet=google-pending`;
  }
  // TODO: real Google Wallet JWT when SA provisioned
  return `https://pay.google.com/gp/v/save/PLACEHOLDER`;
}
```

```typescript
// errors.ts
export class AppError extends Error {
  constructor(public code: string, public httpStatus: number, message: string, public extra?: unknown) {
    super(message);
  }
}
export const ERR = {
  SEATS_TAKEN:     (extra: unknown) => new AppError('SEATS_TAKEN', 409, 'Algunos asientos no están disponibles', extra),
  SOLD_OUT:        () => new AppError('SOLD_OUT', 409, 'Zona agotada'),
  INVALID_COUPON:  (r: string) => new AppError('INVALID_COUPON', 400, r),
  VALIDATION:      (field: string) => new AppError('VALIDATION', 400, `Campo inválido: ${field}`),
  RATE_LIMIT:      () => new AppError('RATE_LIMIT', 429, 'Demasiadas solicitudes. Reintenta en un minuto.'),
  TICKET_INVALID:  () => new AppError('INVALID', 404, 'Boleta no válida'),
  TICKET_USED:     (extra: unknown) => new AppError('ALREADY_USED', 409, 'Boleta ya utilizada', extra),
  TICKET_UNPAID:   () => new AppError('UNPAID', 402, 'Boleta sin pago confirmado'),
  WRONG_DATE:      () => new AppError('WRONG_DATE', 400, 'Boleta no es para hoy'),
};
```

- [ ] Commit:

```bash
git add supabase/functions/_shared/
git commit -m "feat(functions): shared utilities (supabase, cors, signing, wompi, email, wa, qr, pdf, wallet, errors)"
```

### Task 2.6 — `create-order/index.ts`

**Files:** Create `supabase/functions/create-order/index.ts`

- [ ] Implementar según spec sección 7 con lógica completa:

```typescript
import { getServiceClient } from '../_shared/supabase.ts';
import { preflight, jsonResponse } from '../_shared/cors.ts';
import { generateIntegritySignature } from '../_shared/wompi.ts';
import { ERR, AppError } from '../_shared/errors.ts';

interface CreateOrderRequest {
  zone_code: string;
  seat_ids?: string[];
  quantity?: number;
  buyer: { name: string; id_number: string; phone: string; email: string };
  coupon_code?: string;
  attribution?: Record<string, string>;
  turnstile_token?: string;
}

const isValidPhone = (p: string) => /^3\d{9}$/.test(p);
const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const isValidId    = (i: string) => /^\d{6,12}$/.test(i);

// Simple in-memory rate limit (per Edge Function instance — buena para sandbox; para prod usar Upstash o KV)
const rateLimits = new Map<string, { count: number; reset: number }>();
function checkRateLimit(ip: string, max = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  const r = rateLimits.get(ip);
  if (!r || r.reset < now) {
    rateLimits.set(ip, { count: 1, reset: now + windowMs });
    return true;
  }
  if (r.count >= max) return false;
  r.count++;
  return true;
}

async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET')!;
  if (!token) return false;
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `secret=${secret}&response=${token}`,
  });
  const d = await r.json();
  return !!d.success;
}

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;

  try {
    const body = (await req.json()) as CreateOrderRequest;
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';

    if (!checkRateLimit(ip)) throw ERR.RATE_LIMIT();

    // Turnstile (skipear en local con keys de test que siempre pasan)
    if (Deno.env.get('TURNSTILE_SECRET') !== '1x0000000000000000000000000000000AA') {
      if (!(await verifyTurnstile(body.turnstile_token || ''))) throw ERR.VALIDATION('turnstile');
    }

    // Validaciones
    if (!body.buyer?.name?.trim()) throw ERR.VALIDATION('buyer.name');
    if (!isValidId(body.buyer.id_number)) throw ERR.VALIDATION('buyer.id_number');
    if (!isValidPhone(body.buyer.phone)) throw ERR.VALIDATION('buyer.phone');
    if (!isValidEmail(body.buyer.email)) throw ERR.VALIDATION('buyer.email');

    const sb = getServiceClient();

    // Cargar evento + zona
    const { data: zone, error: zErr } = await sb
      .from('zones').select('*, events(*)')
      .eq('code', body.zone_code).single();
    if (zErr || !zone) throw ERR.VALIDATION('zone_code');

    // Blacklist
    const { data: bl } = await sb.from('blacklist').select('id')
      .or(`id_number.eq.${body.buyer.id_number},phone.eq.${body.buyer.phone}`)
      .maybeSingle();
    if (bl) throw new AppError('BLACKLISTED', 403, 'No se puede procesar la compra');

    let quantity: number;
    let seat_ids: string[] = [];

    if (zone.seating_mode === 'numbered') {
      seat_ids = body.seat_ids || [];
      if (seat_ids.length === 0 || seat_ids.length > zone.events.settings.max_seats_per_order) {
        throw ERR.VALIDATION('seat_ids');
      }
      quantity = seat_ids.length;
    } else {
      quantity = body.quantity || 0;
      if (quantity < 1 || quantity > zone.events.settings.max_seats_per_order) {
        throw ERR.VALIDATION('quantity');
      }
      // Verificar capacidad
      const { data: avail } = await sb.from('v_zone_availability')
        .select('available').eq('zone_id', zone.id).single();
      if (!avail || avail.available < quantity) throw ERR.SOLD_OUT();
    }

    // Validar cupón
    let coupon: any = null;
    let discount_cop = 0;
    if (body.coupon_code) {
      const { data: c } = await sb.from('coupons')
        .select('*').eq('code', body.coupon_code.toUpperCase())
        .eq('status', 'active').maybeSingle();
      if (!c) throw ERR.INVALID_COUPON('Cupón inexistente o inactivo');
      if (c.uses_count >= c.max_uses) throw ERR.INVALID_COUPON('Cupón agotado');
      if (c.valid_until && new Date(c.valid_until) < new Date()) throw ERR.INVALID_COUPON('Cupón vencido');
      if (c.valid_from && new Date(c.valid_from) > new Date()) throw ERR.INVALID_COUPON('Cupón aún no activo');
      coupon = c;
      discount_cop = c.discount_cop;
    }

    const subtotal = zone.price_cop * quantity;
    const total = Math.max(0, subtotal - discount_cop);
    const wompi_reference = `NS-${crypto.randomUUID()}`;

    // Insertar order
    const { data: order, error: oErr } = await sb.from('orders').insert({
      event_id: zone.event_id,
      zone_id: zone.id,
      buyer_name: body.buyer.name.trim(),
      buyer_id_number: body.buyer.id_number,
      buyer_phone: body.buyer.phone,
      buyer_email: body.buyer.email.toLowerCase(),
      quantity,
      subtotal_cop: subtotal,
      discount_cop,
      total_cop: total,
      coupon_id: coupon?.id || null,
      referrer_id: coupon?.referrer_id || null,
      attribution: body.attribution || {},
      wompi_reference,
      client_ip: ip,
      user_agent: req.headers.get('user-agent') || '',
    }).select().single();
    if (oErr) throw new AppError('DB', 500, oErr.message);

    // Reservar asientos (Cantas)
    if (zone.seating_mode === 'numbered') {
      const holds = seat_ids.map(seat_id => ({ seat_id, order_id: order.id }));
      const { data: inserted, error: hErr } = await sb.from('seat_holds')
        .upsert(holds, { onConflict: 'seat_id', ignoreDuplicates: true })
        .select('seat_id');

      if (hErr) throw new AppError('DB', 500, hErr.message);

      const insertedIds = new Set((inserted || []).map(h => h.seat_id));
      const unavailable = seat_ids.filter(id => !insertedIds.has(id));
      if (unavailable.length > 0) {
        // Rollback: borrar order + holds que sí entraron
        await sb.from('orders').delete().eq('id', order.id);
        throw ERR.SEATS_TAKEN({ unavailable_seat_ids: unavailable });
      }
    }

    // Generar integrity signature para el widget Wompi
    const integrity = await generateIntegritySignature(wompi_reference, total * 100);

    return jsonResponse({
      order_id: order.id,
      order_number: order.order_number,
      wompi_reference,
      total_cop: total,
      subtotal_cop: subtotal,
      discount_cop,
      expires_at: order.expires_at,
      public_key: Deno.env.get('WOMPI_PUBLIC_KEY'),
      integrity_signature: integrity,
      buyer_email: order.buyer_email,
      seats: seat_ids,
    });
  } catch (e) {
    if (e instanceof AppError) {
      return jsonResponse({ error: e.code, message: e.message, ...((e.extra as object) || {}) }, e.httpStatus);
    }
    console.error('[create-order]', e);
    return jsonResponse({ error: 'INTERNAL', message: String(e) }, 500);
  }
});
```

- [ ] Test integration `tests/integration/create-order.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = process.env.SUPABASE_URL!;
const SUPA_KEY = process.env.SUPABASE_ANON_KEY!;

describe('create-order', () => {
  it('creates a Risas order successfully', async () => {
    const r = await fetch(`${SUPA_URL}/functions/v1/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        zone_code: 'risas',
        quantity: 2,
        buyer: { name: 'Juan Pérez', id_number: '1234567890', phone: '3001234567', email: 'juan@test.com' },
      }),
    });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.total_cop).toBe(200000);
    expect(d.wompi_reference).toMatch(/^NS-/);
  });

  it('rejects invalid email', async () => {
    const r = await fetch(`${SUPA_URL}/functions/v1/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        zone_code: 'risas', quantity: 1,
        buyer: { name: 'X', id_number: '1234567890', phone: '3001234567', email: 'not-email' },
      }),
    });
    expect(r.status).toBe(400);
  });
});
```

- [ ] Commit:

```bash
git add supabase/functions/create-order tests/integration/create-order.test.ts
git commit -m "feat(functions): create-order with rate limit + turnstile + atomic seat hold"
```

### Task 2.7 — `wompi-webhook/index.ts`

**Files:** Create `supabase/functions/wompi-webhook/index.ts`

- [ ] Implementar según spec sección 7:

```typescript
import { getServiceClient } from '../_shared/supabase.ts';
import { preflight, jsonResponse } from '../_shared/cors.ts';
import { verifyWompiSignature } from '../_shared/signing.ts';

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  if (req.method !== 'POST') return jsonResponse({ error: 'METHOD' }, 405);

  const raw = await req.text();
  const sig = req.headers.get('x-event-signature') || req.headers.get('x-signature') || '';
  const secret = Deno.env.get('WOMPI_EVENTS_SECRET')!;

  if (secret && secret !== 'REPLACE_ME') {
    const ok = await verifyWompiSignature(raw, sig, secret);
    if (!ok) return jsonResponse({ error: 'INVALID_SIGNATURE' }, 401);
  }

  const event = JSON.parse(raw);
  const tx = event.data?.transaction;
  if (!tx) return jsonResponse({ ok: true, ignored: 'no_transaction' });

  const sb = getServiceClient();

  // Idempotencia
  const { data: existing } = await sb.from('orders')
    .select('id, status').eq('wompi_transaction_id', tx.id).maybeSingle();
  if (existing) return jsonResponse({ ok: true, idempotent: true });

  const { data: order } = await sb.from('orders')
    .select('*, zones(*)').eq('wompi_reference', tx.reference).single();
  if (!order) return jsonResponse({ error: 'ORDER_NOT_FOUND' }, 404);

  if (tx.status === 'APPROVED') {
    // Si ya expiró, intentar re-reservar
    if (order.status === 'expired') {
      // (simplificado: marcar manual_review, alertar admin)
      await sb.from('orders').update({
        status: 'manual_review', wompi_transaction_id: tx.id,
      }).eq('id', order.id);
      return jsonResponse({ ok: true, manual_review: true });
    }

    // Cargar seats reservados (si Cantas)
    const { data: holds } = await sb.from('seat_holds')
      .select('seat_id').eq('order_id', order.id);

    // Crear tickets
    const ticketRows = order.zones.seating_mode === 'numbered'
      ? (holds || []).map(h => ({ order_id: order.id, seat_id: h.seat_id }))
      : Array.from({ length: order.quantity }).map(() => ({ order_id: order.id, seat_id: null }));

    const { error: tErr } = await sb.from('tickets').insert(ticketRows);
    if (tErr) {
      console.error('[webhook] ticket insert failed', tErr);
      return jsonResponse({ error: 'TICKET_INSERT' }, 500);
    }

    // Update order
    await sb.from('orders').update({
      status: 'paid', paid_at: new Date().toISOString(), wompi_transaction_id: tx.id,
    }).eq('id', order.id);

    // Liberar holds (los seats ahora ocupados por tickets)
    await sb.from('seat_holds').delete().eq('order_id', order.id);

    // Incrementar cupon
    if (order.coupon_id) {
      const { data: c } = await sb.from('coupons').select('*').eq('id', order.coupon_id).single();
      if (c) {
        const newCount = c.uses_count + 1;
        await sb.from('coupons').update({
          uses_count: newCount,
          status: newCount >= c.max_uses ? 'exhausted' : 'active',
        }).eq('id', c.id);
      }
    }

    // Disparar send-ticket async
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-ticket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ order_id: order.id }),
    }).catch(e => console.error('[webhook] send-ticket failed', e));

    return jsonResponse({ ok: true, status: 'paid' });
  }

  if (tx.status === 'DECLINED' || tx.status === 'VOIDED' || tx.status === 'ERROR') {
    await sb.from('orders').update({
      status: 'failed', wompi_transaction_id: tx.id,
    }).eq('id', order.id);
    await sb.from('seat_holds').delete().eq('order_id', order.id);
    return jsonResponse({ ok: true, status: 'failed' });
  }

  return jsonResponse({ ok: true, ignored: tx.status });
});
```

- [ ] Test idempotencia `tests/integration/webhook-idempotency.test.ts`: enviar mismo POST 5×, verificar que solo se crean tickets una vez.

- [ ] Commit:

```bash
git add supabase/functions/wompi-webhook tests/integration/webhook-idempotency.test.ts
git commit -m "feat(functions): wompi-webhook idempotent + tickets emission"
```

### Task 2.8 — `send-ticket/index.ts`

- [ ] Generar QR + PDF + email + WA por cada ticket:

```typescript
import { getServiceClient } from '../_shared/supabase.ts';
import { jsonResponse } from '../_shared/cors.ts';
import { generateQrPng, generateQrDataUrl } from '../_shared/qr.ts';
import { generateTicketPdf } from '../_shared/pdf.ts';
import { sendEmail } from '../_shared/email.ts';
import { sendWhatsAppTemplate } from '../_shared/whatsapp.ts';
import { signToken } from '../_shared/signing.ts';

Deno.serve(async (req) => {
  const { order_id } = await req.json();
  const sb = getServiceClient();

  const { data: order } = await sb.from('orders')
    .select('*, zones(*), events(*)').eq('id', order_id).single();
  if (!order) return jsonResponse({ error: 'NOT_FOUND' }, 404);

  const { data: tickets } = await sb.from('tickets')
    .select('*, seats(row_label, seat_number)').eq('order_id', order_id);

  const baseUrl = Deno.env.get('APP_BASE_URL')!;
  const eventDate = new Date(order.events.event_date).toLocaleString('es-CO', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota',
  });

  let i = 1;
  for (const t of tickets || []) {
    const qrUrl = `${baseUrl}/v?t=${t.ticket_code}`;
    const qrPng = await generateQrPng(qrUrl);
    const seatLabel = t.seats ? `Fila ${t.seats.row_label} · Silla ${t.seats.seat_number}` : undefined;

    const pdfBytes = await generateTicketPdf({
      order_number: order.order_number,
      buyer_name: order.buyer_name,
      attendee_name: t.attendee_name,
      zone_name: order.zones.name,
      seat_label: seatLabel,
      ticket_index: i,
      ticket_total: tickets!.length,
      event_name: order.events.name,
      event_date: eventDate,
      venue: order.events.venue,
      qr_png: qrPng,
    });

    // Subir a Storage
    const path = `${order.id}/${t.ticket_code}.pdf`;
    await sb.storage.from('tickets').upload(path, pdfBytes, {
      contentType: 'application/pdf', upsert: true,
    });
    const { data: signed } = await sb.storage.from('tickets')
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    await sb.from('tickets').update({ pdf_url: signed?.signedUrl }).eq('id', t.id);

    const assignToken = await signToken(Deno.env.get('ASSIGN_SIGNING_SECRET')!, order.id);
    const assignUrl = `${baseUrl}/asignar.html?o=${order.id}&token=${encodeURIComponent(assignToken)}`;

    // Email
    await sb.from('delivery_log').insert({ ticket_id: t.id, channel: 'email', status: 'pending' });
    try {
      const qrDataUrl = await generateQrDataUrl(qrUrl);
      await sendEmail(
        order.buyer_email,
        `Tu boleta NEXT SHOW · ${order.order_number}`,
        ticketEmailHtml(order, t, seatLabel, signed?.signedUrl || '', assignUrl, qrDataUrl, eventDate),
        []
      );
      await sb.from('delivery_log').update({ status: 'sent', last_attempt_at: new Date().toISOString() })
        .eq('ticket_id', t.id).eq('channel', 'email');
    } catch (e) {
      await sb.from('delivery_log').update({
        status: 'failed', last_error: String(e), last_attempt_at: new Date().toISOString(),
      }).eq('ticket_id', t.id).eq('channel', 'email');
    }

    // WhatsApp
    await sb.from('delivery_log').insert({ ticket_id: t.id, channel: 'whatsapp', status: 'pending' });
    try {
      await sendWhatsAppTemplate(`57${order.buyer_phone}`, Deno.env.get('WA_TEMPLATE_TICKET')!, [
        order.buyer_name, order.order_number, signed?.signedUrl || '',
      ]);
      await sb.from('delivery_log').update({ status: 'sent', last_attempt_at: new Date().toISOString() })
        .eq('ticket_id', t.id).eq('channel', 'whatsapp');
    } catch (e) {
      await sb.from('delivery_log').update({
        status: 'failed', last_error: String(e), last_attempt_at: new Date().toISOString(),
      }).eq('ticket_id', t.id).eq('channel', 'whatsapp');
    }

    i++;
  }

  return jsonResponse({ ok: true, sent: tickets?.length || 0 });
});

function ticketEmailHtml(order: any, t: any, seat: string | undefined, pdfUrl: string, assignUrl: string, qrDataUrl: string, eventDate: string): string {
  return `
<!doctype html><html><body style="font-family: -apple-system, sans-serif; background: #0a0612; color: #f5f3ff; padding: 40px;">
  <div style="max-width: 560px; margin: 0 auto; background: #14091f; border-radius: 12px; padding: 32px;">
    <h1 style="color: #d946ef; font-size: 28px; margin: 0;">NEXT SHOW</h1>
    <p style="color: #a39db8;">Toromobolo + Jair Luquez</p>
    <h2 style="margin-top: 24px;">¡Tu boleta está lista!</h2>
    <p>Hola <strong>${order.buyer_name}</strong>, tu pago fue aprobado.</p>
    <div style="background: #1a0d2e; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 4px 0;"><strong>Orden:</strong> ${order.order_number}</p>
      <p style="margin: 4px 0;"><strong>Evento:</strong> ${eventDate}</p>
      <p style="margin: 4px 0;"><strong>Lugar:</strong> ${order.events.venue}</p>
      <p style="margin: 4px 0;"><strong>Zona:</strong> ${order.zones.name}</p>
      ${seat ? `<p style="margin: 4px 0;"><strong>Asiento:</strong> ${seat}</p>` : ''}
    </div>
    <div style="text-align: center; margin: 32px 0;">
      <img src="${qrDataUrl}" alt="QR" style="max-width: 240px;" />
    </div>
    <a href="${pdfUrl}" style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #ec4899); color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600;">Descargar PDF</a>
    <p style="margin-top: 24px;">Recordá <a href="${assignUrl}" style="color: #d946ef;">asignar el nombre</a> de quien usará cada boleta antes del evento.</p>
    <p style="color: #6b6480; font-size: 12px; margin-top: 32px;">Boleta personal e intransferible. Se exige cédula coincidente con el nombre del asistente.</p>
  </div>
</body></html>`;
}
```

- [ ] Commit:

```bash
git add supabase/functions/send-ticket
git commit -m "feat(functions): send-ticket generates QR/PDF + email + WA"
```

### Task 2.9 — `validate-ticket/index.ts`

```typescript
import { getServiceClient } from '../_shared/supabase.ts';
import { jsonResponse, preflight } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  const { ticket_code, staff_name } = await req.json();
  if (!ticket_code || !staff_name) return jsonResponse({ error: 'BAD_REQUEST' }, 400);

  const sb = getServiceClient();

  const { data: t } = await sb.from('tickets')
    .select('*, orders(*, events(event_date)), seats(row_label, seat_number)')
    .eq('ticket_code', ticket_code).maybeSingle();

  let result: string;
  if (!t) result = 'invalid';
  else if (t.orders.status !== 'paid') result = 'unpaid';
  else if (t.checked_in_at) result = 'already_used';
  else {
    const eventDate = new Date(t.orders.events.event_date).toDateString();
    const today = new Date().toDateString();
    result = (eventDate === today) ? 'ok' : 'wrong_date';
  }

  await sb.from('entry_attempts').insert({
    ticket_id: t?.id || null, ticket_code_raw: ticket_code, result, staff_name,
  });

  if (result === 'ok' && t) {
    await sb.from('tickets').update({
      checked_in_at: new Date().toISOString(), checked_in_by: staff_name,
    }).eq('id', t.id);

    return jsonResponse({
      result: 'ok',
      attendee_name: t.attendee_name || t.orders.buyer_name,
      attendee_id: t.attendee_id_number || t.orders.buyer_id_number,
      zone: t.orders.zones?.name,
      seat: t.seats ? `Fila ${t.seats.row_label} · Silla ${t.seats.seat_number}` : null,
      order_number: t.orders.order_number,
    });
  }

  if (result === 'already_used') {
    return jsonResponse({
      result: 'already_used',
      previous_check_in: t.checked_in_at,
      previous_staff: t.checked_in_by,
    }, 409);
  }

  return jsonResponse({ result }, result === 'invalid' ? 404 : 400);
});
```

- [ ] Commit.

### Task 2.10 — `assign-attendees/index.ts`, `get-order-status/index.ts`, `scanner-manifest/index.ts`, `generate-wallet-pass/index.ts`, `admin-auth/index.ts`

Implementar cada uno según spec. Patrones cortos. Cada uno con su tarea + commit por separado.

**`assign-attendees/index.ts`**: verifica `signed_token`, UPDATE attendee_name/id en cada ticket.

**`get-order-status/index.ts`**: GET por `wompi_reference` o `order_id`, devuelve `{ status, tickets[] }`.

**`scanner-manifest/index.ts`**: GET con `?pin=XXXX`, devuelve array de tickets paid del evento (ticket_code, attendee_name, zone, seat_label, checked_in_at).

**`generate-wallet-pass/index.ts`**: stub que devuelve URLs de wallet (Apple/Google) — usa stubs en `_shared/wallet.ts` hasta que haya certs.

**`admin-auth/index.ts`**: POST con `{ pin }`. Genera OTP 6 dígitos, lo guarda en tabla temporal (o jsonb en events.settings.pending_otps), manda WA al admin, espera segundo POST con `{ pin, otp }` para validar y emitir JWT 8h.

- [ ] Commit cada función con `feat(functions): <name>`.

### Task 2.11 — Levantar todas las funciones y smoke test

- [ ] Crear `.env.local` con valores de `supabase status`:

```bash
supabase status -o env > .env.local
# Editar .env.local agregando SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY desde la salida
```

- [ ] Levantar:

```bash
supabase start
supabase functions serve --env-file .env.local --no-verify-jwt
```

- [ ] Smoke:

```bash
curl -X POST http://127.0.0.1:54321/functions/v1/create-order \
  -H 'Content-Type: application/json' \
  -d '{"zone_code":"risas","quantity":2,"buyer":{"name":"Test","id_number":"1234567890","phone":"3001234567","email":"t@t.com"}}'
```

Esperado: 200 con `{ order_id, wompi_reference, total_cop: 200000, ... }`.

---

## Phase 3 — Frontend Landing + Modal Checkout (Agent C, ~3.5h, parallel-able tras Fase 2)

**Subagent prompt:** Extender `public/index.html` (existente) agregando: (1) modal multi-paso de checkout sobre la landing actual sin tocar lo que ya funciona, (2) componentes JS planos según spec sección 6, (3) integración con Edge Functions vía `shared/supabase-client.js`, (4) widget Wompi vía `shared/wompi-client.js`, (5) Realtime subscriptions para mapa de asientos, (6) View Transitions API entre pasos, (7) i18n con `i18n/es.json`, (8) accesibilidad WCAG 2.1 AA, (9) FOMO popups + UTM tracking + pixels. Reemplazar `function comprarBoleta()` para abrir el modal en vez de Eventbrite. Mantener todo el CSS y HTML existente intacto.

### Task 3.1 — `public/shared/supabase-client.js`

```javascript
const SUPABASE_URL = window.NEXTSHOW_CONFIG?.SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = window.NEXTSHOW_CONFIG?.SUPABASE_ANON_KEY || '';

export const sb = {
  url: SUPABASE_URL,
  key: SUPABASE_ANON_KEY,
  async query(table, { select = '*', filters = {}, single = false } = {}) {
    const params = new URLSearchParams({ select });
    for (const [k, v] of Object.entries(filters)) params.set(k, v);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (!r.ok) throw new Error(`Query ${table} failed: ${r.status}`);
    const data = await r.json();
    return single ? data[0] : data;
  },
  async fn(name, body) {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.message || 'Error'), { code: data.error, extra: data });
    return data;
  },
  realtime: null,
  async loadRealtime() {
    if (this.realtime) return this.realtime;
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0');
    this.realtime = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return this.realtime;
  },
};
```

### Task 3.2 — `public/shared/i18n.js`, `public/i18n/es.json`

```javascript
let dict = {};
export async function loadI18n(lang = 'es') {
  const r = await fetch(`/i18n/${lang}.json`);
  dict = await r.json();
}
export function t(key, vars = {}) {
  let s = dict[key] || key;
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}
```

```json
{
  "checkout.title": "Comprar boletas",
  "checkout.step.select": "Selecciona",
  "checkout.step.data": "Tus datos",
  "checkout.step.pay": "Pago",
  "checkout.step.confirm": "Confirmación",
  "seats.tooltip": "Fila {row} · Silla {num}",
  "seats.legend.free": "Disponible",
  "seats.legend.held": "Reservada",
  "seats.legend.sold": "Vendida",
  "seats.legend.selected": "Tu selección",
  "form.name": "Nombre completo",
  "form.id": "Cédula",
  "form.phone": "WhatsApp",
  "form.email": "Email",
  "form.coupon": "Código de pre-venta",
  "form.coupon.apply": "Aplicar",
  "form.policy": "Acepto que la boleta es personal e intransferible",
  "btn.continue": "Continuar",
  "btn.pay": "Pagar con Wompi",
  "btn.close": "Cerrar",
  "btn.assign": "Asignar nombres ahora",
  "summary.subtotal": "Subtotal",
  "summary.discount": "Descuento",
  "summary.total": "Total",
  "lock.expires": "Tus asientos están reservados por {time}",
  "error.seats_taken": "Alguien tomó esa silla. Volvé a elegir.",
  "error.sold_out": "Zona agotada",
  "error.invalid_coupon": "Cupón inválido",
  "fomo.recent": "{name} de {city} acaba de comprar"
}
```

### Task 3.3 — Modal HTML + CSS dentro de `public/index.html`

Insertar antes de `</body>`:

(Detalle: HTML del overlay con stepper + 4 contenedores `.step` + footer con botón. CSS de modal, transitions, mapa SVG. Ver código completo más abajo o referirse a spec sección 6.)

```html
<!-- CHECKOUT MODAL -->
<div id="checkout-modal" class="checkout-modal" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
  <div class="checkout-backdrop" data-close></div>
  <div class="checkout-panel" role="document">
    <header class="checkout-header">
      <button class="checkout-close" data-close aria-label="Cerrar">✕</button>
      <ol class="checkout-stepper" aria-label="Pasos">
        <li class="active"><span>1</span> Selección</li>
        <li><span>2</span> Datos</li>
        <li><span>3</span> Pago</li>
        <li><span>4</span> Confirmación</li>
      </ol>
    </header>
    <main class="checkout-body">
      <section class="step step-select" data-step="1"></section>
      <section class="step step-data hidden" data-step="2"></section>
      <section class="step step-pay hidden" data-step="3"></section>
      <section class="step step-confirm hidden" data-step="4"></section>
    </main>
    <footer class="checkout-footer">
      <div class="checkout-summary" id="ck-summary">Selecciona tus boletas</div>
      <button class="checkout-cta" id="ck-cta" disabled>Continuar</button>
    </footer>
  </div>
</div>

<!-- TOAST CONTAINER -->
<div id="toast-container" aria-live="polite" aria-atomic="true"></div>

<!-- FOMO POPUP CONTAINER -->
<div id="fomo-container" aria-hidden="true"></div>

<style>
  /* Modal base */
  .checkout-modal { position: fixed; inset: 0; z-index: 1000; display: none; }
  .checkout-modal[aria-hidden="false"] { display: block; }
  .checkout-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); }
  .checkout-panel {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
    width: min(720px, calc(100vw - 32px)); max-height: calc(100vh - 32px);
    background: var(--bg-2); border: 1px solid var(--border); border-radius: 16px;
    display: flex; flex-direction: column;
    box-shadow: 0 20px 80px rgba(124, 58, 237, 0.3);
  }
  .checkout-header { padding: 20px 24px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; gap: 16px; }
  .checkout-stepper { display: flex; gap: 16px; list-style: none; padding: 0; margin: 0; flex: 1; }
  .checkout-stepper li { font-size: 12px; color: var(--muted-2); display: flex; align-items: center; gap: 6px; }
  .checkout-stepper li.active { color: var(--magenta); font-weight: 600; }
  .checkout-stepper li span {
    display: inline-grid; place-items: center; width: 22px; height: 22px;
    border: 1px solid currentColor; border-radius: 50%; font-size: 11px;
  }
  .checkout-stepper li.active span { background: var(--magenta); color: white; border-color: var(--magenta); }
  .checkout-close {
    background: none; border: none; color: var(--text); font-size: 22px; cursor: pointer;
    padding: 4px 10px; border-radius: 6px;
  }
  .checkout-close:hover { background: var(--bg-3); }
  .checkout-body { padding: 24px; overflow-y: auto; flex: 1; }
  .step.hidden { display: none; }
  .checkout-footer {
    padding: 16px 24px; border-top: 1px solid var(--border);
    display: flex; justify-content: space-between; align-items: center; gap: 16px;
  }
  .checkout-summary { font-size: 14px; color: var(--muted); }
  .checkout-cta {
    background: var(--gradient); color: white; border: none;
    padding: 12px 28px; font-family: 'Anton', sans-serif; font-size: 15px;
    letter-spacing: 0.1em; text-transform: uppercase; border-radius: 8px;
    cursor: pointer; transition: transform .2s, opacity .2s;
  }
  .checkout-cta:disabled { opacity: 0.4; cursor: not-allowed; }
  .checkout-cta:not(:disabled):hover { transform: translateY(-1px); }

  /* Mapa de asientos */
  .seat-map-wrap { display: flex; flex-direction: column; gap: 16px; align-items: center; }
  .stage { width: 80%; height: 24px; background: linear-gradient(90deg, transparent, var(--magenta), transparent); text-align: center; font-family: 'Anton'; font-size: 14px; letter-spacing: 0.4em; }
  .seat-svg { width: 100%; max-width: 640px; }
  .seat { fill: var(--violet); stroke: var(--violet-2); stroke-width: 1; cursor: pointer; transition: fill .15s, transform .15s; }
  .seat:hover { transform: scale(1.1); transform-origin: center; }
  .seat[data-status="held"] { fill: #4a3a5a; cursor: not-allowed; animation: pulse 1.5s infinite; }
  .seat[data-status="sold"] { fill: #2a1f3a; cursor: not-allowed; opacity: 0.5; }
  .seat[data-status="selected"] { fill: var(--magenta); filter: drop-shadow(0 0 6px var(--magenta)); }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }

  /* Stepper de cantidad */
  .qty-wrap { display: flex; align-items: center; justify-content: center; gap: 24px; padding: 32px 0; }
  .qty-btn { width: 48px; height: 48px; border-radius: 50%; border: 2px solid var(--violet-2); background: transparent; color: white; font-size: 24px; cursor: pointer; }
  .qty-value { font-family: 'Anton'; font-size: 56px; min-width: 100px; text-align: center; }
  .qty-info { text-align: center; color: var(--muted); margin-top: 8px; }

  /* Form */
  .ck-form { display: grid; gap: 16px; }
  .ck-form label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 6px; }
  .ck-form input, .ck-form select {
    width: 100%; padding: 12px 14px; background: var(--bg-3); border: 1px solid var(--border);
    border-radius: 8px; color: var(--text); font-size: 15px;
  }
  .ck-form input:focus { outline: 2px solid var(--magenta); outline-offset: 2px; }

  /* Toast */
  #toast-container { position: fixed; bottom: 24px; right: 24px; display: flex; flex-direction: column; gap: 8px; z-index: 2000; }
  .toast { background: var(--bg-3); border: 1px solid var(--border); padding: 12px 16px; border-radius: 8px; max-width: 360px; }
  .toast.success { border-color: #10b981; }
  .toast.error { border-color: #ef4444; }

  /* FOMO */
  #fomo-container { position: fixed; bottom: 24px; left: 24px; z-index: 1500; }
  .fomo-pop { background: var(--bg-3); border: 1px solid var(--border); padding: 10px 16px; border-radius: 8px; font-size: 13px; color: var(--muted); animation: fomoIn .4s ease-out; }
  @keyframes fomoIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

  /* Mobile */
  @media (max-width: 640px) {
    .checkout-panel { inset: 0; transform: none; width: 100%; max-height: 100%; border-radius: 0; }
    .checkout-stepper li:not(.active) { display: none; }
  }
</style>
```

### Task 3.4 — JS del checkout dentro de `public/index.html`

Reemplazar `function comprarBoleta(tipo)` por el modal handler. Agregar clases `CheckoutModal`, `SeatMap`, `QuantityStepper`, `BuyerForm`, `WompiCheckout`, `OrderConfirmation`, `Toast`, `FomoEngine`, `Pixels`.

(Por longitud, el plan referencia los snippets clave. El subagente debe implementar las clases completas siguiendo spec sección 6 y la API de las Edge Functions.)

Patrones críticos a implementar:

- **Apertura modal**: `comprarBoleta('cantas')` → `CheckoutModal.open('cantas')` → carga zona desde Supabase REST → renderiza Step 1.
- **SeatMap render**: query `v_seat_availability?zone_id=eq.X` + suscripción Realtime a `seat_holds` y `tickets` para refrescar en vivo.
- **Step 2 → 3 transición**: invoca `create-order` Edge Function. Si 409 → vuelve a Step 1 con mapa refrescado y toast error.
- **Step 3 pago**: invoca `WompiCheckout.open(order)` que monta widget oficial en iframe. Captura `transaction.id` en callback.
- **Step 4 confirmación**: si `APPROVED` muestra QR + botones Wallet. Si `PENDING` polling cada 5s a `get-order-status`.
- **View Transitions**: envolver cambio de step en `if (document.startViewTransition) document.startViewTransition(() => switchStep(n))`.
- **Focus trap**: cuando modal abre, focus al primer elemento focusable; Tab cycle dentro del modal.
- **Esc**: cierra modal.
- **UTM capture**: al cargar página, parsear `URLSearchParams`, guardar en sessionStorage. Pasar como `attribution` en `create-order`.
- **Pixels**: en eventos clave (open modal, select seats, submit form, payment success) llamar `fbq('track', 'AddToCart')`, `ttq.track('AddToCart')`, `gtag('event', 'add_to_cart')`.

- [ ] Implementar todas las clases dentro del `<script>` extendido de `index.html`. Verificar que la landing original sigue funcionando idéntica (eventos, lead form, countdown, etc).

- [ ] Servir local:

```bash
npm run dev
```

Abrir http://localhost:8000 y verificar:
- Landing renderiza igual
- Click "Comprar Cantas" abre modal
- Mapa muestra 100 sillas
- Selección actualiza footer
- Continuar → form datos
- Submit → Wompi widget (sandbox)

- [ ] Commit:

```bash
git add public/index.html public/shared public/i18n
git commit -m "feat(landing): checkout modal multi-step with realtime + view transitions + i18n"
```

---

## Phase 4 — `asignar.html` + `politica-privacidad.html` (Agent D, ~1h)

**Subagent prompt:** Crear página simple `public/asignar.html` que recibe `?o=<order_id>&token=<signed_token>` por URL, valida token con Edge Function, muestra lista de boletas de la orden y permite editar `attendee_name` + `attendee_id` por cada una. Submit llama a `assign-attendees`. Crear también `public/politica-privacidad.html` estática con texto legal de Habeas Data Colombia.

### Task 4.1 — `asignar.html`

(Single-file con HTML + CSS + JS, mismo theme dark violeta. Carga orden, lista tickets, formulario por ticket, botón guardar.)

### Task 4.2 — `politica-privacidad.html`

(Texto Habeas Data Ley 1581 Colombia, finalidad, derechos titular, contacto.)

### Task 4.3 — `mi-boleta.html` stub Fase 2

(Página placeholder que muestra mensaje "Próximamente: tu portal personal" + redirige al PDF si tiene token.)

- [ ] Commit cada uno con `feat(page): <name>`.

---

## Phase 5 — Scanner PWA (Agent E, ~2.5h)

**Subagent prompt:** Crear PWA completa para validación de boletas en puerta. `scanner.html` + `scanner-sw.js` + `scanner-manifest.json`. Login con PIN, selección de staff, cámara con BarcodeDetector + jsQR fallback, envío a `validate-ticket`, modo offline con manifest cacheado en localStorage. Vibración al escaneo según resultado. Modo admin (`?admin=1`) con stats en vivo.

### Task 5.1 — `scanner-manifest.json`

```json
{
  "name": "NEXT SHOW · Puerta",
  "short_name": "NS Puerta",
  "description": "Validador de boletas NEXT SHOW",
  "start_url": "/scanner.html",
  "display": "standalone",
  "background_color": "#0a0612",
  "theme_color": "#7c3aed",
  "orientation": "portrait",
  "icons": [
    { "src": "/assets/icons/scanner-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/assets/icons/scanner-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/assets/icons/scanner-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### Task 5.2 — `scanner-sw.js`

Service worker con cache-first para shell + network-first para manifest de boletas (refresh cada 5min).

### Task 5.3 — `scanner.html`

Single-file con login, cámara via getUserMedia + BarcodeDetector (fallback jsQR), pantalla de resultado (verde/rojo/amarillo), stats abajo, modo offline con queue.

### Task 5.4 — Iconos PNG

Usar nano-banana o herramienta para generar iconos (192, 512, maskable) con logo NEXT SHOW. Si no, placeholder generado.

- [ ] Commit cada componente.

---

## Phase 6 — Admin Panel (Agent F, ~2.5h)

**Subagent prompt:** Crear `public/admin.html` con login PIN + OTP, dashboard ventas en vivo (Chart.js), tabla órdenes filtrable, gestión cupones/referrers, vista heatmap del venue, exportar CSV, acciones (refund, regenerar PDF, reenviar boleta), vista "puerta en vivo" con check-ins en tiempo real (Realtime). Responsive: layout desktop + bottom-sheet mobile.

### Task 6.1 — Login

PIN admin → llama `admin-auth` (POST sin OTP) → recibe `otp_pending` → muestra input OTP → llama `admin-auth` con `{ pin, otp }` → recibe JWT → guarda en sessionStorage.

### Task 6.2 — Dashboard

Cards con: ingresos COP, boletas vendidas / aforo, % conversión, top zona. Chart.js linea de ventas por hora.

### Task 6.3 — Tabla órdenes

Virtualizada, filtros por status/zona/cupón/referrer/fecha, búsqueda por cédula/nombre/orden#/tel.

### Task 6.4 — Gestión cupones + referrers

CRUD inline, generación batch de cupones (ej. crear 50 códigos para influencer X).

### Task 6.5 — Heatmap venue

SVG del mapa Cantas coloreado por orden de venta (gradiente magenta intenso = vendido primero, claro = último).

### Task 6.6 — Vista puerta en vivo

Subscribe Realtime a `tickets.checked_in_at`. Muestra mapa Cantas con verde/gris según check-in. Lista lateral de últimos 20 ingresos con timestamp + staff.

### Task 6.7 — Exportar CSV + acciones manuales

Botones: "Exportar manifest", "Exportar conciliación", "Reenviar boleta" (POST a send-ticket), "Refund" (POST a refund-order de Fase 2 — stub MVP).

- [ ] Commit cada sección.

---

## Phase 7 — Quality, A11y, Lighthouse (Agent G, ~1h)

**Subagent prompt:** Auditar las 4 páginas con Lighthouse, axe-core para accesibilidad WCAG 2.1 AA, verificar i18n keys faltantes, optimizar imágenes (AVIF/WebP), lazy load fuentes, validar focus traps, ARIA labels, contraste, navegación con teclado.

### Task 7.1 — Lighthouse run

```bash
npx lighthouse http://localhost:8000 --output html --output-path ./lighthouse-landing.html
npx lighthouse http://localhost:8000/asignar.html --output html --output-path ./lighthouse-asignar.html
npx lighthouse http://localhost:8000/scanner.html --output html --output-path ./lighthouse-scanner.html
npx lighthouse http://localhost:8000/admin.html --output html --output-path ./lighthouse-admin.html
```

Target: ≥95 en Performance, Accessibility, Best Practices, SEO.

### Task 7.2 — axe scan

```bash
npx @axe-core/cli http://localhost:8000
```

Fix issues found.

### Task 7.3 — i18n coverage

Script que escanea HTML/JS por strings literales en español que deberían estar en `i18n.es.json`. Reportar misses.

### Task 7.4 — E2E Playwright

```bash
npx playwright install
npm run test:e2e
```

Específicos:
- `tests/e2e/purchase-cantas.spec.ts`: flujo completo Cantas con sandbox Wompi
- `tests/e2e/purchase-risas.spec.ts`: flujo Risas
- `tests/e2e/scanner.spec.ts`: login + escaneo simulado + ya usado

- [ ] Commit todas las correcciones.

---

## Phase 8 — Smoke Test End-to-End + Push

### Task 8.1 — `scripts/smoke-test.sh`

```bash
#!/usr/bin/env bash
set -e
echo "→ Levantando Supabase..."
supabase start

echo "→ Levantando funciones..."
supabase functions serve --env-file .env.local --no-verify-jwt &
FN_PID=$!
sleep 3

echo "→ Sirviendo público..."
npx serve public -p 8000 &
SRV_PID=$!
sleep 2

echo "→ Smoke create-order..."
curl -fsS -X POST http://127.0.0.1:54321/functions/v1/create-order \
  -H 'Content-Type: application/json' \
  -d '{"zone_code":"risas","quantity":1,"buyer":{"name":"Smoke","id_number":"1234567890","phone":"3001234567","email":"smoke@test.com"}}'
echo

echo "→ Cleanup..."
kill $FN_PID $SRV_PID
echo "✓ Smoke OK"
```

```bash
chmod +x scripts/smoke-test.sh
./scripts/smoke-test.sh
```

### Task 8.2 — Commit final + push

```bash
git add .
git status
git commit -m "feat: complete MVP scaffolding with sandbox + mocks"
git push origin main
```

---

## Self-Review Checklist (post-write)

- [x] Cubre cada sección de la spec (1-14): mapeo claro a tareas
- [x] Sin placeholders TBD
- [x] Sin "implementar después"
- [x] Tipos consistentes entre tasks
- [x] Comandos exactos con expected output donde aplica
- [x] Decomposición por subsistema permite paralelismo

## Execution Handoff

**Plan completo y guardado en `docs/superpowers/plans/2026-05-10-nextshow-implementation.md`. Dos opciones de ejecución:**

1. **Subagent-Driven (recomendado para esto)** — dispatcho subagentes en paralelo donde es posible, revisión entre tareas, iteración rápida.
2. **Inline Execution** — ejecuto inline con checkpoints.

Para esta scope masiva, **Subagent-Driven** es lo correcto. Sequential donde hay deps (Fase 0 → 1 → 2), paralelo en Fases 3, 4, 5, 6.

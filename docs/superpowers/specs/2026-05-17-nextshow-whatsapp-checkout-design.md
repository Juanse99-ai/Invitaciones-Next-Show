# NEXT SHOW · WhatsApp-native Checkout & Access Control — Design

**Date:** 2026-05-17
**Status:** Approved (brainstorming session)
**Supersedes:** `2026-05-10-nextshow-checkout-design.md` (web-checkout-first model)
**Event:** NEXT SHOW · Toromobolo Welc'h + Jair Luquez · Sabanalarga · 2026-08-15 · 300 cupos base

---

## 1. Context & motivation

Audience for this event is reachable primarily via WhatsApp. They will not navigate a multi-step web checkout. Existing web checkout (`CheckoutModal`, `SeatMap`, `QuantityStepper`, `BuyerForm`) is unusable for this segment.

**Goal:** end-to-end reservation in ≤ 3 minutes, entirely inside WhatsApp, with payment via Wompi link rendered in chat.

**Survival of existing build:**

- Keep: DB schema (orders, tickets, seats), edge functions (`create-order`, `wompi-webhook`, `send-ticket`, `get-order-status`, `validate-ticket`, `assign-attendees`, `admin-auth`), scanner PWA, admin panel, `asignar.html`, `mi-boleta.html`, `politica-privacidad.html`.
- Remove from production load: web checkout modal JS (`CheckoutModal`, `SeatMap`, etc.) and English i18n. Files stay in repo history; landing stops loading them.
- Replace: landing CTA → single button "Comprar por WhatsApp" → `wa.me/57XXXXXXXXXX?text=Hola` with UTM preservation.

## 2. Architecture overview

```
Cliente WA → Meta Cloud API → whatsapp-webhook (edge fn)
                                  ↓
                          wa_conversations (state)
                                  ↓
                              [router]
                                  ↓
                  ┌───────────────┼────────────────┐
                  ↓               ↓                ↓
            create-order    operator-handoff   get-order-status
                  ↓               ↓                ↓
              Wompi link     Staff WA notif    QR re-send
                  ↓
            Wompi webhook → send-ticket → WA + email QR
```

**New components:**

- `supabase/functions/whatsapp-webhook/` — Meta Cloud API webhook receiver, signature verify, state machine router.
- `supabase/functions/wa-send/` — Outbound helper called by other functions to enqueue WA messages (wraps Meta API + outbox + retry).
- `supabase/functions/operator-handoff/` — Notifies staff WA when group flow triggers.
- `supabase/functions/cantas-cross-sell/` — Invoked by pg_cron at T-15 days; flips CANTAS active flag and enqueues upsell templates for RISAS buyers.
- DB migration adding `zones`, `wa_conversations`, `wa_outbox`, and columns on `orders` / `tickets`.

**Reused unchanged:**

- `create-order` (atomic seat hold, 15-min expiry — already implemented)
- `wompi-webhook` (idempotent payment confirmation)
- `send-ticket` (QR + PDF generation) — extended to use `wa-send` as primary channel, email as backup
- `get-order-status` (recovery flow)
- `validate-ticket` (scanner)
- Scanner PWA (no changes)
- Admin panel (extended with group-handoff inbox)

## 3. Zones, pricing, oversell

| Zone | Price | Availability | Seat selection | Oversell |
|------|-------|--------------|----------------|----------|
| **RISAS** (general) | $75.000 | Always | None (general admission) | +50 over 300 cap → 350 hard cap |
| **RISAS** volume (≥6 boletas) | $70.000 c/u | Always | None | Shares 350 cap with RISAS |
| **CANTAS** (preferencial) | $100.000 ($75k + $25k) | From T-15 days onward | Exact seat via `/asignar.html` map link (v1) | None — each seat is unique |

**Pricing function:**

```sql
create function calc_price(p_zone text, p_qty int) returns int as $$
  select case
    when p_zone = 'RISAS' and p_qty >= 6 then 7000000 * p_qty
    else (select price_cents from zones where code = p_zone) * p_qty
  end
$$ language sql immutable;
```

**Oversell guard** (extends `create-order`): for RISAS, validate `count_paid + count_holding < 350`. For CANTAS, validate per-seat uniqueness (existing seat-hold logic).

**CANTAS unlock:** `pg_cron` job at T-15 days fires `cantas-cross-sell`:
1. `update zones set active=true where code='CANTAS'`
2. Query `orders` where `zone_code='RISAS' and status='paid' and cantas_upsell_sent_at is null`
3. For each, enqueue WA template message via `wa_outbox`

**Cross-sell flow** transitions buyer to `cantas_upsell` state, asks seat preference (link to seat map page), generates Wompi link for diff ($25k × N), on payment converts to CANTAS reservation linked to original order via `cantas_upsell_order_id`.

## 4. Conversation state machine

**Table `wa_conversations`** (primary key: phone in E.164 format):

```
phone           text primary key       -- '+57301...'
state           text not null          -- current state
context         jsonb not null         -- {zone, qty, name, cedula, email, order_id, ...}
last_msg_at     timestamptz
locked_until    timestamptz nullable   -- rate limit
attribution     jsonb                  -- UTM from wa.me ?text=
fallback_count  int default 0
```

**States:**

```
idle
  → greet
  → zone_select          (RISAS only, or RISAS+CANTAS if T-15)
  → quantity             (buttons 1-5 + "+")
  ├─ group_handoff       (≥6 → notifies staff, ends bot flow for this conv)
  → buyer_name
  → buyer_cedula
  → email_opt            ("saltar" allowed)
  → confirm              (summary + PAGAR button)
  → payment_pending      (Wompi link sent, hold 15 min)
  ├─ paid                (Wompi webhook → send-ticket)
  ├─ expired             (15 min no payment → release hold, expiry msg)
  └─ paid → cantas_upsell (T-15 cross-sell branch)

# Transversal states (reachable from any state):
  recover_qr             ("mi boleta" / "QR" / "se me borró")
  help                   ("ayuda" / "humano" → handoff)
  fallback               (3 consecutive unrecognized → handoff)
  human_takeover         (staff replied manually from WA Business app;
                          bot ignores all inbound for this phone until admin reset)
```

**Transitions:**

- Any state + "menu" / "inicio" → reset to `greet` (context preserved for 7 days).
- `payment_pending` + new message → re-send Wompi link (do not create new order).
- `paid` + new message → route to `recover_qr`, info, or `asignar.html` link.
- 30 min idle → state reverts to `idle`, context retained 7 days then purged.

**Anti-abuse:**

- Phone with `payment_pending` order → reject new purchase, re-send existing link.
- Cédula with `paid` RISAS order → cross-sell CANTAS allowed, duplicate RISAS rejected (anti-resell).
- Rate limit: max 5 `greet` per hour per phone (enforced via `locked_until`).

## 5. Data model changes

**Migration `2026-05-17_whatsapp_checkout.sql`:**

```sql
-- 1. Zones
create table zones (
  code        text primary key,
  name        text not null,
  price_cents int not null,
  has_seats   boolean not null,
  capacity    int not null,
  oversell    int not null default 0,
  unlock_at   timestamptz,
  active      boolean default true
);
insert into zones (code, name, price_cents, has_seats, capacity, oversell, active) values
  ('RISAS',  'Localidad RISAS · General',     7500000, false, 300, 50, true),
  ('CANTAS', 'Localidad CANTAS · Preferencial', 10000000, true,  400, 0, false);
-- Prices in centavos COP (Wompi convention): 7500000 = $75.000, 7000000 = $70.000, 10000000 = $100.000.

-- 2. Tickets gain zone reference
alter table tickets add column zone_code text references zones(code);
update tickets set zone_code='RISAS' where zone_code is null;
alter table tickets alter column zone_code set not null;

-- 3. WhatsApp conversations
create table wa_conversations (
  phone           text primary key,
  state           text not null default 'idle',
  context         jsonb not null default '{}',
  last_msg_at     timestamptz not null default now(),
  locked_until    timestamptz,
  attribution     jsonb,
  fallback_count  int default 0
);
create index on wa_conversations(last_msg_at);

-- 4. Outbox (idempotency + retry)
create table wa_outbox (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  template    text,
  payload     jsonb not null,
  status      text not null default 'pending',  -- pending|sent|failed
  meta_msg_id text,
  attempts    int default 0,
  last_error  text,
  created_at  timestamptz default now(),
  sent_at     timestamptz
);
create index on wa_outbox(status, created_at) where status='pending';

-- 5. Orders extensions
alter table orders add column wa_phone   text;
alter table orders add column zone_code  text references zones(code);
alter table orders add column is_group   boolean default false;
alter table orders add column operator_id uuid;
alter table orders add column cantas_upsell_sent_at  timestamptz;
alter table orders add column cantas_upsell_order_id uuid references orders(id);

-- 6. Pricing function
create function calc_price(p_zone text, p_qty int) returns int language sql immutable as $$
  select case
    when p_zone = 'RISAS' and p_qty >= 6 then 7000000 * p_qty
    else (select price_cents from zones where code = p_zone) * p_qty
  end
$$;
```

**RLS:**

- `wa_conversations`, `wa_outbox`: service_role only.
- `zones`: public read, admin write.
- Existing RLS on `orders` / `tickets` extends naturally.

## 6. UX flows

### Flow 1 — General RISAS happy path (~3 min, 14 messages including auto-responses)

```
Cliente: Hola
Bot:     ¡Hola! 🎤 NEXT SHOW · Toromobolo + Jair Luquez
         15 ago Sabanalarga · ¿Cuántas entradas?
         [1] [2] [3] [4] [5] [+]
Cliente: tap [2]
Bot:     Localidad RISAS · 2 entradas = $150.000
         Nombre completo del comprador?
Cliente: Juan Pérez
Bot:     Cédula?
Cliente: 1234567890
Bot:     Email para backup? (escribe 'saltar' si no)
Cliente: juan@x.com
Bot:     Confirmar:
         👤 Juan Pérez · CC 1234567890
         🎟 2 x RISAS = $150.000
         ⏱ Tienes 15 min para pagar
         [PAGAR AHORA]
Cliente: tap [PAGAR AHORA]
Bot:     Pagar aquí 👉 https://checkout.wompi.co/p/XXX
         [Wompi webhook fires on APPROVED]
Bot:     ✅ Pago confirmado · Tu QR adjunto
         📅 15 ago · 8pm · Sabanalarga
         👥 Asigna nombres acá: https://...asignar.html?o=...&token=...
         [QR image + PDF attached]
```

### Flow 2 — Group ≥6 (operator handoff)

```
Cliente: tap [+]
Bot:     Para grupos de 6+ tenemos precio especial $70.000 c/u.
         Un asesor te contactará en minutos.
         Tu nombre y cuántas entradas?
Cliente: Carlos Ruiz, 12 entradas
Bot:     ¡Listo Carlos! Te escribimos enseguida.
         → operator-handoff fires:
           - Insert order with is_group=true, status='pending_operator'
           - Notify staff WA via template with {name, phone, qty}
Staff:   Picks up via admin → confirms quantity → triggers Wompi link generation → bot delivers link.
```

### Flow 3 — Cross-sell CANTAS (T-15)

```
[pg_cron T-15 fires cantas-cross-sell]
Bot (template): Hola Juan! 🔥 Faltan 15 días para NEXT SHOW.
                ¿Subes a CANTAS por solo $25k más por boleta?
                Mejor vista. Asiento garantizado.
                [UPGRADE] [NO GRACIAS]
Cliente:        tap [UPGRADE]
Bot:            Elige tu asiento aquí 👉 https://...asignar.html?upgrade=...&token=...
                Cuando termines, paga $50k (2 boletas x $25k):
                https://checkout.wompi.co/p/YYY
[Wompi webhook → upgrade tickets to CANTAS, link cantas_upsell_order_id]
```

### Flow 4 — Recover QR

```
Cliente: mi boleta
Bot:     Tu cédula para recuperar tu QR?
Cliente: 1234567890
Bot:     [calls get-order-status, finds paid order]
         Aquí está, Juan 🎟
         [QR image + PDF + reminder text]
```

## 7. Error handling & degradation

| Scenario | Behavior |
|----------|----------|
| Meta webhook signature invalid | 401, log security event |
| Phone rate-limited (>5 greet/h) | "Espera unos min, hubo muchos intentos" |
| Cédula already has active order | "Ya tienes reserva en proceso, link: X" |
| Sold-out RISAS (350 cap reached) | "RISAS agotada. ¿CANTAS?" (if T-15) o "Evento agotado" |
| Sold-out CANTAS (all seats taken) | "Asientos CANTAS agotados. ¿Buscas RISAS?" o "Evento agotado" |
| Wompi API failure | "Error pasarela, te re-envío link en 2 min" + retry job |
| Bot crash / function timeout | Outbox saves message, retry x3, then handoff |
| 3 consecutive unrecognized inputs | "Te paso con asesor humano" + staff notification |
| Hold expired (15 min) | "Tu reserva expiró. Escribe 'inicio' para empezar" |
| CANTAS request before T-15 | Bot omits CANTAS option |
| Customer requests refund | "No hay reembolsos. Cambio de nombre sí: link asignar" |

## 8. Reminders & lifecycle messages (pg_cron driven)

| Trigger | Template content |
|---------|------------------|
| T-3 días | "Faltan 3 días para NEXT SHOW. Tu QR sigue activo." |
| T-1 día  | "Mañana es NEXT SHOW. Recuerda tu QR y cédula." |
| Día evento, 3h antes | "¡Hoy es el día! Apertura puertas 7pm." |
| T-15 días | Cross-sell CANTAS (Flow 3) |
| Post-evento +1 día | "¡Gracias por venir! Próximo show pronto." (opcional v2) |

All templates pre-registered with Meta. Outbox handles delivery.

## 9. Security & compliance

- Meta webhook: `X-Hub-Signature-256` verification with app secret env var.
- Habeas Data Colombia: link to `/politica-privacidad.html` sent in greet message; explicit opt-in in confirm step.
- PII in logs: cédula and phone hashed (only last 4 visible).
- Service role keys never in client; only in edge functions via Supabase secrets.
- Anti-replay: `meta_msg_id` unique constraint on `wa_outbox`.
- Turnstile not applicable in WA (no browser). Rate limit + cédula dedup is the equivalent control.

## 10. Testing strategy

**Unit:**
- State machine transitions (covered by table-driven tests in `tests/unit/state-machine.test.ts`)
- `calc_price` SQL function (volumen + zona) — pgtap or vitest+supabase-js
- Attribution parser (`wa.me ?text=` → utm extraction)
- Oversell guard logic

**Integration:**
- Meta webhook signature verify (valid + invalid)
- Wompi webhook idempotency (re-test existing)
- Outbox retry with simulated Meta API failures
- pg_cron CANTAS unlock job
- Full state machine flow via mocked Meta endpoint

**E2E manual checklist** (before public launch):
- 4 flows above using WA Cloud API test number
- Sold-out simulation (force 350 paid, attempt 351st)
- Abandoned cart (hold expires, asiento liberado, otro compra)
- Group handoff (operator sees notification, closes manually)
- Recover QR (lost message, cédula recovery)
- Smoke test in production: 1 real $1.000 purchase before public launch

## 11. Out of scope (v1)

- Automated refunds
- Multi-event support (this design targets a single event)
- WhatsApp Pay nativo (not available in Colombia)
- WhatsApp Flows native UI for CANTAS seat picker (v1 uses `asignar.html` linked from chat; v2 can migrate to Flow)
- Dedicated mobile app (scanner PWA suffices)
- English language in bot
- Waitlist (oversell of 50 absorbs demand)

## 12. Configuration values & launch blockers

**Resolved (2026-05-17):**

- **CANTAS capacity:** 400 seats.
- **Staff WA handoff number:** +57 310 6619353.
- **Customer-facing WA Business number:** +57 310 6619353 (same as staff).
  - Implication: same line answers both bot and human. Bot must silence itself for any conversation where staff replies manually. Implemented via `human_takeover` state in `wa_conversations`: once staff sends a message from WA Business app, an admin endpoint flips state to `human_takeover` for that phone; bot ignores all further inbound messages until reset.

**Launch blockers (parallel work, not code-blocking):**

- **Meta Business Account verification** — pending. Development uses Meta WhatsApp Cloud API test number (free, 5 verified test recipients). Production swap when verified.
- **WA message templates (5)** — must be authored, submitted, and approved by Meta after verification (~24h per template). Templates: greet, reminder-T3, reminder-T1, reminder-day, cantas-cross-sell.
- **Wompi production credentials** — pending approval. Development uses Wompi sandbox keys (already wired in repo). Swap env vars when production approved.

Implementation proceeds with sandbox / test numbers. Production go-live is gated on all three external approvals.

## 13. Implementation order (preview for plan)

1. DB migration (zones, wa_conversations, wa_outbox, orders extensions, calc_price).
2. `wa-send` helper + outbox processor (worker).
3. `whatsapp-webhook` with state machine — happy path RISAS first.
4. Wire `create-order` to set `wa_phone`, `zone_code`.
5. Extend `send-ticket` to push via `wa-send`.
6. Group handoff flow + `operator-handoff` function.
7. Recover QR transversal handler.
8. CANTAS unlock + cross-sell cron + flow.
9. Landing CTA replacement + remove web checkout JS load.
10. Reminders cron jobs.
11. Admin: group-handoff inbox.
12. E2E manual checklist + production smoke test.

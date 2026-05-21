# NEXT SHOW · WhatsApp Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a WhatsApp-native ticket reservation + check-in flow for NEXT SHOW Sabanalarga that lets a phone-only customer reserve and pay (Wompi link) inside WhatsApp in ≤3 minutes, while reusing the existing scanner PWA and admin panel.

**Architecture:** A new `whatsapp-webhook` Edge Function drives a finite state machine stored in `wa_conversations`. State transitions call existing `create-order` for atomic seat hold (15-min) and `wompi-webhook` triggers a modified `send-ticket` that delivers QR media via WhatsApp Cloud API. Group orders (≥6) and CANTAS upsells (T-15) branch off the main flow. Outbound messages flow through `wa_outbox` with retry.

**Tech Stack:** Supabase Postgres 15 + RLS, Deno Edge Functions, WhatsApp Cloud API (Meta), Wompi sandbox/prod, vanilla HTML/JS landing, Vitest, pg_cron.

**Spec:** [docs/superpowers/specs/2026-05-17-nextshow-whatsapp-checkout-design.md](../specs/2026-05-17-nextshow-whatsapp-checkout-design.md)

---

## File Structure

**New files:**

- `supabase/migrations/20260517000001_whatsapp_checkout.sql` — zones extensions, wa_conversations, wa_outbox, orders extensions, calc_price, CANTAS seats, value updates
- `supabase/migrations/20260517000002_wa_pg_cron.sql` — cron jobs for outbox worker, reminders, CANTAS unlock
- `supabase/functions/whatsapp-webhook/index.ts` — Meta inbound webhook + state machine entry point
- `supabase/functions/_shared/wa-state.ts` — pure state machine module (transitions, predicates, no IO)
- `supabase/functions/_shared/wa-meta.ts` — Meta Cloud API client extensions: signature verify, send interactive (buttons), send image media
- `supabase/functions/_shared/wa-outbox.ts` — enqueue + worker helpers
- `supabase/functions/wa-outbox-worker/index.ts` — scheduled outbox sender (drains pending → Meta API → marks sent)
- `supabase/functions/operator-handoff/index.ts` — admin endpoint to flip `human_takeover`
- `supabase/functions/cantas-cross-sell/index.ts` — T-15 cron job: flips zone active + enqueues upsell templates
- `supabase/functions/reminder-tick/index.ts` — daily cron: enqueues T-3/T-1/day-of reminders
- `tests/unit/wa-state.test.ts` — state machine transitions
- `tests/unit/wa-meta-signature.test.ts` — webhook signature verify
- `tests/unit/calc-price.test.ts` — pricing function (vitest hitting local supabase)
- `tests/integration/whatsapp-happy-path.test.ts` — full RISAS flow with mocked Meta + Wompi
- `tests/integration/whatsapp-group-handoff.test.ts` — ≥6 branch
- `tests/integration/whatsapp-recover-qr.test.ts` — transversal recovery
- `public/assets/js/wa-cta.js` — WA button with UTM preservation

**Modified files:**

- `supabase/functions/_shared/signing.ts` — add `verifyMetaWebhookSignature(body, sig, secret)`
- `supabase/functions/_shared/whatsapp.ts` — add interactive buttons + image send helpers (keep existing sendWhatsAppText/Template)
- `supabase/functions/create-order/index.ts` — accept `wa_phone`, support `is_group`, configurable `hold_minutes` (15 default for WA), skip turnstile when called from `whatsapp-webhook` (service-to-service trust)
- `supabase/functions/send-ticket/index.ts` — primary delivery via WA image+caption, email becomes fallback
- `supabase/functions/get-order-status/index.ts` — add lookup by `buyer_id_number + buyer_phone` for recover-QR flow
- `supabase/functions/wompi-webhook/index.ts` — set `wa_conversations.state='paid'` after ticket insert; call `send-ticket` (already does); reset conversation context after send
- `public/index.html` — replace checkout modal CTA with WA button; remove load of checkout modal JS classes
- `public/admin.html` — add "Grupos pendientes" inbox section
- `public/assets/js/admin.js` (or equivalent) — fetch + render group-handoff list, action "tomar"
- `supabase/migrations/20260510000005_seed.sql` — leave as-is (historic); new migration adapts values
- `README.md` — add WA checkout section, deploy notes

---

## Implementation Phases

- **Phase 0 (Tasks 1-7):** DB migration + shared modules. Blocking — must finish before Phase 1.
- **Phase 1 (Tasks 8-15):** RISAS happy-path inbound webhook + payment. Ships a working sandbox flow.
- **Phase 2 (Tasks 16-19):** Outbound delivery (QR via WA) + outbox worker.
- **Phase 3 (Tasks 20-24):** Branches: group handoff, recover-QR, help/fallback, anti-abuse, human takeover.
- **Phase 4 (Tasks 25-27):** CANTAS unlock + cross-sell.
- **Phase 5 (Tasks 28-29):** Reminders cron.
- **Phase 6 (Tasks 30-31):** Landing CTA swap + admin inbox.
- **Phase 7 (Task 32):** E2E manual checklist + readme.

Within a phase, tasks marked with **[parallelizable]** in the heading can be dispatched to separate subagents simultaneously.

---

## Phase 0 — Database & shared modules

### Task 1: Migration — extend zones table

**Files:**
- Create: `supabase/migrations/20260517000001_whatsapp_checkout.sql` (first stanza)

- [ ] **Step 1: Write the migration first stanza**

Append this content to a new file `supabase/migrations/20260517000001_whatsapp_checkout.sql`:

```sql
-- ============================================================
-- NEXT SHOW · WhatsApp Checkout schema
-- Migration 20260517000001
-- ============================================================

-- 1. Extend zones with new fields used by WA flow
ALTER TABLE zones ADD COLUMN IF NOT EXISTS oversell   int NOT NULL DEFAULT 0;
ALTER TABLE zones ADD COLUMN IF NOT EXISTS unlock_at  timestamptz;
ALTER TABLE zones ADD COLUMN IF NOT EXISTS active     boolean NOT NULL DEFAULT true;

-- 2. Update existing event zones to spec values (idempotent on re-run)
WITH ev AS (SELECT id FROM events WHERE slug = 'nextshow-torombolo-jair-2026')
UPDATE zones SET
  name       = 'Localidad RISAS · General',
  price_cop  = 75000,
  capacity   = 300,
  oversell   = 50,
  active     = true,
  unlock_at  = NULL
FROM ev
WHERE zones.event_id = ev.id AND zones.code = 'risas';

WITH ev AS (SELECT id FROM events WHERE slug = 'nextshow-torombolo-jair-2026')
UPDATE zones SET
  name       = 'Localidad CANTAS · Preferencial',
  price_cop  = 100000,
  capacity   = 400,
  oversell   = 0,
  active     = false,
  unlock_at  = (SELECT event_date - interval '15 days' FROM events WHERE slug = 'nextshow-torombolo-jair-2026')
FROM ev
WHERE zones.event_id = ev.id AND zones.code = 'cantas';

-- 3. Update event hold_minutes to 15 for WA flow
UPDATE events SET settings = jsonb_set(settings, '{hold_minutes}', '15'::jsonb)
WHERE slug = 'nextshow-torombolo-jair-2026';
```

- [ ] **Step 2: Run migration locally**

Run:
```bash
supabase db reset
```
Expected: completes without error. Verify with:
```bash
supabase db dump --data-only --schema public | grep -E "(risas|cantas).*7500" 
```
Should show new prices.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260517000001_whatsapp_checkout.sql
git commit -m "feat(db): extend zones with oversell/unlock_at/active + update event values"
```

---

### Task 2: Migration — regenerate CANTAS seats (100 → 400)

**Files:**
- Modify: `supabase/migrations/20260517000001_whatsapp_checkout.sql` (append stanza)

> **Note on layout:** Spec says CANTAS = 400 seats. Existing seed is 4 rows × 25 = 100. Plan generates 8 rows A-H × 50 seats with aisle between 25 and 26. Confirm physical venue layout matches before deploy; update the row/seat generators if not.

- [ ] **Step 1: Append seat regeneration stanza**

Append to `supabase/migrations/20260517000001_whatsapp_checkout.sql`:

```sql
-- 4. Regenerate CANTAS seats from 100 → 400 (8 rows A-H × 50 seats, aisle at 25/26)
-- Safe: only runs if zone has fewer than 400 seats and zero existing ticket references
DO $$
DECLARE
  v_zone_id uuid;
  v_existing_count int;
  v_referenced_count int;
BEGIN
  SELECT id INTO v_zone_id FROM zones
  WHERE code = 'cantas' AND event_id = (SELECT id FROM events WHERE slug='nextshow-torombolo-jair-2026');

  IF v_zone_id IS NULL THEN
    RAISE NOTICE 'CANTAS zone not found, skipping seat regen.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_existing_count FROM seats WHERE zone_id = v_zone_id;
  SELECT count(*) INTO v_referenced_count FROM tickets t
    JOIN seats s ON s.id = t.seat_id WHERE s.zone_id = v_zone_id;

  IF v_existing_count = 400 THEN
    RAISE NOTICE 'CANTAS already has 400 seats, skipping.';
    RETURN;
  END IF;

  IF v_referenced_count > 0 THEN
    RAISE EXCEPTION 'CANTAS seats are referenced by tickets — cannot regenerate. Resolve manually.';
  END IF;

  -- Wipe and regenerate
  DELETE FROM seats WHERE zone_id = v_zone_id;
  INSERT INTO seats (zone_id, row_label, seat_number, side)
  SELECT v_zone_id, row_label, seat_number,
         CASE WHEN seat_number <= 25 THEN 'izq' ELSE 'der' END
  FROM unnest(ARRAY['A','B','C','D','E','F','G','H']) AS row_label,
       generate_series(1, 50) AS seat_number;
END $$;
```

- [ ] **Step 2: Reset DB and verify**

Run:
```bash
supabase db reset
```
Then:
```bash
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -c "SELECT count(*) FROM seats s JOIN zones z ON z.id=s.zone_id WHERE z.code='cantas';"
```
Expected: `400`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260517000001_whatsapp_checkout.sql
git commit -m "feat(db): regenerate CANTAS as 8x50 seats = 400 capacity"
```

---

### Task 3: Migration — wa_conversations + wa_outbox tables

**Files:**
- Modify: `supabase/migrations/20260517000001_whatsapp_checkout.sql` (append stanza)

- [ ] **Step 1: Append tables**

Append:

```sql
-- 5. WhatsApp conversation state machine
CREATE TABLE wa_conversations (
  phone           text PRIMARY KEY,
  state           text NOT NULL DEFAULT 'idle',
  context         jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_msg_at     timestamptz NOT NULL DEFAULT now(),
  locked_until    timestamptz,
  attribution     jsonb,
  fallback_count  int NOT NULL DEFAULT 0
);
CREATE INDEX idx_wa_conv_last_msg ON wa_conversations(last_msg_at);
CREATE INDEX idx_wa_conv_state    ON wa_conversations(state) WHERE state NOT IN ('idle','paid');

-- 6. Outbox for outbound WA messages (idempotency + retry)
CREATE TABLE wa_outbox (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('text','template','interactive','image')),
  payload     jsonb NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','dead')),
  meta_msg_id text,
  attempts    int NOT NULL DEFAULT 0,
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz,
  next_attempt_at timestamptz
);
CREATE INDEX idx_wa_outbox_pending ON wa_outbox(next_attempt_at NULLS FIRST, created_at) WHERE status = 'pending';

-- 7. RLS — service_role only for both
ALTER TABLE wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_outbox        ENABLE ROW LEVEL SECURITY;
-- (no policies = denies all to anon/auth; service_role bypasses RLS)
```

- [ ] **Step 2: Reset DB + verify tables exist**

```bash
supabase db reset
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -c "\d wa_conversations" 
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -c "\d wa_outbox"
```
Expected: both tables listed with columns.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260517000001_whatsapp_checkout.sql
git commit -m "feat(db): wa_conversations + wa_outbox tables with RLS"
```

---

### Task 4: Migration — orders extensions + calc_price function

**Files:**
- Modify: `supabase/migrations/20260517000001_whatsapp_checkout.sql` (append stanza)

- [ ] **Step 1: Append orders columns + pricing function**

Append:

```sql
-- 8. Orders gain WA-flow fields
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wa_phone                text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_group                boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS operator_id             uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cantas_upsell_sent_at   timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cantas_upsell_order_id  uuid REFERENCES orders(id);

CREATE INDEX IF NOT EXISTS idx_orders_wa_phone ON orders(wa_phone) WHERE wa_phone IS NOT NULL;

-- 9. Pricing function — applies volume discount for RISAS at >=6 boletas
CREATE OR REPLACE FUNCTION calc_price(p_zone_id uuid, p_qty int) RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_qty >= 6 AND (SELECT code FROM zones WHERE id = p_zone_id) = 'risas'
      THEN 70000 * p_qty
    ELSE (SELECT price_cop FROM zones WHERE id = p_zone_id) * p_qty
  END
$$;
```

- [ ] **Step 2: Reset + verify**

```bash
supabase db reset
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -c "
  SELECT calc_price(z.id, 5) AS five,
         calc_price(z.id, 6) AS six,
         calc_price(z.id, 10) AS ten
  FROM zones z WHERE z.code='risas';"
```
Expected: `five=375000, six=420000, ten=700000`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260517000001_whatsapp_checkout.sql
git commit -m "feat(db): orders WA fields + calc_price function with volume discount"
```

---

### Task 5: Calc_price unit test

**Files:**
- Create: `tests/unit/calc-price.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/calc-price.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, key);

async function callCalc(zoneCode: 'risas' | 'cantas', qty: number): Promise<number> {
  const { data: zone } = await sb.from('zones').select('id').eq('code', zoneCode).single();
  const { data, error } = await sb.rpc('calc_price', { p_zone_id: zone!.id, p_qty: qty });
  if (error) throw error;
  return data;
}

describe('calc_price', () => {
  it('RISAS 1 boleta = 75000', async () => expect(await callCalc('risas', 1)).toBe(75000));
  it('RISAS 5 boletas = 375000 (no volume yet)', async () => expect(await callCalc('risas', 5)).toBe(375000));
  it('RISAS 6 boletas = 420000 (volume discount kicks in at 6)', async () => expect(await callCalc('risas', 6)).toBe(420000));
  it('RISAS 10 boletas = 700000 (volume)', async () => expect(await callCalc('risas', 10)).toBe(700000));
  it('CANTAS 1 boleta = 100000', async () => expect(await callCalc('cantas', 1)).toBe(100000));
  it('CANTAS 6 boletas = 600000 (no volume discount on CANTAS)', async () => expect(await callCalc('cantas', 6)).toBe(600000));
});
```

- [ ] **Step 2: Run test — expect ALL pass since migration already exists**

```bash
SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o env | grep SERVICE_ROLE_KEY | cut -d= -f2-) npm test -- tests/unit/calc-price.test.ts
```
Expected: 6/6 pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/calc-price.test.ts
git commit -m "test(unit): calc_price function with volume discount + CANTAS"
```

---

### Task 6: Shared module — Meta webhook signature verification [parallelizable]

**Files:**
- Modify: `supabase/functions/_shared/signing.ts` (append function)
- Create: `tests/unit/wa-meta-signature.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/wa-meta-signature.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyMetaWebhookSignature } from '../../supabase/functions/_shared/signing.ts';

const secret = 'test_meta_app_secret';

function sign(body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

describe('verifyMetaWebhookSignature', () => {
  it('accepts valid signature with sha256= prefix', async () => {
    const body = '{"object":"whatsapp_business_account"}';
    expect(await verifyMetaWebhookSignature(body, sign(body), secret)).toBe(true);
  });
  it('rejects tampered body', async () => {
    const body = '{"object":"whatsapp_business_account"}';
    expect(await verifyMetaWebhookSignature(body + 'tampered', sign(body), secret)).toBe(false);
  });
  it('rejects missing signature', async () => {
    expect(await verifyMetaWebhookSignature('{}', '', secret)).toBe(false);
  });
  it('rejects malformed signature (no prefix)', async () => {
    const body = '{}';
    const sig = createHmac('sha256', secret).update(body).digest('hex');  // no sha256= prefix
    expect(await verifyMetaWebhookSignature(body, sig, secret)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm test -- tests/unit/wa-meta-signature.test.ts
```
Expected: FAIL — `verifyMetaWebhookSignature is not exported`.

- [ ] **Step 3: Implement in signing.ts**

Append to `supabase/functions/_shared/signing.ts`:

```typescript
export async function verifyMetaWebhookSignature(
  body: string,
  signatureHeader: string,
  appSecret: string
): Promise<boolean> {
  if (!signatureHeader.startsWith('sha256=')) return false;
  const provided = signatureHeader.slice('sha256='.length);
  const expected = await hmacSha256(appSecret, body);
  // constant-time compare
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
npm test -- tests/unit/wa-meta-signature.test.ts
```
Expected: 4/4 pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/signing.ts tests/unit/wa-meta-signature.test.ts
git commit -m "feat(shared): Meta webhook signature verification with constant-time compare"
```

---

### Task 7: Shared module — pure state machine [parallelizable]

**Files:**
- Create: `supabase/functions/_shared/wa-state.ts`
- Create: `tests/unit/wa-state.test.ts`

This module is **pure**: no IO, no DB calls. Takes current state + event, returns next state + actions. Easy to test, easy to reason about.

- [ ] **Step 1: Write failing tests**

Create `tests/unit/wa-state.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { transition, type ConvState, type Event } from '../../supabase/functions/_shared/wa-state.ts';

describe('wa-state transition', () => {
  const baseCtx = { phone: '+573001234567' };

  it('idle + text "hola" → greet', () => {
    const next = transition({ state: 'idle', context: baseCtx }, { type: 'text', text: 'hola' });
    expect(next.state).toBe('greet');
    expect(next.actions[0].kind).toBe('send_greeting');
  });

  it('greet + button "start" → quantity', () => {
    const next = transition({ state: 'greet', context: baseCtx }, { type: 'button', id: 'start' });
    expect(next.state).toBe('quantity');
  });

  it('quantity + button "qty_3" → buyer_name with qty=3 in context', () => {
    const next = transition({ state: 'quantity', context: baseCtx }, { type: 'button', id: 'qty_3' });
    expect(next.state).toBe('buyer_name');
    expect(next.context.qty).toBe(3);
  });

  it('quantity + button "qty_more" → group_handoff', () => {
    const next = transition({ state: 'quantity', context: baseCtx }, { type: 'button', id: 'qty_more' });
    expect(next.state).toBe('group_handoff');
    expect(next.actions.some(a => a.kind === 'notify_staff')).toBe(true);
  });

  it('buyer_name + text "Juan Pérez" → buyer_cedula', () => {
    const next = transition(
      { state: 'buyer_name', context: { ...baseCtx, qty: 2 } },
      { type: 'text', text: 'Juan Pérez' },
    );
    expect(next.state).toBe('buyer_cedula');
    expect(next.context.name).toBe('Juan Pérez');
  });

  it('buyer_cedula + invalid cedula stays in buyer_cedula with retry msg', () => {
    const next = transition(
      { state: 'buyer_cedula', context: { ...baseCtx, qty: 2, name: 'J' } },
      { type: 'text', text: 'abc' },
    );
    expect(next.state).toBe('buyer_cedula');
    expect(next.actions[0].kind).toBe('send_invalid_cedula');
  });

  it('buyer_cedula + valid 10-digit cedula → email_opt', () => {
    const next = transition(
      { state: 'buyer_cedula', context: { ...baseCtx, qty: 2, name: 'J' } },
      { type: 'text', text: '1234567890' },
    );
    expect(next.state).toBe('email_opt');
    expect(next.context.cedula).toBe('1234567890');
  });

  it('email_opt + text "saltar" → confirm', () => {
    const next = transition(
      { state: 'email_opt', context: { ...baseCtx, qty: 2, name: 'J', cedula: '1234567890' } },
      { type: 'text', text: 'saltar' },
    );
    expect(next.state).toBe('confirm');
    expect(next.context.email).toBeUndefined();
  });

  it('email_opt + valid email → confirm with email set', () => {
    const next = transition(
      { state: 'email_opt', context: { ...baseCtx, qty: 2, name: 'J', cedula: '1234567890' } },
      { type: 'text', text: 'a@b.co' },
    );
    expect(next.state).toBe('confirm');
    expect(next.context.email).toBe('a@b.co');
  });

  it('confirm + button "pay" → payment_pending with create_order action', () => {
    const next = transition(
      { state: 'confirm', context: { ...baseCtx, qty: 2, name: 'J', cedula: '1234567890', zone: 'risas' } },
      { type: 'button', id: 'pay' },
    );
    expect(next.state).toBe('payment_pending');
    expect(next.actions.some(a => a.kind === 'create_order')).toBe(true);
  });

  it('any state + text "menu" → reset to greet', () => {
    const next = transition({ state: 'payment_pending', context: baseCtx }, { type: 'text', text: 'menu' });
    expect(next.state).toBe('greet');
  });

  it('any state + text "mi boleta" → recover_qr', () => {
    const next = transition({ state: 'idle', context: baseCtx }, { type: 'text', text: 'mi boleta' });
    expect(next.state).toBe('recover_qr');
  });

  it('three consecutive fallbacks → fallback state with handoff action', () => {
    let s: ConvState = { state: 'greet', context: { ...baseCtx, fallback_count: 2 } };
    const next = transition(s, { type: 'text', text: 'gibberish' });
    expect(next.state).toBe('fallback');
    expect(next.actions.some(a => a.kind === 'notify_staff')).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
npm test -- tests/unit/wa-state.test.ts
```
Expected: module not found.

- [ ] **Step 3: Implement state machine**

Create `supabase/functions/_shared/wa-state.ts`:

```typescript
// Pure state machine for WA conversation. No IO. Easy to test.

export type State =
  | 'idle' | 'greet' | 'zone_select' | 'quantity'
  | 'buyer_name' | 'buyer_cedula' | 'email_opt' | 'confirm'
  | 'payment_pending' | 'paid' | 'expired'
  | 'group_handoff' | 'cantas_upsell'
  | 'recover_qr' | 'help' | 'fallback' | 'human_takeover';

export interface Context {
  phone: string;
  zone?: 'risas' | 'cantas';
  qty?: number;
  name?: string;
  cedula?: string;
  email?: string;
  order_id?: string;
  fallback_count?: number;
  cantas_unlocked?: boolean;  // injected by webhook based on zones.active
}

export interface ConvState { state: State; context: Context; }

export type Event =
  | { type: 'text'; text: string }
  | { type: 'button'; id: string }
  | { type: 'system'; kind: 'order_paid' | 'order_expired' | 'staff_replied' };

export type Action =
  | { kind: 'send_greeting' }
  | { kind: 'send_zone_select' }
  | { kind: 'send_quantity_buttons' }
  | { kind: 'send_ask_name' }
  | { kind: 'send_ask_cedula' }
  | { kind: 'send_invalid_cedula' }
  | { kind: 'send_ask_email' }
  | { kind: 'send_invalid_email' }
  | { kind: 'send_confirm_summary' }
  | { kind: 'create_order' }
  | { kind: 'send_payment_link' }
  | { kind: 'send_paid_confirmation' }
  | { kind: 'send_expired_msg' }
  | { kind: 'send_group_intake' }
  | { kind: 'notify_staff'; reason: 'group' | 'fallback' | 'help' }
  | { kind: 'send_recover_prompt' }
  | { kind: 'send_fallback' }
  | { kind: 'send_takeover_silent' }
  | { kind: 'send_cantas_upsell_picker' };

export interface Transition { state: State; context: Context; actions: Action[]; }

const RE_CEDULA = /^\d{6,12}$/;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RESET_WORDS = ['menu', 'inicio', 'empezar', 'start'];
const RECOVER_WORDS = ['mi boleta', 'mi qr', 'qr', 'se me borró', 'se me borro', 'perdí', 'perdi'];
const HELP_WORDS = ['ayuda', 'humano', 'asesor', 'agente'];

function normalize(s: string): string { return s.trim().toLowerCase(); }

export function transition(curr: ConvState, ev: Event): Transition {
  // Transversal: human takeover silences bot entirely.
  if (curr.state === 'human_takeover') {
    return { state: 'human_takeover', context: curr.context, actions: [] };
  }

  // Transversal: text-based resets / shortcuts
  if (ev.type === 'text') {
    const t = normalize(ev.text);
    if (RESET_WORDS.includes(t)) {
      return { state: 'greet', context: { phone: curr.context.phone, cantas_unlocked: curr.context.cantas_unlocked }, actions: [{ kind: 'send_greeting' }] };
    }
    if (RECOVER_WORDS.some(w => t.includes(w))) {
      return { state: 'recover_qr', context: curr.context, actions: [{ kind: 'send_recover_prompt' }] };
    }
    if (HELP_WORDS.some(w => t.includes(w))) {
      return { state: 'help', context: curr.context, actions: [{ kind: 'notify_staff', reason: 'help' }] };
    }
  }

  switch (curr.state) {
    case 'idle': {
      if (ev.type === 'text') {
        return { state: 'greet', context: curr.context, actions: [{ kind: 'send_greeting' }] };
      }
      return { state: 'idle', context: curr.context, actions: [] };
    }

    case 'greet': {
      if (ev.type === 'button' && ev.id === 'start') {
        // If CANTAS unlocked, ask zone first. Else go straight to quantity (RISAS default).
        if (curr.context.cantas_unlocked) {
          return { state: 'zone_select', context: curr.context, actions: [{ kind: 'send_zone_select' }] };
        }
        return { state: 'quantity', context: { ...curr.context, zone: 'risas' }, actions: [{ kind: 'send_quantity_buttons' }] };
      }
      return bumpFallback(curr);
    }

    case 'zone_select': {
      if (ev.type === 'button' && (ev.id === 'zone_risas' || ev.id === 'zone_cantas')) {
        const zone = ev.id === 'zone_risas' ? 'risas' : 'cantas';
        return { state: 'quantity', context: { ...curr.context, zone }, actions: [{ kind: 'send_quantity_buttons' }] };
      }
      return bumpFallback(curr);
    }

    case 'quantity': {
      if (ev.type === 'button' && ev.id.startsWith('qty_')) {
        const sfx = ev.id.slice(4);
        if (sfx === 'more') {
          return {
            state: 'group_handoff',
            context: curr.context,
            actions: [{ kind: 'send_group_intake' }, { kind: 'notify_staff', reason: 'group' }],
          };
        }
        const qty = parseInt(sfx, 10);
        if (qty >= 1 && qty <= 5) {
          return { state: 'buyer_name', context: { ...curr.context, qty }, actions: [{ kind: 'send_ask_name' }] };
        }
      }
      return bumpFallback(curr);
    }

    case 'buyer_name': {
      if (ev.type === 'text' && ev.text.trim().length >= 2) {
        return { state: 'buyer_cedula', context: { ...curr.context, name: ev.text.trim() }, actions: [{ kind: 'send_ask_cedula' }] };
      }
      return bumpFallback(curr);
    }

    case 'buyer_cedula': {
      if (ev.type === 'text') {
        const v = ev.text.replace(/\D/g, '');
        if (RE_CEDULA.test(v)) {
          return { state: 'email_opt', context: { ...curr.context, cedula: v }, actions: [{ kind: 'send_ask_email' }] };
        }
        return { state: 'buyer_cedula', context: curr.context, actions: [{ kind: 'send_invalid_cedula' }] };
      }
      return bumpFallback(curr);
    }

    case 'email_opt': {
      if (ev.type === 'text') {
        const t = normalize(ev.text);
        if (t === 'saltar' || t === 'no') {
          return { state: 'confirm', context: curr.context, actions: [{ kind: 'send_confirm_summary' }] };
        }
        if (RE_EMAIL.test(ev.text.trim())) {
          return { state: 'confirm', context: { ...curr.context, email: ev.text.trim() }, actions: [{ kind: 'send_confirm_summary' }] };
        }
        return { state: 'email_opt', context: curr.context, actions: [{ kind: 'send_invalid_email' }] };
      }
      return bumpFallback(curr);
    }

    case 'confirm': {
      if (ev.type === 'button' && ev.id === 'pay') {
        return { state: 'payment_pending', context: curr.context, actions: [{ kind: 'create_order' }] };
      }
      return bumpFallback(curr);
    }

    case 'payment_pending': {
      if (ev.type === 'system' && ev.kind === 'order_paid') {
        return { state: 'paid', context: curr.context, actions: [{ kind: 'send_paid_confirmation' }] };
      }
      if (ev.type === 'system' && ev.kind === 'order_expired') {
        return { state: 'expired', context: curr.context, actions: [{ kind: 'send_expired_msg' }] };
      }
      // re-send link if user pokes
      return { state: 'payment_pending', context: curr.context, actions: [{ kind: 'send_payment_link' }] };
    }

    case 'paid': case 'expired': case 'group_handoff': case 'recover_qr':
    case 'help': case 'fallback': case 'cantas_upsell': {
      // No further automated transitions from these states (handled by external triggers).
      return { state: curr.state, context: curr.context, actions: [] };
    }
  }
}

function bumpFallback(curr: ConvState): Transition {
  const n = (curr.context.fallback_count ?? 0) + 1;
  if (n >= 3) {
    return {
      state: 'fallback',
      context: { ...curr.context, fallback_count: 0 },
      actions: [{ kind: 'notify_staff', reason: 'fallback' }],
    };
  }
  return {
    state: curr.state,
    context: { ...curr.context, fallback_count: n },
    actions: [{ kind: 'send_fallback' }],
  };
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm test -- tests/unit/wa-state.test.ts
```
Expected: 12/12 pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/wa-state.ts tests/unit/wa-state.test.ts
git commit -m "feat(shared): pure state machine for WhatsApp conversation flow"
```

---

## Phase 1 — Inbound webhook (RISAS happy path)

### Task 8: Extend whatsapp.ts with interactive + image senders

**Files:**
- Modify: `supabase/functions/_shared/whatsapp.ts`

- [ ] **Step 1: Append interactive and image helpers**

Append to `supabase/functions/_shared/whatsapp.ts`:

```typescript
type Button = { id: string; title: string };

export async function sendWhatsAppButtons(to: string, bodyText: string, buttons: Button[]) {
  const token = Deno.env.get('WA_CLOUD_TOKEN')!;
  if (token === 'mock') {
    console.log('[MOCK WA BUTTONS]', { to, bodyText, buttons });
    return { ok: true, mock: true };
  }
  const phoneId = Deno.env.get('WA_PHONE_NUMBER_ID')!;
  const r = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.slice(0, 3).map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } })),
        },
      },
    }),
  });
  if (!r.ok) throw new Error(`WA error: ${r.status} ${await r.text()}`);
  return await r.json();
}

export async function sendWhatsAppImage(to: string, imageUrl: string, caption?: string) {
  const token = Deno.env.get('WA_CLOUD_TOKEN')!;
  if (token === 'mock') {
    console.log('[MOCK WA IMAGE]', { to, imageUrl, caption });
    return { ok: true, mock: true };
  }
  const phoneId = Deno.env.get('WA_PHONE_NUMBER_ID')!;
  const r = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: { link: imageUrl, caption },
    }),
  });
  if (!r.ok) throw new Error(`WA error: ${r.status} ${await r.text()}`);
  return await r.json();
}
```

- [ ] **Step 2: Commit (no new tests; covered indirectly via integration tests later)**

```bash
git add supabase/functions/_shared/whatsapp.ts
git commit -m "feat(shared): WA buttons + image senders"
```

---

### Task 9: Outbox helpers (enqueue + worker drainer)

**Files:**
- Create: `supabase/functions/_shared/wa-outbox.ts`

- [ ] **Step 1: Create file**

Create `supabase/functions/_shared/wa-outbox.ts`:

```typescript
import { getServiceClient } from './supabase.ts';
import { sendWhatsAppText, sendWhatsAppButtons, sendWhatsAppImage, sendWhatsAppTemplate } from './whatsapp.ts';

export type OutboxKind = 'text' | 'template' | 'interactive' | 'image';

interface EnqueueParams {
  phone: string;
  kind: OutboxKind;
  payload: Record<string, unknown>;
}

export async function enqueue({ phone, kind, payload }: EnqueueParams): Promise<string> {
  const sb = getServiceClient();
  const { data, error } = await sb.from('wa_outbox')
    .insert({ phone, kind, payload, status: 'pending' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

const MAX_ATTEMPTS = 5;

function nextDelaySeconds(attempt: number): number {
  // 2s, 8s, 30s, 120s, 600s
  return [2, 8, 30, 120, 600][Math.min(attempt, 4)];
}

export async function drainOnce(limit = 25): Promise<{ sent: number; failed: number; dead: number }> {
  const sb = getServiceClient();
  const { data: rows } = await sb.from('wa_outbox')
    .select('*')
    .eq('status', 'pending')
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
    .order('created_at', { ascending: true })
    .limit(limit);

  let sent = 0, failed = 0, dead = 0;
  for (const r of rows ?? []) {
    try {
      let resp: unknown;
      const p = r.payload as Record<string, any>;
      switch (r.kind) {
        case 'text':        resp = await sendWhatsAppText(r.phone, p.body); break;
        case 'interactive': resp = await sendWhatsAppButtons(r.phone, p.body, p.buttons); break;
        case 'image':       resp = await sendWhatsAppImage(r.phone, p.url, p.caption); break;
        case 'template':    resp = await sendWhatsAppTemplate(r.phone, p.name, p.params ?? []); break;
      }
      const metaId = (resp as any)?.messages?.[0]?.id;
      await sb.from('wa_outbox').update({
        status: 'sent', meta_msg_id: metaId ?? null, sent_at: new Date().toISOString(),
      }).eq('id', r.id);
      sent++;
    } catch (e) {
      const attempts = r.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await sb.from('wa_outbox').update({
          status: 'dead', attempts, last_error: String(e),
        }).eq('id', r.id);
        dead++;
      } else {
        const next = new Date(Date.now() + nextDelaySeconds(attempts) * 1000);
        await sb.from('wa_outbox').update({
          attempts, last_error: String(e), next_attempt_at: next.toISOString(),
        }).eq('id', r.id);
        failed++;
      }
    }
  }
  return { sent, failed, dead };
}
```

- [ ] **Step 2: Commit (worker function in next task drives this; helper tested via integration)**

```bash
git add supabase/functions/_shared/wa-outbox.ts
git commit -m "feat(shared): WA outbox enqueue + drainOnce with backoff"
```

---

### Task 10: Outbox worker edge function

**Files:**
- Create: `supabase/functions/wa-outbox-worker/index.ts`

- [ ] **Step 1: Create function**

Create `supabase/functions/wa-outbox-worker/index.ts`:

```typescript
import { drainOnce } from '../_shared/wa-outbox.ts';
import { jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (_req) => {
  const result = await drainOnce(50);
  return jsonResponse({ ok: true, ...result });
});
```

- [ ] **Step 2: Test locally with one row**

Insert a fake mock-pending row and invoke:
```bash
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -c "
  INSERT INTO wa_outbox(phone, kind, payload) VALUES ('+573001234567','text','{\"body\":\"hello\"}'::jsonb);"
curl -s -X POST http://localhost:54321/functions/v1/wa-outbox-worker -H "Authorization: Bearer $(supabase status -o env | grep ANON_KEY | cut -d= -f2-)"
```
Expected response: `{"ok":true,"sent":1,"failed":0,"dead":0}` (mock token logs to console).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/wa-outbox-worker/index.ts
git commit -m "feat(fn): wa-outbox-worker drains pending messages"
```

---

### Task 11: whatsapp-webhook — GET verification

**Files:**
- Create: `supabase/functions/whatsapp-webhook/index.ts`

- [ ] **Step 1: Create stub for Meta verification challenge**

Create `supabase/functions/whatsapp-webhook/index.ts`:

```typescript
import { preflight, jsonResponse } from '../_shared/cors.ts';
import { verifyMetaWebhookSignature } from '../_shared/signing.ts';

const VERIFY_TOKEN = Deno.env.get('WA_VERIFY_TOKEN') || 'nextshow_verify';

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;

  const url = new URL(req.url);
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('forbidden', { status: 403 });
  }

  if (req.method !== 'POST') return jsonResponse({ error: 'METHOD' }, 405);

  const body = await req.text();
  const sig = req.headers.get('x-hub-signature-256') || '';
  const appSecret = Deno.env.get('META_APP_SECRET') || 'dev_secret';
  const ok = await verifyMetaWebhookSignature(body, sig, appSecret);
  if (!ok && appSecret !== 'dev_secret') return jsonResponse({ error: 'INVALID_SIGNATURE' }, 401);

  // Phase 1 stub: log + 200 OK. Routing added in next task.
  console.log('[wa-webhook]', body);
  return jsonResponse({ ok: true });
});
```

- [ ] **Step 2: Smoke test verification**

```bash
curl "http://localhost:54321/functions/v1/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=nextshow_verify&hub.challenge=test123" \
  -H "Authorization: Bearer $(supabase status -o env | grep ANON_KEY | cut -d= -f2-)"
```
Expected response body: `test123` with status 200.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/whatsapp-webhook/index.ts
git commit -m "feat(fn): whatsapp-webhook GET verification challenge"
```

---

### Task 12: whatsapp-webhook — POST routing + state machine wiring

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/index.ts`

- [ ] **Step 1: Implement POST handler that loads conversation, parses Meta payload, applies transition, persists state, executes actions**

Replace the POST stub block with:

```typescript
  // === POST: inbound message from Meta ===
  // Meta payload structure: entry[].changes[].value.messages[]
  let payload: any;
  try { payload = JSON.parse(body); } catch { return jsonResponse({ error: 'BAD_JSON' }, 400); }

  const messages = payload?.entry?.[0]?.changes?.[0]?.value?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    // status callbacks etc — ignore silently
    return jsonResponse({ ok: true, ignored: true });
  }

  const { getServiceClient } = await import('../_shared/supabase.ts');
  const { transition } = await import('../_shared/wa-state.ts');
  const { enqueue } = await import('../_shared/wa-outbox.ts');
  const { executeActions } = await import('./actions.ts');

  const sb = getServiceClient();

  for (const m of messages) {
    const from = m.from ? `+${m.from}` : null;
    if (!from) continue;

    // Check zones.active for CANTAS to inject into context
    const { data: cantasZone } = await sb.from('zones').select('active').eq('code', 'cantas').single();
    const cantasUnlocked = !!cantasZone?.active;

    // Load or create conversation
    const { data: conv } = await sb.from('wa_conversations').select('*').eq('phone', from).maybeSingle();
    const currState = (conv?.state ?? 'idle') as any;
    const currCtx = { ...(conv?.context ?? {}), phone: from, cantas_unlocked: cantasUnlocked };

    // Rate limit
    if (conv?.locked_until && new Date(conv.locked_until) > new Date()) {
      await enqueue({ phone: from, kind: 'text', payload: { body: 'Espera unos minutos. Demasiados intentos seguidos.' } });
      continue;
    }

    // Parse event from Meta message
    let ev: any;
    if (m.type === 'text') {
      ev = { type: 'text', text: m.text?.body ?? '' };
    } else if (m.type === 'interactive' && m.interactive?.button_reply) {
      ev = { type: 'button', id: m.interactive.button_reply.id };
    } else {
      ev = { type: 'text', text: '' };  // fallback to noise
    }

    const result = transition({ state: currState, context: currCtx }, ev);

    // Persist new state
    await sb.from('wa_conversations').upsert({
      phone: from,
      state: result.state,
      context: result.context,
      last_msg_at: new Date().toISOString(),
      fallback_count: result.context.fallback_count ?? 0,
      attribution: conv?.attribution ?? null,
    });

    // Execute side-effect actions (sends, order creation, staff notify)
    await executeActions(result.context, result.actions);
  }

  return jsonResponse({ ok: true });
```

- [ ] **Step 2: Create the action executor in a sibling file**

Create `supabase/functions/whatsapp-webhook/actions.ts`:

```typescript
import { enqueue } from '../_shared/wa-outbox.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import type { Action, Context } from '../_shared/wa-state.ts';

const APP_BASE = Deno.env.get('APP_BASE_URL') || 'http://localhost:8000';
const STAFF_PHONE = Deno.env.get('WA_STAFF_PHONE') || '+573106619353';

export async function executeActions(ctx: Context, actions: Action[]) {
  for (const a of actions) {
    switch (a.kind) {
      case 'send_greeting':
        await enqueue({
          phone: ctx.phone,
          kind: 'interactive',
          payload: {
            body: '¡Hola! 🎤 NEXT SHOW · Toromobolo Welc\'h + Jair Luquez\n📅 15 ago · Sabanalarga\n\n¿Quieres reservar tu entrada?',
            buttons: [{ id: 'start', title: 'Comprar entrada' }],
          },
        });
        break;

      case 'send_zone_select':
        await enqueue({
          phone: ctx.phone,
          kind: 'interactive',
          payload: {
            body: 'Elige tu localidad:\n• RISAS $75.000 (general)\n• CANTAS $100.000 (asiento)',
            buttons: [{ id: 'zone_risas', title: 'RISAS $75k' }, { id: 'zone_cantas', title: 'CANTAS $100k' }],
          },
        });
        break;

      case 'send_quantity_buttons':
        // WA limits 3 buttons per message. Send 2 messages: 1-3 and 4-5+more.
        await enqueue({
          phone: ctx.phone,
          kind: 'interactive',
          payload: {
            body: '¿Cuántas entradas?',
            buttons: [{ id: 'qty_1', title: '1' }, { id: 'qty_2', title: '2' }, { id: 'qty_3', title: '3' }],
          },
        });
        await enqueue({
          phone: ctx.phone,
          kind: 'interactive',
          payload: {
            body: '...o más:',
            buttons: [{ id: 'qty_4', title: '4' }, { id: 'qty_5', title: '5' }, { id: 'qty_more', title: '6 o más' }],
          },
        });
        break;

      case 'send_ask_name':
        await enqueue({ phone: ctx.phone, kind: 'text', payload: { body: 'Tu nombre completo?' } });
        break;
      case 'send_ask_cedula':
        await enqueue({ phone: ctx.phone, kind: 'text', payload: { body: 'Tu cédula?' } });
        break;
      case 'send_invalid_cedula':
        await enqueue({ phone: ctx.phone, kind: 'text', payload: { body: 'Cédula inválida. Sólo números (6-12 dígitos).' } });
        break;
      case 'send_ask_email':
        await enqueue({ phone: ctx.phone, kind: 'text', payload: { body: 'Email para enviarte una copia de la boleta. Escribe "saltar" si prefieres no dar email.' } });
        break;
      case 'send_invalid_email':
        await enqueue({ phone: ctx.phone, kind: 'text', payload: { body: 'Email inválido. Escribe uno correcto o "saltar".' } });
        break;

      case 'send_confirm_summary': {
        const price = ctx.zone === 'cantas' ? 100000 : (ctx.qty! >= 6 ? 70000 : 75000);
        const total = price * (ctx.qty || 1);
        await enqueue({
          phone: ctx.phone,
          kind: 'interactive',
          payload: {
            body: `Confirmar:\n👤 ${ctx.name} · CC ${ctx.cedula}\n🎟 ${ctx.qty} x ${ctx.zone?.toUpperCase()} = $${total.toLocaleString('es-CO')}\n⏱ 15 min para pagar`,
            buttons: [{ id: 'pay', title: 'PAGAR' }],
          },
        });
        break;
      }

      case 'create_order':
        await invokeCreateOrder(ctx);
        break;

      case 'send_payment_link': {
        const sb = getServiceClient();
        const { data: o } = await sb.from('orders').select('wompi_reference').eq('id', ctx.order_id).single();
        const link = `${Deno.env.get('WOMPI_CHECKOUT_BASE') || 'https://checkout.wompi.co/l/'}${o?.wompi_reference ?? ''}`;
        await enqueue({ phone: ctx.phone, kind: 'text', payload: { body: `Pagar aquí 👉 ${link}\nVence en 15 min.` } });
        break;
      }

      case 'send_paid_confirmation':
        // Triggered separately by wompi-webhook → send-ticket. Nothing to do here.
        break;

      case 'send_expired_msg':
        await enqueue({ phone: ctx.phone, kind: 'text', payload: { body: 'Tu reserva expiró. Escribe "inicio" para empezar otra vez.' } });
        break;

      case 'send_group_intake':
        await enqueue({ phone: ctx.phone, kind: 'text', payload: { body: 'Para grupos de 6+ tenemos precio especial $70.000 c/u. Un asesor te contactará en minutos. Por favor escribe tu nombre y cuántas entradas.' } });
        break;

      case 'notify_staff':
        await enqueue({
          phone: STAFF_PHONE,
          kind: 'text',
          payload: { body: `[NEXT SHOW · ${a.reason.toUpperCase()}] cliente: ${ctx.phone}\nctx: ${JSON.stringify(ctx).slice(0,300)}` },
        });
        break;

      case 'send_recover_prompt':
        await enqueue({ phone: ctx.phone, kind: 'text', payload: { body: 'Para recuperar tu boleta escribe tu cédula.' } });
        break;

      case 'send_fallback':
        await enqueue({ phone: ctx.phone, kind: 'text', payload: { body: 'No entendí 😅 Escribe "inicio" para volver al menú o "ayuda" para hablar con asesor.' } });
        break;

      case 'send_takeover_silent':
        // No-op; just suppress bot output.
        break;

      case 'send_cantas_upsell_picker':
        // Handled in cantas-cross-sell flow Phase 4.
        break;
    }
  }
}

async function invokeCreateOrder(ctx: Context) {
  const sb = getServiceClient();
  // Resolve event + zone
  const { data: zone } = await sb.from('zones').select('id, event_id').eq('code', ctx.zone || 'risas').single();
  if (!zone) throw new Error('zone not found');

  // For RISAS general we don't pre-pick seats; for CANTAS we'd need seat picker (Phase 4).
  // For Phase 1 we only support RISAS quantity.
  const phone10 = ctx.phone.replace(/\D/g, '').slice(-10);  // strip +57

  // Call create-order edge function via internal HTTP (so its logic, validations, signature, all stay in one place)
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/create-order`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      'x-internal-source': 'whatsapp-webhook',
    },
    body: JSON.stringify({
      zone_code: ctx.zone,
      quantity: ctx.qty,
      buyer: {
        name: ctx.name,
        id_number: ctx.cedula,
        phone: phone10,
        email: ctx.email || `wa_${phone10}@noemail.local`,  // synthetic email if skipped
      },
      attribution: {},
      _wa_phone: ctx.phone,    // marker
      _hold_minutes: 15,
    }),
  });
  if (!r.ok) {
    await enqueue({ phone: ctx.phone, kind: 'text', payload: { body: 'No se pudo crear tu reserva. Intenta en un momento.' } });
    return;
  }
  const { order_id, wompi_reference } = await r.json();
  // Persist order_id in conversation context
  await sb.from('wa_conversations').update({
    context: { ...ctx, order_id },
  }).eq('phone', ctx.phone);

  // Now send link
  const link = `${Deno.env.get('WOMPI_CHECKOUT_BASE') || 'https://checkout.wompi.co/l/'}${wompi_reference}`;
  await enqueue({ phone: ctx.phone, kind: 'text', payload: { body: `Pagar aquí 👉 ${link}\nVence en 15 min.` } });
}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/whatsapp-webhook/
git commit -m "feat(fn): whatsapp-webhook POST routes inbound to state machine + executes actions"
```

---

### Task 13: Extend create-order to accept WA-flow inputs

**Files:**
- Modify: `supabase/functions/create-order/index.ts`

- [ ] **Step 1: Update CreateOrderRequest + skip turnstile for internal calls + accept hold_minutes**

Add to the imports/types in `supabase/functions/create-order/index.ts`:

```typescript
interface CreateOrderRequest {
  zone_code: string;
  seat_ids?: string[];
  quantity?: number;
  buyer: { name: string; id_number: string; phone: string; email: string };
  coupon_code?: string;
  attribution?: Record<string, string>;
  turnstile_token?: string;
  _wa_phone?: string;       // internal WA flow marker
  _hold_minutes?: number;   // override default hold
}
```

Inside `Deno.serve`, after rate-limit, add:

```typescript
    const isInternal = req.headers.get('x-internal-source') === 'whatsapp-webhook'
                       && req.headers.get('authorization') === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;

    // Skip turnstile when called by trusted internal source
    if (!isInternal && Deno.env.get('TURNSTILE_SECRET') !== '1x0000000000000000000000000000000AA') {
      if (!(await verifyTurnstile(body.turnstile_token || ''))) throw ERR.VALIDATION('turnstile');
    }
```

After computing total price (where current code does pricing), use `calc_price`:

```typescript
    // Use DB pricing function for volume discount
    const { data: priceRes } = await sb.rpc('calc_price', { p_zone_id: zone.id, p_qty: quantity });
    const subtotal_cop = priceRes ?? (zone.price_cop * quantity);
```

When inserting the order row, add `wa_phone` and `expires_at`:

```typescript
    const expires_at = new Date(Date.now() + (body._hold_minutes ?? 10) * 60_000).toISOString();
    // ...
    .insert({
      // ...existing fields...
      wa_phone: body._wa_phone ?? null,
      is_group: (quantity ?? 0) >= 6 && zone.code === 'risas',
      expires_at,
    })
```

(The exact patch depends on existing code; the agent should locate the order-insert call and modify it.)

- [ ] **Step 2: Re-run create-order integration test**

```bash
npm test -- tests/integration/create-order.test.ts
```
Expected: pass (no regression).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/create-order/index.ts
git commit -m "feat(fn): create-order accepts internal WA marker, uses calc_price, configurable hold"
```

---

### Task 13b: Oversell guard inside create-order

**Files:**
- Modify: `supabase/functions/create-order/index.ts`
- Create: `tests/integration/oversell-guard.test.ts`

Spec §3 requires `create-order` to reject new RISAS orders once `paid + holding >= capacity + oversell`. Existing function does not enforce this. Add it now.

- [ ] **Step 1: Write failing test**

Create `tests/integration/oversell-guard.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(SB_URL, SVC);

async function callCreate(qty: number, cedula: string) {
  const r = await fetch(`${SB_URL}/functions/v1/create-order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-source': 'whatsapp-webhook',
      Authorization: `Bearer ${SVC}`,
    },
    body: JSON.stringify({
      zone_code: 'risas', quantity: qty,
      buyer: { name: 'T', id_number: cedula, phone: '3001112222', email: 't@x.co' },
      _wa_phone: `+5730099${cedula.slice(-5)}`, _hold_minutes: 15,
    }),
  });
  return { ok: r.ok, status: r.status, body: await r.json() };
}

describe('oversell guard RISAS', () => {
  beforeAll(async () => {
    // Wipe pending/holding orders for risas to start clean
    await sb.from('orders').delete().like('buyer_id_number', 'OS%');
  });

  it('blocks order when total holding + paid >= 350 (300 + 50)', async () => {
    // Pre-fill: insert 350 holding (status=pending, not expired)
    const { data: zone } = await sb.from('zones').select('id, event_id').eq('code', 'risas').single();
    const rows = Array.from({ length: 350 }, (_, i) => ({
      event_id: zone!.event_id, zone_id: zone!.id,
      buyer_name: 'OS', buyer_id_number: `OS${String(i).padStart(8,'0')}`,
      buyer_phone: '3001112222', buyer_email: 'o@x.co', quantity: 1,
      subtotal_cop: 75000, total_cop: 75000,
      wompi_reference: `OS-${i}`, status: 'pending',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    }));
    await sb.from('orders').insert(rows);
    const res = await callCreate(1, 'OS99999999');
    expect(res.ok).toBe(false);
    expect(res.body.error || res.body.code).toMatch(/SOLD_OUT|CAPACITY/i);
  });
});
```

- [ ] **Step 2: Run, expect FAIL (no guard yet)**

```bash
SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o env | grep SERVICE_ROLE_KEY | cut -d= -f2-) npm test -- tests/integration/oversell-guard.test.ts
```
Expected: test fails (current create-order returns 200).

- [ ] **Step 3: Implement guard**

In `supabase/functions/create-order/index.ts`, after loading the zone and before inserting the order:

```typescript
    // Oversell guard: count current paid + active pending vs capacity + oversell
    const { count: paidCount } = await sb.from('orders').select('*', { count: 'exact', head: true })
      .eq('zone_id', zone.id).eq('status', 'paid');
    const { count: holdingCount } = await sb.from('orders').select('*', { count: 'exact', head: true })
      .eq('zone_id', zone.id).eq('status', 'pending').gt('expires_at', new Date().toISOString());
    const totalReserved = (paidCount ?? 0) + (holdingCount ?? 0);
    const cap = zone.capacity + (zone.oversell ?? 0);
    if (totalReserved + (quantity ?? 1) > cap) {
      throw new AppError('SOLD_OUT', 409, `Zona ${zone.code} agotada (${totalReserved}/${cap})`);
    }
```

(For CANTAS, since each ticket holds a unique seat row via `seat_holds`, the seat-hold uniqueness already enforces capacity per seat; this guard is a defense in depth.)

- [ ] **Step 4: Run test, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/create-order/index.ts tests/integration/oversell-guard.test.ts
git commit -m "feat(fn): create-order rejects when zone capacity+oversell reached"
```

---

### Task 14: Integration test — RISAS happy path

**Files:**
- Create: `tests/integration/whatsapp-happy-path.test.ts`

- [ ] **Step 1: Write end-to-end happy path test**

Create `tests/integration/whatsapp-happy-path.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FN_BASE = `${SB_URL}/functions/v1`;
const PHONE = '+573009998877';

const sb = createClient(SB_URL, SVC);

async function postWebhook(msg: any) {
  return await fetch(`${FN_BASE}/whatsapp-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entry: [{ changes: [{ value: { messages: [msg] } }] }],
    }),
  });
}

async function readState() {
  const { data } = await sb.from('wa_conversations').select('state, context').eq('phone', PHONE).single();
  return data;
}

async function lastOutboxForPhone() {
  const { data } = await sb.from('wa_outbox').select('*').eq('phone', PHONE)
    .order('created_at', { ascending: false }).limit(1).single();
  return data;
}

describe('WA happy path RISAS', () => {
  beforeAll(async () => {
    await sb.from('wa_outbox').delete().eq('phone', PHONE);
    await sb.from('wa_conversations').delete().eq('phone', PHONE);
  });

  it('text "hola" advances to greet and enqueues greeting interactive', async () => {
    await postWebhook({ from: PHONE.slice(1), type: 'text', text: { body: 'hola' } });
    expect((await readState())?.state).toBe('greet');
    expect((await lastOutboxForPhone()).kind).toBe('interactive');
  });

  it('button "start" → quantity (no CANTAS unlock by default)', async () => {
    await postWebhook({ from: PHONE.slice(1), type: 'interactive', interactive: { button_reply: { id: 'start', title: 'Comprar' } } });
    expect((await readState())?.state).toBe('quantity');
  });

  it('button qty_2 → buyer_name', async () => {
    await postWebhook({ from: PHONE.slice(1), type: 'interactive', interactive: { button_reply: { id: 'qty_2', title: '2' } } });
    expect((await readState())?.state).toBe('buyer_name');
  });

  it('text "Juan Pérez" → buyer_cedula', async () => {
    await postWebhook({ from: PHONE.slice(1), type: 'text', text: { body: 'Juan Pérez' } });
    const s = await readState();
    expect(s?.state).toBe('buyer_cedula');
    expect(s?.context.name).toBe('Juan Pérez');
  });

  it('text "1234567890" → email_opt', async () => {
    await postWebhook({ from: PHONE.slice(1), type: 'text', text: { body: '1234567890' } });
    expect((await readState())?.state).toBe('email_opt');
  });

  it('text "saltar" → confirm', async () => {
    await postWebhook({ from: PHONE.slice(1), type: 'text', text: { body: 'saltar' } });
    expect((await readState())?.state).toBe('confirm');
  });

  it('button "pay" → payment_pending and order_id appears in context', async () => {
    await postWebhook({ from: PHONE.slice(1), type: 'interactive', interactive: { button_reply: { id: 'pay', title: 'PAGAR' } } });
    const s = await readState();
    expect(s?.state).toBe('payment_pending');
    expect(s?.context.order_id).toBeTruthy();
    // Last outbox should be a text with Wompi link
    const last = await lastOutboxForPhone();
    expect(last.kind).toBe('text');
    expect(last.payload.body).toMatch(/Pagar aquí/);
  });
});
```

- [ ] **Step 2: Run test, expect all pass**

```bash
SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o env | grep SERVICE_ROLE_KEY | cut -d= -f2-) npm test -- tests/integration/whatsapp-happy-path.test.ts
```
Expected: 7/7 pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/whatsapp-happy-path.test.ts
git commit -m "test(integration): WA happy path from 'hola' to Wompi link"
```

---

### Task 15: Wire wompi-webhook → reset conversation to "paid"

**Files:**
- Modify: `supabase/functions/wompi-webhook/index.ts`

- [ ] **Step 1: After successful ticket insert + status='paid', update conversation**

Inside `wompi-webhook/index.ts`, after the order's status is updated to 'paid' and `send-ticket` is invoked, append:

```typescript
    // If this order came from WA, update conversation state
    if (order.wa_phone) {
      await sb.from('wa_conversations').update({
        state: 'paid',
        last_msg_at: new Date().toISOString(),
      }).eq('phone', order.wa_phone);
    }
```

- [ ] **Step 2: Re-run wompi webhook idempotency test**

```bash
npm test -- tests/integration/webhook-idempotency.test.ts
```
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/wompi-webhook/index.ts
git commit -m "feat(fn): wompi-webhook flips wa_conversations.state to 'paid' on confirmed payment"
```

---

## Phase 2 — Outbound delivery (QR via WA)

### Task 16: send-ticket — deliver QR via WA primary, email fallback

**Files:**
- Modify: `supabase/functions/send-ticket/index.ts`

- [ ] **Step 1: After QR generation, upload to storage and enqueue WA image**

Inside the ticket loop in `supabase/functions/send-ticket/index.ts`, after generating `qrPng` and `pdfBytes`, upload QR to storage and enqueue WA send:

```typescript
import { enqueue } from '../_shared/wa-outbox.ts';

// inside the loop, after pdfBytes generation:
// Upload QR PNG to public-readable storage (or signed URL good for 30 days)
const qrPath = `qr/${t.ticket_code}.png`;
await sb.storage.from('tickets').upload(qrPath, qrPng, { contentType: 'image/png', upsert: true });
const { data: signed } = await sb.storage.from('tickets').createSignedUrl(qrPath, 60 * 60 * 24 * 30);

if (order.wa_phone) {
  await enqueue({
    phone: order.wa_phone,
    kind: 'image',
    payload: {
      url: signed!.signedUrl,
      caption: `✅ Pago confirmado · NEXT SHOW\n🎟 Boleta ${i}/${tickets!.length} · ${order.zones.name}${seatLabel ? ' · ' + seatLabel : ''}\n📅 ${eventDate}\n👥 Asigna nombres: ${baseUrl}/asignar.html?o=${order.id}&token=${await signToken(Deno.env.get('TOKEN_SECRET')!, order.id)}`,
    },
  });
} else if (order.buyer_email && !order.buyer_email.endsWith('@noemail.local')) {
  // existing email send (already in code) acts as fallback
  await sendEmail(...);
}
```

(Adapt to existing structure — preserve current email path when no WA phone.)

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/send-ticket/index.ts
git commit -m "feat(fn): send-ticket delivers QR via WA primary, email when no wa_phone"
```

---

### Task 17: pg_cron — schedule outbox worker

**Files:**
- Create: `supabase/migrations/20260517000002_wa_pg_cron.sql`

- [ ] **Step 1: Schedule worker every minute (idempotent)**

Create `supabase/migrations/20260517000002_wa_pg_cron.sql`:

```sql
-- ============================================================
-- NEXT SHOW · WA pg_cron schedules
-- Migration 20260517000002
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Drain WA outbox every minute via HTTP call to edge function
    -- pg_net or pg_cron http calls require setup; for sandbox/local we use a no-op fallback.
    -- In production, configure a small worker via Supabase's "Scheduled Functions" UI or
    -- a netlify cron that hits /functions/v1/wa-outbox-worker.
    RAISE NOTICE 'wa_outbox worker should be scheduled via Supabase Scheduled Functions or external cron pinging /functions/v1/wa-outbox-worker';
  END IF;
END $$;
```

> **Note:** Supabase doesn't natively support pg_cron → http out of the box. The plan documents schedule but actual scheduling is configured via Supabase Dashboard "Scheduled Functions" or a Netlify scheduled function. See Task 31 for the README documentation.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260517000002_wa_pg_cron.sql
git commit -m "docs(db): note WA outbox scheduling requirement"
```

---

### Task 18: Smoke test outbox end-to-end with mock token

**Files:**
- (no new files, manual verification)

- [ ] **Step 1: Force-fail one outbox row to see retry**

With env `WA_CLOUD_TOKEN=mock`, run the happy path test (Task 14). Verify all enqueued rows transition to `status='sent'` after a manual worker invocation:

```bash
curl -X POST http://localhost:54321/functions/v1/wa-outbox-worker -H "Authorization: Bearer $(supabase status -o env | grep ANON_KEY | cut -d= -f2-)"
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -c "SELECT status, count(*) FROM wa_outbox GROUP BY status;"
```
Expected: `sent` count matches enqueued.

- [ ] **Step 2: Commit (no code changes; documentation only — skip)**

---

### Task 19: get-order-status — lookup by cedula

**Files:**
- Modify: `supabase/functions/get-order-status/index.ts`

- [ ] **Step 1: Add lookup-by-cedula branch**

Inside `get-order-status/index.ts`, add:

```typescript
const buyer_id_number = url.searchParams.get('cedula') || body?.cedula;
const buyer_phone     = url.searchParams.get('phone')  || body?.phone;

if (buyer_id_number) {
  const { data, error } = await sb.from('orders')
    .select('id, order_number, status, wompi_reference, buyer_name')
    .eq('buyer_id_number', buyer_id_number)
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return jsonResponse({ error: 'NOT_FOUND' }, 404);
  return jsonResponse(data);
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/get-order-status/index.ts
git commit -m "feat(fn): get-order-status supports cedula lookup for recover-QR"
```

---

## Phase 3 — Branches: group, recover, fallback, anti-abuse, human takeover

### Task 20: Group handoff — operator-handoff edge function

**Files:**
- Create: `supabase/functions/operator-handoff/index.ts`

- [ ] **Step 1: Create endpoint for staff to claim a group conversation**

Create `supabase/functions/operator-handoff/index.ts`:

```typescript
import { getServiceClient } from '../_shared/supabase.ts';
import { preflight, jsonResponse } from '../_shared/cors.ts';
import { verifyToken } from '../_shared/signing.ts';

// POST { phone, action: 'take' | 'release' }
Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  if (req.method !== 'POST') return jsonResponse({ error: 'METHOD' }, 405);

  // Auth: admin token from admin-auth flow
  const auth = req.headers.get('authorization')?.replace('Bearer ', '') || '';
  const payload = await verifyToken(Deno.env.get('ADMIN_TOKEN_SECRET')!, auth);
  if (!payload) return jsonResponse({ error: 'UNAUTHORIZED' }, 401);

  const body = await req.json() as { phone: string; action: 'take' | 'release' };
  const sb = getServiceClient();
  const newState = body.action === 'take' ? 'human_takeover' : 'greet';
  const { error } = await sb.from('wa_conversations').update({
    state: newState,
    last_msg_at: new Date().toISOString(),
  }).eq('phone', body.phone);
  if (error) return jsonResponse({ error: 'UPDATE_FAILED' }, 500);

  return jsonResponse({ ok: true, phone: body.phone, state: newState });
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/operator-handoff/index.ts
git commit -m "feat(fn): operator-handoff toggles human_takeover state"
```

---

### Task 21: Recover-QR handler

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/actions.ts`

- [ ] **Step 1: Add recover_qr response logic and cedula handler in state machine**

In `actions.ts` change the `send_recover_prompt` action to set context so the next text triggers lookup. Easier: expand state machine to handle the recover flow as a substate.

For simplicity at this stage, handle recover-QR inline in the webhook's POST handler before calling state machine:

In `supabase/functions/whatsapp-webhook/index.ts`, before calling `transition`, add:

```typescript
    // If conversation is in recover_qr and incoming is text → attempt cedula lookup
    if (currState === 'recover_qr' && ev.type === 'text') {
      const cedula = ev.text.replace(/\D/g, '');
      if (/^\d{6,12}$/.test(cedula)) {
        const lookup = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/get-order-status?cedula=${cedula}`, {
          headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        });
        if (lookup.ok) {
          const { id } = await lookup.json();
          // Re-trigger send-ticket which will re-enqueue the QR
          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-ticket`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
            body: JSON.stringify({ order_id: id }),
          });
          await sb.from('wa_conversations').update({ state: 'paid' }).eq('phone', from);
        } else {
          const { enqueue } = await import('../_shared/wa-outbox.ts');
          await enqueue({ phone: from, kind: 'text', payload: { body: 'No encontramos una boleta con esa cédula. Verifica o escribe "ayuda".' } });
        }
        continue;  // skip normal transition for this message
      }
    }
```

- [ ] **Step 2: Add integration test**

Create `tests/integration/whatsapp-recover-qr.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FN_BASE = `${SB_URL}/functions/v1`;
const PHONE = '+573008887766';
const CEDULA = '987654321';

const sb = createClient(SB_URL, SVC);

async function post(msg: any) {
  return await fetch(`${FN_BASE}/whatsapp-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry: [{ changes: [{ value: { messages: [msg] } }] }] }),
  });
}

describe('WA recover QR', () => {
  beforeAll(async () => {
    await sb.from('wa_outbox').delete().eq('phone', PHONE);
    await sb.from('wa_conversations').delete().eq('phone', PHONE);
    await sb.from('orders').delete().eq('buyer_id_number', CEDULA);
    // Seed a paid order for cedula
    const { data: zone } = await sb.from('zones').select('id, event_id').eq('code', 'risas').single();
    await sb.from('orders').insert({
      event_id: zone!.event_id, zone_id: zone!.id,
      buyer_name: 'Recover Test', buyer_id_number: CEDULA, buyer_phone: '3001112222',
      buyer_email: 'r@x.co', quantity: 1, subtotal_cop: 75000, total_cop: 75000,
      wompi_reference: 'TEST-RECOVER-1', status: 'paid', wa_phone: PHONE,
    });
  });

  it('"mi boleta" → recover_qr → "987654321" → re-trigger send-ticket', async () => {
    await post({ from: PHONE.slice(1), type: 'text', text: { body: 'mi boleta' } });
    const { data: s1 } = await sb.from('wa_conversations').select('state').eq('phone', PHONE).single();
    expect(s1?.state).toBe('recover_qr');

    await post({ from: PHONE.slice(1), type: 'text', text: { body: CEDULA } });
    const { data: s2 } = await sb.from('wa_conversations').select('state').eq('phone', PHONE).single();
    expect(s2?.state).toBe('paid');
  });
});
```

- [ ] **Step 3: Run, expect pass**

```bash
SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o env | grep SERVICE_ROLE_KEY | cut -d= -f2-) npm test -- tests/integration/whatsapp-recover-qr.test.ts
```
Expected: 1/1 pass.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/whatsapp-webhook/index.ts tests/integration/whatsapp-recover-qr.test.ts
git commit -m "feat(fn): recover-QR flow re-triggers send-ticket from cedula"
```

---

### Task 22: Anti-abuse — rate limit + active order check

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/index.ts`

- [ ] **Step 1: Add rate limit check on greet entry**

Before calling `transition`, add:

```typescript
    // Greet rate-limit: 5/hour
    if (ev.type === 'text' && !['mi boleta','qr','ayuda','humano','menu','inicio'].some(w => ev.text.toLowerCase().includes(w))) {
      const { data: recent } = await sb.from('wa_conversations')
        .select('locked_until').eq('phone', from).maybeSingle();
      if (recent?.locked_until && new Date(recent.locked_until) > new Date()) {
        continue;  // silently drop
      }
    }
```

After `transition`, if result is `greet`, check the 5/hour cap via a count of conversations rows (or a simpler in-memory store). For correctness, add a counter column or simply rely on persisted `last_msg_at` deltas.

Simplest implementation: track via `context.greet_count_window`:

```typescript
    if (result.state === 'greet') {
      const count = (result.context as any).greet_count_window || 0;
      const windowStart = (result.context as any).greet_window_start || 0;
      const now = Date.now();
      const newWindow = now - windowStart > 3600_000;
      const newCount = newWindow ? 1 : count + 1;
      if (!newWindow && newCount > 5) {
        await sb.from('wa_conversations').update({
          locked_until: new Date(now + 30 * 60_000).toISOString(),
        }).eq('phone', from);
        result.actions = [];  // silence
      }
      (result.context as any).greet_count_window = newWindow ? 1 : newCount;
      (result.context as any).greet_window_start = newWindow ? now : windowStart;
    }
```

- [ ] **Step 2: Active-order check in confirm/pay step**

In `actions.ts` `invokeCreateOrder`, before calling create-order, check for active order:

```typescript
  const { data: active } = await sb.from('orders').select('id, wompi_reference')
    .eq('buyer_id_number', ctx.cedula!).in('status', ['pending']).gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (active) {
    const link = `${Deno.env.get('WOMPI_CHECKOUT_BASE') || 'https://checkout.wompi.co/l/'}${active.wompi_reference}`;
    await enqueue({ phone: ctx.phone, kind: 'text', payload: { body: `Ya tienes una reserva activa. Paga aquí 👉 ${link}` } });
    return;
  }
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/whatsapp-webhook/
git commit -m "feat(fn): rate-limit greets to 5/hour + reject duplicate active order by cedula"
```

---

### Task 23: Group handoff — staff confirmation closes order manually

**Files:**
- Modify: `public/admin.html` (preview only, full UI in Task 31)
- Modify: `supabase/functions/whatsapp-webhook/actions.ts`

- [ ] **Step 1: Inside group_handoff action, persist a pending order with is_group=true and status='manual_review'**

Update `send_group_intake` action and follow-up text capture by introducing a substate. For Phase 3 minimum, persist a row in `orders` with `is_group=true, status='manual_review', quantity=null` and let admin pick it up.

Modify `executeActions` `notify_staff` for `reason=='group'`:

```typescript
      case 'notify_staff':
        if (a.reason === 'group') {
          // Insert a manual_review order placeholder so admin can act
          const sb = getServiceClient();
          const { data: zone } = await sb.from('zones').select('id, event_id').eq('code', 'risas').single();
          await sb.from('orders').insert({
            event_id: zone!.event_id, zone_id: zone!.id,
            buyer_name: ctx.name ?? '(grupo)',
            buyer_id_number: ctx.cedula ?? 'PENDING',
            buyer_phone: ctx.phone.replace(/\D/g,'').slice(-10),
            buyer_email: `wa_${ctx.phone}@noemail.local`,
            quantity: ctx.qty ?? 0,
            subtotal_cop: 0, total_cop: 0,
            status: 'manual_review', is_group: true, wa_phone: ctx.phone,
            wompi_reference: `GROUP-${Date.now()}`,
          });
        }
        await enqueue({ phone: STAFF_PHONE, kind: 'text', payload: { body: `[NEXT SHOW · ${a.reason.toUpperCase()}] cliente: ${ctx.phone}\nctx: ${JSON.stringify(ctx).slice(0,300)}` } });
        break;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/whatsapp-webhook/actions.ts
git commit -m "feat(fn): group handoff persists manual_review order for admin pickup"
```

---

### Task 24: Integration test — group handoff

**Files:**
- Create: `tests/integration/whatsapp-group-handoff.test.ts`

- [ ] **Step 1: Test ≥6 branch creates manual_review order + staff notification**

Create `tests/integration/whatsapp-group-handoff.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FN_BASE = `${SB_URL}/functions/v1`;
const PHONE = '+573007776655';
const STAFF = process.env.WA_STAFF_PHONE || '+573106619353';
const sb = createClient(SB_URL, SVC);

async function post(msg: any) {
  return await fetch(`${FN_BASE}/whatsapp-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry: [{ changes: [{ value: { messages: [msg] } }] }] }),
  });
}

describe('WA group handoff', () => {
  beforeAll(async () => {
    await sb.from('wa_outbox').delete().eq('phone', PHONE);
    await sb.from('wa_outbox').delete().eq('phone', STAFF);
    await sb.from('wa_conversations').delete().eq('phone', PHONE);
    await sb.from('orders').delete().eq('wa_phone', PHONE);
  });

  it('flow text→start→qty_more leads to group_handoff with manual_review order', async () => {
    await post({ from: PHONE.slice(1), type: 'text', text: { body: 'hola' } });
    await post({ from: PHONE.slice(1), type: 'interactive', interactive: { button_reply: { id: 'start', title: 'X' } } });
    await post({ from: PHONE.slice(1), type: 'interactive', interactive: { button_reply: { id: 'qty_more', title: '6+' } } });

    const { data: conv } = await sb.from('wa_conversations').select('state').eq('phone', PHONE).single();
    expect(conv?.state).toBe('group_handoff');

    const { data: order } = await sb.from('orders').select('is_group, status').eq('wa_phone', PHONE).single();
    expect(order?.is_group).toBe(true);
    expect(order?.status).toBe('manual_review');

    const { data: staffMsg } = await sb.from('wa_outbox').select('payload').eq('phone', STAFF)
      .order('created_at', { ascending: false }).limit(1).single();
    expect(staffMsg?.payload.body).toMatch(/GROUP/);
  });
});
```

- [ ] **Step 2: Run, expect pass**

```bash
SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o env | grep SERVICE_ROLE_KEY | cut -d= -f2-) npm test -- tests/integration/whatsapp-group-handoff.test.ts
```
Expected: 1/1 pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/whatsapp-group-handoff.test.ts
git commit -m "test(integration): group handoff creates manual_review order + notifies staff"
```

---

## Phase 4 — CANTAS unlock + cross-sell

### Task 25: zone_select honors zones.active

(Already implemented in Task 12 via `cantasUnlocked` flag injection.) Verify and add explicit test.

**Files:**
- Create: `tests/integration/cantas-unlock.test.ts`

- [ ] **Step 1: Write test that flips zones.active=true and asserts greet shows zone_select**

Create `tests/integration/cantas-unlock.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FN_BASE = `${SB_URL}/functions/v1`;
const PHONE = '+573006665544';
const sb = createClient(SB_URL, SVC);

describe('CANTAS unlock affects flow', () => {
  beforeAll(async () => {
    await sb.from('zones').update({ active: true }).eq('code', 'cantas');
    await sb.from('wa_conversations').delete().eq('phone', PHONE);
  });
  afterAll(async () => {
    await sb.from('zones').update({ active: false }).eq('code', 'cantas');
  });

  it('with CANTAS active, button start → zone_select', async () => {
    await fetch(`${FN_BASE}/whatsapp-webhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: PHONE.slice(1), type: 'text', text: { body: 'hola' } }] } }] }] }),
    });
    await fetch(`${FN_BASE}/whatsapp-webhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: PHONE.slice(1), type: 'interactive', interactive: { button_reply: { id: 'start', title: 'X' } } }] } }] }] }),
    });
    const { data } = await sb.from('wa_conversations').select('state').eq('phone', PHONE).single();
    expect(data?.state).toBe('zone_select');
  });
});
```

- [ ] **Step 2: Run, expect pass**

- [ ] **Step 3: Commit**

```bash
git add tests/integration/cantas-unlock.test.ts
git commit -m "test(integration): CANTAS unlock routes greet → zone_select"
```

---

### Task 26: cantas-cross-sell edge function

**Files:**
- Create: `supabase/functions/cantas-cross-sell/index.ts`

- [ ] **Step 1: Flip CANTAS active=true and enqueue upsell template per RISAS buyer**

Create `supabase/functions/cantas-cross-sell/index.ts`:

```typescript
import { getServiceClient } from '../_shared/supabase.ts';
import { jsonResponse } from '../_shared/cors.ts';
import { enqueue } from '../_shared/wa-outbox.ts';

Deno.serve(async (_req) => {
  const sb = getServiceClient();

  // 1. Activate CANTAS if not already
  await sb.from('zones').update({ active: true }).eq('code', 'cantas');

  // 2. Find RISAS paid orders that haven't been pinged
  const { data: orders } = await sb.from('orders')
    .select('id, wa_phone, buyer_name, quantity, zones!inner(code)')
    .eq('status', 'paid')
    .eq('zones.code', 'risas')
    .is('cantas_upsell_sent_at', null)
    .not('wa_phone', 'is', null);

  let enqueued = 0;
  for (const o of orders ?? []) {
    if (!o.wa_phone) continue;
    await enqueue({
      phone: o.wa_phone,
      kind: 'template',
      payload: {
        name: 'cantas_upsell',
        params: [o.buyer_name, String(o.quantity)],
      },
    });
    await sb.from('orders').update({ cantas_upsell_sent_at: new Date().toISOString() }).eq('id', o.id);
    enqueued++;
  }

  return jsonResponse({ ok: true, enqueued });
});
```

- [ ] **Step 2: Commit (manual integration verified by Task 27)**

```bash
git add supabase/functions/cantas-cross-sell/index.ts
git commit -m "feat(fn): cantas-cross-sell flips zone + enqueues template per RISAS buyer"
```

---

### Task 27: CANTAS upsell click flow

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/actions.ts`
- Modify: `supabase/functions/_shared/wa-state.ts`

- [ ] **Step 1: Add button id "upsell_yes" handler — sends user to asignar.html with upgrade marker**

In `wa-state.ts`, add a new transition handler for `paid` state on `button` event:

```typescript
    case 'paid': {
      if (ev.type === 'button' && ev.id === 'upsell_yes') {
        return { state: 'cantas_upsell', context: curr.context, actions: [{ kind: 'send_cantas_upsell_picker' }] };
      }
      return { state: curr.state, context: curr.context, actions: [] };
    }
```

In `actions.ts`, replace `send_cantas_upsell_picker` body:

```typescript
      case 'send_cantas_upsell_picker': {
        const sb = getServiceClient();
        const { data: o } = await sb.from('orders').select('id').eq('wa_phone', ctx.phone).eq('status', 'paid').order('created_at', { ascending: false }).limit(1).single();
        if (!o) break;
        const { signToken } = await import('../_shared/signing.ts');
        const token = await signToken(Deno.env.get('TOKEN_SECRET')!, `upgrade:${o.id}`);
        const url = `${APP_BASE}/asignar.html?o=${o.id}&token=${token}&upgrade=cantas`;
        await enqueue({ phone: ctx.phone, kind: 'text', payload: { body: `Elige tu asiento CANTAS aquí 👉 ${url}\nDespués vuelves al chat para pagar el diferencial ($25.000 por boleta).` } });
        break;
      }
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/wa-state.ts supabase/functions/whatsapp-webhook/actions.ts
git commit -m "feat(fn): CANTAS upsell click → seat picker link with upgrade flag"
```

> **Note:** The diff-payment flow (collecting $25k upgrade payment, converting RISAS tickets to CANTAS with assigned seats) is intentionally deferred to a follow-up plan. v1 ships the picker link; staff confirms upgrade manually using existing wompi link creation.

---

## Phase 5 — Reminders

### Task 28: reminder-tick edge function

**Files:**
- Create: `supabase/functions/reminder-tick/index.ts`

- [ ] **Step 1: Compute days to event, fire correct template**

Create `supabase/functions/reminder-tick/index.ts`:

```typescript
import { getServiceClient } from '../_shared/supabase.ts';
import { jsonResponse } from '../_shared/cors.ts';
import { enqueue } from '../_shared/wa-outbox.ts';

Deno.serve(async (_req) => {
  const sb = getServiceClient();
  const { data: ev } = await sb.from('events').select('*').eq('slug', 'nextshow-torombolo-jair-2026').single();
  if (!ev) return jsonResponse({ error: 'no event' }, 404);

  const eventDate = new Date(ev.event_date);
  const now = new Date();
  const daysOut = Math.round((eventDate.getTime() - now.getTime()) / 86_400_000);
  const hoursOut = Math.round((eventDate.getTime() - now.getTime()) / 3_600_000);

  let template: string | null = null;
  if (daysOut === 3)  template = 'reminder_t3';
  else if (daysOut === 1) template = 'reminder_t1';
  else if (daysOut === 0 && hoursOut <= 3 && hoursOut > 0) template = 'reminder_day';

  if (!template) return jsonResponse({ ok: true, no_template: true, daysOut, hoursOut });

  // Find all paid orders with WA, not yet reminded with this template (tracked via context)
  const { data: orders } = await sb.from('orders')
    .select('id, wa_phone, buyer_name').eq('status', 'paid').not('wa_phone', 'is', null);

  let enqueued = 0;
  for (const o of orders ?? []) {
    await enqueue({
      phone: o.wa_phone!,
      kind: 'template',
      payload: { name: template, params: [o.buyer_name] },
    });
    enqueued++;
  }
  return jsonResponse({ ok: true, template, enqueued });
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/reminder-tick/index.ts
git commit -m "feat(fn): reminder-tick fires T-3/T-1/day-of WA templates"
```

> **Scheduling:** configure Supabase Scheduled Function or Netlify cron to hit this endpoint daily at 9am Bogota.

---

### Task 29: Anti-double-reminder guard

**Files:**
- Modify: `supabase/functions/reminder-tick/index.ts`
- Modify: `supabase/migrations/20260517000001_whatsapp_checkout.sql`

- [ ] **Step 1: Add a sent-reminders log column or table**

Append migration:

```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reminders_sent text[] NOT NULL DEFAULT '{}'::text[];
```

In `reminder-tick`, filter:

```typescript
  for (const o of orders ?? []) {
    if ((o.reminders_sent ?? []).includes(template)) continue;
    await enqueue({...});
    await sb.from('orders').update({ reminders_sent: [...(o.reminders_sent ?? []), template] }).eq('id', o.id);
    enqueued++;
  }
```

- [ ] **Step 2: Reset DB + verify column exists**

```bash
supabase db reset
psql ... -c "\d orders" | grep reminders_sent
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/reminder-tick/index.ts supabase/migrations/20260517000001_whatsapp_checkout.sql
git commit -m "feat(fn): reminders idempotent via orders.reminders_sent[]"
```

---

## Phase 6 — Landing CTA + Admin handoff inbox

### Task 30: Landing — replace checkout modal with WA button [parallelizable]

**Files:**
- Modify: `public/index.html`
- Create: `public/assets/js/wa-cta.js`

- [ ] **Step 1: Replace the checkout button with WA button**

In `public/index.html`, locate the existing primary CTA button(s) that open `CheckoutModal` (search for `comprarBoleta()` or similar). Replace its onclick with a call to `openWaCta()`. Remove `<script src=".../checkout-modal.js">` (or equivalent) and any imports of the checkout classes.

Add at end of `<body>`:

```html
<script src="/assets/js/wa-cta.js"></script>
```

- [ ] **Step 2: Create `public/assets/js/wa-cta.js`**

```javascript
(function () {
  const WA_NUMBER = '573106619353';
  function buildMsg() {
    const params = new URLSearchParams(location.search);
    const utm = ['utm_source','utm_medium','utm_campaign','utm_content','ref']
      .filter(k => params.get(k))
      .map(k => `${k}=${params.get(k)}`)
      .join('|');
    const base = 'Hola, quiero reservar para NEXT SHOW';
    return utm ? `${base} [${utm}]` : base;
  }
  window.openWaCta = function () {
    const msg = encodeURIComponent(buildMsg());
    window.location.href = `https://wa.me/${WA_NUMBER}?text=${msg}`;
  };
  document.querySelectorAll('[data-wa-cta]').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); window.openWaCta(); });
  });
})();
```

In `index.html` mark the CTA buttons with `data-wa-cta` attribute.

- [ ] **Step 3: Manual smoke test**

```bash
npm run dev
# Open http://localhost:8000?utm_source=ig&utm_campaign=test
# Click CTA — should redirect to wa.me link with text=Hola, quiero reservar... [utm_source=ig|utm_campaign=test]
```

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/assets/js/wa-cta.js
git commit -m "feat(landing): swap checkout modal for WA CTA with UTM preservation"
```

---

### Task 31: Admin — group-handoff inbox section [parallelizable]

**Files:**
- Modify: `public/admin.html`
- (Wire to existing admin.js or create new module)

- [ ] **Step 1: Add inbox section that lists `orders` where `is_group=true AND status='manual_review'`**

In `public/admin.html`, add a section:

```html
<section id="group-handoff">
  <h2>Grupos pendientes</h2>
  <table>
    <thead><tr><th>Cliente</th><th>WA</th><th>Cant.</th><th>Acción</th></tr></thead>
    <tbody id="group-tbody"></tbody>
  </table>
</section>
<script type="module">
  async function loadGroups() {
    const r = await fetch('/_supabase/orders?select=id,buyer_name,wa_phone,quantity&status=eq.manual_review&is_group=eq.true', {
      headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
    });
    const rows = await r.json();
    document.getElementById('group-tbody').innerHTML = rows.map(o =>
      `<tr><td>${o.buyer_name}</td><td>${o.wa_phone}</td><td>${o.quantity ?? '?'}</td>
       <td><button data-take="${o.wa_phone}">Tomar</button></td></tr>`
    ).join('');
  }
  document.addEventListener('click', async (e) => {
    if (e.target.matches('[data-take]')) {
      await fetch('/functions/v1/operator-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
        body: JSON.stringify({ phone: e.target.dataset.take, action: 'take' }),
      });
      loadGroups();
    }
  });
  loadGroups();
  setInterval(loadGroups, 15_000);
</script>
```

- [ ] **Step 2: Manual smoke test**

Open `/admin.html`, log in, trigger a group via WA test, verify row appears, click "Tomar", verify conversation flips to `human_takeover`.

- [ ] **Step 3: Commit**

```bash
git add public/admin.html
git commit -m "feat(admin): grupo-handoff inbox with claim button"
```

---

## Phase 7 — E2E checklist + docs

### Task 32: E2E manual checklist + README updates

**Files:**
- Modify: `README.md`
- Create: `docs/e2e-checklist.md`

- [ ] **Step 1: Document deploy & sandbox setup in README**

Append a new section to `README.md`:

```markdown
## WhatsApp Checkout

Customer entry: WhatsApp link on landing → bot conversation → Wompi link in chat → QR delivered via WhatsApp.

### Required env vars (Edge Functions)
- `WA_CLOUD_TOKEN` — Meta WhatsApp Cloud API access token (use `mock` in local)
- `WA_PHONE_NUMBER_ID` — Meta phone number id
- `WA_VERIFY_TOKEN` — webhook subscribe verify token
- `META_APP_SECRET` — for `X-Hub-Signature-256` verification
- `WA_STAFF_PHONE` — staff number for group handoff (default `+573106619353`)
- `WOMPI_CHECKOUT_BASE` — default `https://checkout.wompi.co/l/`

### Local development
With `WA_CLOUD_TOKEN=mock`, all WA sends are logged to console — no real messages go out. Run vitest suites against `npm run supabase:functions` to exercise the bot end-to-end.

### Production deploy
1. Verify Meta Business Account.
2. Submit 5 templates for approval: `cantas_upsell`, `reminder_t3`, `reminder_t1`, `reminder_day`, `nextshow_greet`.
3. Configure Meta webhook: URL = `https://<project>.functions.supabase.co/whatsapp-webhook`, verify token = `WA_VERIFY_TOKEN`.
4. In Supabase Dashboard → Scheduled Functions:
   - `wa-outbox-worker` every minute
   - `reminder-tick` daily 9am Bogota (`0 14 * * *` UTC)
   - `cantas-cross-sell` once on T-15 (set with one-shot cron or run manually)
5. Set Wompi production secret in `WOMPI_EVENTS_SECRET`.

### E2E checklist before public launch
See `docs/e2e-checklist.md`.
```

- [ ] **Step 2: Create `docs/e2e-checklist.md`**

```markdown
# NEXT SHOW WhatsApp E2E Checklist

Run from a Meta-verified test number (or `WA_CLOUD_TOKEN=mock` for log-only).

## Flow 1 — RISAS happy path
- [ ] Land on `/?utm_source=test`; click "Comprar por WhatsApp"
- [ ] WA opens with prefilled "Hola, quiero reservar... [utm_source=test]"
- [ ] Send → bot greets with button "Comprar entrada"
- [ ] Tap button → bot asks cantidad (3 + 3 buttons)
- [ ] Tap "2" → bot asks nombre
- [ ] Send "Juan Prueba" → bot asks cédula
- [ ] Send "1234567890" → bot asks email
- [ ] Send "saltar" → bot shows resumen with PAGAR button
- [ ] Tap PAGAR → bot sends Wompi link
- [ ] Open link (Wompi sandbox) → pay with test card
- [ ] Within 30s bot sends QR image + assignment link
- [ ] Open `asignar.html` link → assign names → confirm
- [ ] Scan QR with scanner.html (admin pin 1234) → status "ok"

## Flow 2 — Group ≥6
- [ ] In a fresh number, complete bot flow up to cantidad
- [ ] Tap "6 o más" → bot asks nombre + cantidad
- [ ] Send "Carlos 12" → bot confirms "asesor te contactará"
- [ ] Admin panel: `manual_review` row appears with cliente+wa+cantidad
- [ ] Staff WA gets notification message
- [ ] Click "Tomar" in admin → conversation flips to `human_takeover`
- [ ] Staff sends manual message from WA Business → bot stays silent

## Flow 3 — Recover QR
- [ ] From a paid customer's number, send "mi boleta"
- [ ] Bot asks cédula → send cédula → QR re-delivered

## Flow 4 — CANTAS unlock
- [ ] Manually run `cantas-cross-sell` endpoint
- [ ] Verify `zones.active=true` for CANTAS
- [ ] Verify template enqueued for each RISAS-paid customer
- [ ] Fresh customer flow → bot shows zone_select with both options

## Edge
- [ ] Cédula duplicada (active order): bot replies "ya tienes reserva activa"
- [ ] Rate limit: 6 "hola" en 1h → silenciado
- [ ] Hold expirado: esperar 15 min sin pagar → estado expired → asiento (CANTAS) liberado
- [ ] Sold-out: forzar 350 RISAS paid → 351st intento → bot "agotado / CANTAS?"
- [ ] 3 mensajes basura seguidos → bot dice "te paso con asesor"

## Production smoke
- [ ] 1 real $1.000 purchase from staff number before public launch
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/e2e-checklist.md
git commit -m "docs: WA checkout deploy notes + E2E manual checklist"
```

---

## Final acceptance criteria

The implementation is complete when:

1. All unit tests pass (`npm test -- tests/unit`).
2. All integration tests pass (`npm test -- tests/integration`).
3. Manual E2E checklist (Task 32) passes against Meta sandbox.
4. README documents production deploy steps.
5. Landing CTA links to WA, no checkout modal loaded.
6. Admin shows pending group-handoff inbox.
7. `supabase db reset` succeeds against the new migration.

Production go-live remains gated on:
- Meta Business Account verification
- WA template approvals (5)
- Wompi production credentials approval

These are non-code blockers handled in parallel by ops.

import { describe, it, expect } from 'vitest';

/**
 * Idempotency check for `wompi-webhook`.
 *
 * Scenario:
 *   1. Create an order via `create-order` (gives `wompi_reference`).
 *   2. POST a synthetic Wompi event 5 times with the same transaction.id.
 *   3. Fetch tickets for the order — count must equal `order.quantity`,
 *      not `5 * quantity`.
 *
 * Requires the local Supabase stack running (`supabase start`) and
 * functions served (`supabase functions serve --env-file .env.local --no-verify-jwt`).
 *
 * This test is auto-skipped when SUPABASE_URL is not set so `npm test` stays
 * green in plain CI / local dev without Docker.
 */

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const maybeIt = SUPA_URL && SUPA_KEY ? it : it.skip;

describe('wompi-webhook (idempotency)', () => {
  maybeIt('ignores repeated transactions with the same id', async () => {
    // 1) create order
    const c = await fetch(`${SUPA_URL}/functions/v1/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        zone_code: 'risas',
        quantity: 2,
        buyer: { name: 'Idem Test', id_number: '1234567890', phone: '3009999999', email: 'idem@test.com' },
      }),
    });
    expect(c.status).toBe(200);
    const order = await c.json();

    // 2) POST same webhook 5 times
    const txId = `wmpi_test_${crypto.randomUUID()}`;
    const fakeEvent = {
      event: 'transaction.updated',
      data: {
        transaction: {
          id: txId,
          reference: order.wompi_reference,
          status: 'APPROVED',
          amount_in_cents: order.total_cop * 100,
          payment_method_type: 'CARD',
          customer_email: 'idem@test.com',
        },
      },
    };

    const responses = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        fetch(`${SUPA_URL}/functions/v1/wompi-webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fakeEvent),
        })
      )
    );
    for (const r of responses) expect(r.status).toBe(200);

    // 3) Verify tickets count via REST. Need service role key for RLS-protected reads.
    const ticketsResp = await fetch(
      `${SUPA_URL}/rest/v1/tickets?order_id=eq.${order.order_id}&select=id`,
      { headers: { apikey: SUPA_KEY!, Authorization: `Bearer ${SUPA_KEY}` } }
    );
    const tickets = await ticketsResp.json();
    expect(Array.isArray(tickets)).toBe(true);
    expect(tickets.length).toBe(2); // == quantity, not 10
  });
});

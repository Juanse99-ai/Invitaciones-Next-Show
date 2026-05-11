import { describe, it, expect } from 'vitest';

const SUPA_URL = process.env.SUPABASE_URL;

const maybeIt = SUPA_URL ? it : it.skip;

describe('create-order (integration)', () => {
  maybeIt('creates a Risas order successfully', async () => {
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

  maybeIt('rejects invalid email', async () => {
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

import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.SUPABASE_URL;
const SVC    = process.env.SUPABASE_SERVICE_ROLE_KEY;
const maybeIt = (SB_URL && SVC) ? it : it.skip;
const sb = (SB_URL && SVC) ? createClient(SB_URL, SVC) : null;

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
    if (!sb) return;
    // Wipe pending/holding orders we created in past test runs
    await sb.from('orders').delete().like('buyer_id_number', 'OS%');
  });

  maybeIt('blocks order when total holding + paid >= 350 (300 + 50)', async () => {
    const { data: zone } = await sb!.from('zones').select('id, event_id').eq('code', 'risas').single();
    const rows = Array.from({ length: 350 }, (_, i) => ({
      event_id: zone!.event_id, zone_id: zone!.id,
      buyer_name: 'OS', buyer_id_number: `OS${String(i).padStart(8,'0')}`,
      buyer_phone: '3001112222', buyer_email: 'o@x.co', quantity: 1,
      subtotal_cop: 75000, total_cop: 75000,
      wompi_reference: `OS-${i}-${Date.now()}`, status: 'pending',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    }));
    await sb!.from('orders').insert(rows);
    const res = await callCreate(1, 'OS99999999');
    expect(res.ok).toBe(false);
    expect(res.body.error || res.body.code).toMatch(/SOLD_OUT|CAPACITY/i);
  });
});

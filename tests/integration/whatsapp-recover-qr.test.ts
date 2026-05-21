import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const maybeIt = (SB_URL && SVC) ? it : it.skip;
const sb = (SB_URL && SVC) ? createClient(SB_URL, SVC) : null;
const FN_BASE = SB_URL ? `${SB_URL}/functions/v1` : '';
const PHONE = '+573008887766';
const CEDULA = '987654321';

async function post(msg: any) {
  return await fetch(`${FN_BASE}/whatsapp-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry: [{ changes: [{ value: { messages: [msg] } }] }] }),
  });
}

describe('WA recover QR', () => {
  beforeAll(async () => {
    if (!sb) return;
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

  maybeIt('"mi boleta" → recover_qr → cedula → re-trigger send-ticket', async () => {
    await post({ from: PHONE.slice(1), type: 'text', text: { body: 'mi boleta' } });
    const { data: s1 } = await sb!.from('wa_conversations').select('state').eq('phone', PHONE).single();
    expect(s1?.state).toBe('recover_qr');

    await post({ from: PHONE.slice(1), type: 'text', text: { body: CEDULA } });
    const { data: s2 } = await sb!.from('wa_conversations').select('state').eq('phone', PHONE).single();
    expect(s2?.state).toBe('paid');
  });
});

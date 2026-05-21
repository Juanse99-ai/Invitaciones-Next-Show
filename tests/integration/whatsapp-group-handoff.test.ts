import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const maybeIt = (SB_URL && SVC) ? it : it.skip;
const sb = (SB_URL && SVC) ? createClient(SB_URL, SVC) : null;
const FN_BASE = SB_URL ? `${SB_URL}/functions/v1` : '';
const PHONE = '+573007776655';
const STAFF = process.env.WA_STAFF_PHONE || '+573106619353';

async function post(msg: any) {
  return await fetch(`${FN_BASE}/whatsapp-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry: [{ changes: [{ value: { messages: [msg] } }] }] }),
  });
}

describe('WA group handoff', () => {
  beforeAll(async () => {
    if (!sb) return;
    await sb.from('wa_outbox').delete().eq('phone', PHONE);
    await sb.from('wa_outbox').delete().eq('phone', STAFF);
    await sb.from('wa_conversations').delete().eq('phone', PHONE);
    await sb.from('orders').delete().eq('wa_phone', PHONE);
  });

  maybeIt('flow text→start→qty_more leads to group_handoff with manual_review order', async () => {
    await post({ from: PHONE.slice(1), type: 'text', text: { body: 'hola' } });
    await post({ from: PHONE.slice(1), type: 'interactive', interactive: { button_reply: { id: 'start', title: 'X' } } });
    await post({ from: PHONE.slice(1), type: 'interactive', interactive: { button_reply: { id: 'qty_more', title: '6+' } } });

    const { data: conv } = await sb!.from('wa_conversations').select('state').eq('phone', PHONE).single();
    expect(conv?.state).toBe('group_handoff');

    const { data: order } = await sb!.from('orders').select('is_group, status').eq('wa_phone', PHONE).single();
    expect(order?.is_group).toBe(true);
    expect(order?.status).toBe('manual_review');

    const { data: staffMsg } = await sb!.from('wa_outbox').select('payload').eq('phone', STAFF)
      .order('created_at', { ascending: false }).limit(1).single();
    expect((staffMsg?.payload as any).body).toMatch(/GROUP/);
  });
});

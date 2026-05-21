import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const maybeIt = (SB_URL && SVC) ? it : it.skip;
const sb = (SB_URL && SVC) ? createClient(SB_URL, SVC) : null;
const FN_BASE = SB_URL ? `${SB_URL}/functions/v1` : '';
const PHONE = '+573006665544';

describe('CANTAS unlock affects flow', () => {
  beforeAll(async () => {
    if (!sb) return;
    await sb.from('zones').update({ active: true }).eq('code', 'cantas');
    await sb.from('wa_conversations').delete().eq('phone', PHONE);
  });
  afterAll(async () => {
    if (!sb) return;
    await sb.from('zones').update({ active: false }).eq('code', 'cantas');
  });

  maybeIt('with CANTAS active, button start → zone_select', async () => {
    await fetch(`${FN_BASE}/whatsapp-webhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: PHONE.slice(1), type: 'text', text: { body: 'hola' } }] } }] }] }),
    });
    await fetch(`${FN_BASE}/whatsapp-webhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: PHONE.slice(1), type: 'interactive', interactive: { button_reply: { id: 'start', title: 'X' } } }] } }] }] }),
    });
    const { data } = await sb!.from('wa_conversations').select('state').eq('phone', PHONE).single();
    expect(data?.state).toBe('zone_select');
  });
});

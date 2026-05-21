import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const maybeIt = (SB_URL && SVC) ? it : it.skip;
const sb = (SB_URL && SVC) ? createClient(SB_URL, SVC) : null;
const FN_BASE = SB_URL ? `${SB_URL}/functions/v1` : '';
const PHONE = '+573009998877';

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
  if (!sb) return null;
  const { data } = await sb.from('wa_conversations').select('state, context').eq('phone', PHONE).single();
  return data;
}

async function lastOutboxForPhone() {
  if (!sb) return null;
  const { data } = await sb.from('wa_outbox').select('*').eq('phone', PHONE)
    .order('created_at', { ascending: false }).limit(1).single();
  return data;
}

describe('WA happy path RISAS', () => {
  beforeAll(async () => {
    if (!sb) return;
    await sb.from('wa_outbox').delete().eq('phone', PHONE);
    await sb.from('wa_conversations').delete().eq('phone', PHONE);
  });

  maybeIt('text "hola" advances to greet and enqueues greeting interactive', async () => {
    await postWebhook({ from: PHONE.slice(1), type: 'text', text: { body: 'hola' } });
    expect((await readState())?.state).toBe('greet');
    expect((await lastOutboxForPhone())!.kind).toBe('interactive');
  });

  maybeIt('button "start" → quantity (no CANTAS unlock by default)', async () => {
    await postWebhook({ from: PHONE.slice(1), type: 'interactive', interactive: { button_reply: { id: 'start', title: 'Comprar' } } });
    expect((await readState())?.state).toBe('quantity');
  });

  maybeIt('button qty_2 → buyer_name', async () => {
    await postWebhook({ from: PHONE.slice(1), type: 'interactive', interactive: { button_reply: { id: 'qty_2', title: '2' } } });
    expect((await readState())?.state).toBe('buyer_name');
  });

  maybeIt('text "Juan Pérez" → buyer_cedula', async () => {
    await postWebhook({ from: PHONE.slice(1), type: 'text', text: { body: 'Juan Pérez' } });
    const s = await readState();
    expect(s?.state).toBe('buyer_cedula');
    expect((s?.context as any).name).toBe('Juan Pérez');
  });

  maybeIt('text "1234567890" → email_opt', async () => {
    await postWebhook({ from: PHONE.slice(1), type: 'text', text: { body: '1234567890' } });
    expect((await readState())?.state).toBe('email_opt');
  });

  maybeIt('text "saltar" → confirm', async () => {
    await postWebhook({ from: PHONE.slice(1), type: 'text', text: { body: 'saltar' } });
    expect((await readState())?.state).toBe('confirm');
  });

  maybeIt('button "pay" → payment_pending and order_id appears in context', async () => {
    await postWebhook({ from: PHONE.slice(1), type: 'interactive', interactive: { button_reply: { id: 'pay', title: 'PAGAR' } } });
    const s = await readState();
    expect(s?.state).toBe('payment_pending');
    expect((s?.context as any).order_id).toBeTruthy();
    // Last outbox should be a text with Wompi link
    const last = await lastOutboxForPhone();
    expect(last!.kind).toBe('text');
    expect((last!.payload as any).body).toMatch(/Pagar aquí/);
  });
});

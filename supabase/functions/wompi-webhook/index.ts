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

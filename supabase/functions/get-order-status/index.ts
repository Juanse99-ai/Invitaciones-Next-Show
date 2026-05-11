import { getServiceClient } from '../_shared/supabase.ts';
import { jsonResponse, preflight } from '../_shared/cors.ts';
import { AppError, ERR } from '../_shared/errors.ts';

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  if (req.method !== 'GET') return jsonResponse({ error: 'METHOD' }, 405);

  try {
    const url = new URL(req.url);
    const ref = url.searchParams.get('ref');
    const id = url.searchParams.get('id');
    if (!ref && !id) throw ERR.VALIDATION('ref|id');

    const sb = getServiceClient();

    const q = sb.from('orders').select('*, zones(name)');
    const { data: order, error } = ref
      ? await q.eq('wompi_reference', ref).maybeSingle()
      : await q.eq('id', id!).maybeSingle();
    if (error) throw new AppError('DB', 500, error.message);
    if (!order) return jsonResponse({ error: 'NOT_FOUND' }, 404);

    const { data: tickets } = await sb.from('tickets')
      .select('id, ticket_code, attendee_name, pdf_url, seats(row_label, seat_number)')
      .eq('order_id', order.id);

    // deno-lint-ignore no-explicit-any
    const ticketsOut = (tickets || []).map((t: any) => ({
      ticket_id: t.id,
      ticket_code: t.ticket_code,
      attendee_name: t.attendee_name,
      pdf_url: t.pdf_url,
      seat_label: t.seats ? `Fila ${t.seats.row_label} · Silla ${t.seats.seat_number}` : null,
    }));

    return jsonResponse({
      status: order.status,
      order_id: order.id,
      order_number: order.order_number,
      total_cop: order.total_cop,
      subtotal_cop: order.subtotal_cop,
      discount_cop: order.discount_cop,
      zone_name: order.zones?.name,
      buyer_name: order.buyer_name,
      buyer_email: order.buyer_email,
      expires_at: order.expires_at,
      paid_at: order.paid_at,
      tickets: ticketsOut,
    });
  } catch (e) {
    if (e instanceof AppError) {
      return jsonResponse({ error: e.code, message: e.message, ...((e.extra as object) || {}) }, e.httpStatus);
    }
    console.error('[get-order-status]', e);
    return jsonResponse({ error: 'INTERNAL', message: String(e) }, 500);
  }
});

import { getServiceClient } from '../_shared/supabase.ts';
import { jsonResponse, preflight } from '../_shared/cors.ts';
import { AppError, ERR } from '../_shared/errors.ts';

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  if (req.method !== 'GET') return jsonResponse({ error: 'METHOD' }, 405);

  try {
    const url = new URL(req.url);
    const pin = url.searchParams.get('pin');
    if (!pin) throw ERR.VALIDATION('pin');

    const sb = getServiceClient();

    // Cargar evento principal "selling" (asumimos uno activo a la vez en MVP).
    const { data: event, error: eErr } = await sb.from('events')
      .select('*').eq('status', 'selling').limit(1).maybeSingle();
    if (eErr) throw new AppError('DB', 500, eErr.message);
    if (!event) throw new AppError('NO_EVENT', 404, 'No hay evento activo');

    const doorPin = event.settings?.door_pin;
    if (!doorPin || String(pin) !== String(doorPin)) {
      throw new AppError('UNAUTHORIZED', 401, 'PIN inválido');
    }

    // Tickets pagados del evento + zona/seat info para validación offline.
    const { data: tickets, error: tErr } = await sb.from('tickets')
      .select(`
        id, ticket_code, attendee_name, attendee_id_number, checked_in_at, checked_in_by,
        seats(row_label, seat_number),
        orders!inner(id, order_number, status, event_id, buyer_name, buyer_id_number, zones(name))
      `)
      .eq('orders.event_id', event.id)
      .eq('orders.status', 'paid');
    if (tErr) throw new AppError('DB', 500, tErr.message);

    // deno-lint-ignore no-explicit-any
    const out = (tickets || []).map((t: any) => ({
      ticket_code: t.ticket_code,
      attendee_name: t.attendee_name || t.orders.buyer_name,
      attendee_id: t.attendee_id_number || t.orders.buyer_id_number,
      zone: t.orders.zones?.name,
      seat_label: t.seats ? `Fila ${t.seats.row_label} · Silla ${t.seats.seat_number}` : null,
      order_number: t.orders.order_number,
      checked_in_at: t.checked_in_at,
      checked_in_by: t.checked_in_by,
    }));

    return jsonResponse({
      event_id: event.id,
      event_name: event.name,
      generated_at: new Date().toISOString(),
      count: out.length,
      tickets: out,
    });
  } catch (e) {
    if (e instanceof AppError) {
      return jsonResponse({ error: e.code, message: e.message, ...((e.extra as object) || {}) }, e.httpStatus);
    }
    console.error('[scanner-manifest]', e);
    return jsonResponse({ error: 'INTERNAL', message: String(e) }, 500);
  }
});

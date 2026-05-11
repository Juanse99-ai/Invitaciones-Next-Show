import { getServiceClient } from '../_shared/supabase.ts';
import { jsonResponse, preflight } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  if (req.method !== 'POST') return jsonResponse({ error: 'METHOD' }, 405);

  const { ticket_code, staff_name } = await req.json();
  if (!ticket_code || !staff_name) return jsonResponse({ error: 'BAD_REQUEST' }, 400);

  const sb = getServiceClient();

  // Fixed (plan bug): include zones() join so t.orders.zones.name resolves below.
  const { data: t } = await sb.from('tickets')
    .select('*, orders(*, events(event_date), zones(name)), seats(row_label, seat_number)')
    .eq('ticket_code', ticket_code).maybeSingle();

  let result: 'invalid' | 'unpaid' | 'already_used' | 'wrong_date' | 'ok';
  if (!t) result = 'invalid';
  else if (t.orders.status !== 'paid') result = 'unpaid';
  else if (t.checked_in_at) result = 'already_used';
  else {
    const eventDate = new Date(t.orders.events.event_date).toDateString();
    const today = new Date().toDateString();
    result = (eventDate === today) ? 'ok' : 'wrong_date';
  }

  await sb.from('entry_attempts').insert({
    ticket_id: t?.id || null, ticket_code_raw: ticket_code, result, staff_name,
  });

  if (result === 'ok' && t) {
    await sb.from('tickets').update({
      checked_in_at: new Date().toISOString(), checked_in_by: staff_name,
    }).eq('id', t.id);

    return jsonResponse({
      result: 'ok',
      attendee_name: t.attendee_name || t.orders.buyer_name,
      attendee_id: t.attendee_id_number || t.orders.buyer_id_number,
      zone: t.orders.zones?.name,
      seat: t.seats ? `Fila ${t.seats.row_label} · Silla ${t.seats.seat_number}` : null,
      order_number: t.orders.order_number,
    });
  }

  if (result === 'already_used' && t) {
    return jsonResponse({
      result: 'already_used',
      previous_check_in: t.checked_in_at,
      previous_staff: t.checked_in_by,
    }, 409);
  }

  return jsonResponse({ result }, result === 'invalid' ? 404 : 400);
});

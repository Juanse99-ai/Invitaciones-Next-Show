import { getServiceClient } from '../_shared/supabase.ts';
import { jsonResponse, preflight } from '../_shared/cors.ts';
import { verifyToken } from '../_shared/signing.ts';
import { AppError, ERR } from '../_shared/errors.ts';

interface AssignBody {
  order_id: string;
  signed_token: string;
  attendees: Array<{ ticket_id: string; name: string; id_number: string }>;
}

const isValidId = (i: string) => /^\d{6,12}$/.test(i);

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  if (req.method !== 'POST') return jsonResponse({ error: 'METHOD' }, 405);

  try {
    const body = (await req.json()) as AssignBody;
    if (!body.order_id || !body.signed_token || !Array.isArray(body.attendees)) {
      throw ERR.VALIDATION('payload');
    }

    const secret = Deno.env.get('ASSIGN_SIGNING_SECRET')!;
    const verifiedPayload = await verifyToken(secret, body.signed_token);
    if (verifiedPayload !== body.order_id) {
      throw new AppError('INVALID_TOKEN', 401, 'Token de asignación inválido o vencido');
    }

    for (const a of body.attendees) {
      if (!a.ticket_id) throw ERR.VALIDATION('attendees.ticket_id');
      if (!a.name?.trim()) throw ERR.VALIDATION('attendees.name');
      if (!isValidId(a.id_number)) throw ERR.VALIDATION('attendees.id_number');
    }

    const sb = getServiceClient();

    // Verificar que todos los tickets pertenezcan a la orden
    const ticketIds = body.attendees.map(a => a.ticket_id);
    const { data: tickets, error: tErr } = await sb.from('tickets')
      .select('id, order_id').in('id', ticketIds);
    if (tErr) throw new AppError('DB', 500, tErr.message);

    const wrong = (tickets || []).filter(t => t.order_id !== body.order_id);
    if (wrong.length > 0 || (tickets?.length || 0) !== ticketIds.length) {
      throw new AppError('TICKET_MISMATCH', 400, 'Algún ticket no pertenece a la orden');
    }

    const updates = await Promise.all(
      body.attendees.map(a =>
        sb.from('tickets').update({
          attendee_name: a.name.trim(),
          attendee_id_number: a.id_number,
        }).eq('id', a.ticket_id).eq('order_id', body.order_id)
      )
    );

    const failed = updates.filter(u => u.error);
    if (failed.length > 0) {
      console.error('[assign-attendees] update errors', failed.map(f => f.error));
      throw new AppError('DB', 500, 'No se pudo actualizar uno o más asistentes');
    }

    return jsonResponse({ ok: true, updated: body.attendees.length });
  } catch (e) {
    if (e instanceof AppError) {
      return jsonResponse({ error: e.code, message: e.message, ...((e.extra as object) || {}) }, e.httpStatus);
    }
    console.error('[assign-attendees]', e);
    return jsonResponse({ error: 'INTERNAL', message: String(e) }, 500);
  }
});

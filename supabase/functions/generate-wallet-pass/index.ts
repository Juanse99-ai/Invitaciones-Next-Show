import { getServiceClient } from '../_shared/supabase.ts';
import { jsonResponse, preflight } from '../_shared/cors.ts';
import { verifyToken } from '../_shared/signing.ts';
import { generateApplePassUrl, generateGoogleWalletSaveUrl } from '../_shared/wallet.ts';
import { AppError, ERR } from '../_shared/errors.ts';

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  if (req.method !== 'GET') return jsonResponse({ error: 'METHOD' }, 405);

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const type = url.searchParams.get('type') || 'apple';
    if (!token) throw ERR.VALIDATION('token');
    if (type !== 'apple' && type !== 'google') throw ERR.VALIDATION('type');

    const secret = Deno.env.get('TICKET_SIGNING_SECRET')!;
    const ticketId = await verifyToken(secret, token);
    if (!ticketId) throw new AppError('INVALID_TOKEN', 401, 'Token de wallet inválido');

    const sb = getServiceClient();
    const { data: ticket, error } = await sb.from('tickets')
      .select('id, ticket_code').eq('id', ticketId).maybeSingle();
    if (error) throw new AppError('DB', 500, error.message);
    if (!ticket) throw new AppError('NOT_FOUND', 404, 'Boleta no encontrada');

    const wallet_url = type === 'apple'
      ? await generateApplePassUrl(ticket.id, token)
      : await generateGoogleWalletSaveUrl(ticket.id);

    return jsonResponse({ ok: true, type, wallet_url });
  } catch (e) {
    if (e instanceof AppError) {
      return jsonResponse({ error: e.code, message: e.message }, e.httpStatus);
    }
    console.error('[generate-wallet-pass]', e);
    return jsonResponse({ error: 'INTERNAL', message: String(e) }, 500);
  }
});

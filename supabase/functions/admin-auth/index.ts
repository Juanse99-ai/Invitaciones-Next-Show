import { getServiceClient } from '../_shared/supabase.ts';
import { jsonResponse, preflight } from '../_shared/cors.ts';
import { signToken } from '../_shared/signing.ts';
import { sendWhatsAppText } from '../_shared/whatsapp.ts';
import { AppError, ERR } from '../_shared/errors.ts';

interface AuthBody {
  pin: string;
  otp?: string;
}

const OTP_TTL_MS = 5 * 60 * 1000;          // 5 min OTP validity
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 h JWT-ish session

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  if (req.method !== 'POST') return jsonResponse({ error: 'METHOD' }, 405);

  try {
    const body = (await req.json()) as AuthBody;
    if (!body.pin) throw ERR.VALIDATION('pin');

    const sb = getServiceClient();

    // Cargar evento activo (asumimos uno).
    const { data: event, error: eErr } = await sb.from('events')
      .select('id, settings').eq('status', 'selling').limit(1).maybeSingle();
    if (eErr) throw new AppError('DB', 500, eErr.message);
    if (!event) throw new AppError('NO_EVENT', 404, 'No hay evento activo');

    const adminPins: string[] = event.settings?.admin_pins || [];
    if (!adminPins.includes(String(body.pin))) {
      throw new AppError('UNAUTHORIZED', 401, 'PIN inválido');
    }

    // deno-lint-ignore no-explicit-any
    const settings: any = event.settings || {};
    const pendingOtps: Record<string, { otp: string; expires: number }> = settings.pending_otps || {};

    // STEP 1: only PIN provided → emit OTP, store pending.
    if (!body.otp) {
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      pendingOtps[body.pin] = { otp, expires: Date.now() + OTP_TTL_MS };
      const newSettings = { ...settings, pending_otps: pendingOtps };
      await sb.from('events').update({ settings: newSettings }).eq('id', event.id);

      // Send WA OTP — mock-friendly.
      const adminWa = Deno.env.get('ADMIN_ALERT_WA');
      const waToken = Deno.env.get('WA_CLOUD_TOKEN') || 'mock';
      console.log(`[admin-auth] OTP for pin=${body.pin}: ${otp} (expires in 5min)`);
      if (adminWa && waToken) {
        try {
          await sendWhatsAppText(adminWa, `NEXT SHOW · OTP admin: ${otp} (válido 5 min)`);
        } catch (e) {
          console.warn('[admin-auth] WA OTP send failed:', e);
        }
      }

      return jsonResponse({ otp_pending: true });
    }

    // STEP 2: PIN + OTP → validate.
    const pending = pendingOtps[body.pin];
    const waToken = Deno.env.get('WA_CLOUD_TOKEN') || 'mock';
    const acceptAnyOtp = waToken === 'mock' && Deno.env.get('TURNSTILE_SECRET') === '1x0000000000000000000000000000000AA';

    let otpOk = false;
    if (pending && pending.expires > Date.now() && pending.otp === body.otp) {
      otpOk = true;
    } else if (acceptAnyOtp) {
      // MVP local: WA mocked + Turnstile test keys → accept any 6-digit OTP for dev convenience.
      console.warn('[admin-auth] DEV-MODE: accepting any OTP because WA is mock and Turnstile is test-key');
      otpOk = /^\d{6}$/.test(body.otp);
    }

    if (!otpOk) throw new AppError('INVALID_OTP', 401, 'OTP inválido o vencido');

    // Clear used OTP.
    delete pendingOtps[body.pin];
    await sb.from('events')
      .update({ settings: { ...settings, pending_otps: pendingOtps } })
      .eq('id', event.id);

    const exp = Date.now() + SESSION_TTL_MS;
    const sessionToken = await signToken(
      Deno.env.get('SCANNER_SIGNING_SECRET')!,
      JSON.stringify({ role: 'admin', exp, event_id: event.id })
    );

    return jsonResponse({
      ok: true,
      session_token: sessionToken,
      expires_at: new Date(exp).toISOString(),
      role: 'admin',
    });
  } catch (e) {
    if (e instanceof AppError) {
      return jsonResponse({ error: e.code, message: e.message }, e.httpStatus);
    }
    console.error('[admin-auth]', e);
    return jsonResponse({ error: 'INTERNAL', message: String(e) }, 500);
  }
});

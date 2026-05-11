import { getServiceClient } from '../_shared/supabase.ts';
import { preflight, jsonResponse } from '../_shared/cors.ts';
import { generateIntegritySignature } from '../_shared/wompi.ts';
import { ERR, AppError } from '../_shared/errors.ts';

interface CreateOrderRequest {
  zone_code: string;
  seat_ids?: string[];
  quantity?: number;
  buyer: { name: string; id_number: string; phone: string; email: string };
  coupon_code?: string;
  attribution?: Record<string, string>;
  turnstile_token?: string;
}

const isValidPhone = (p: string) => /^3\d{9}$/.test(p);
const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const isValidId    = (i: string) => /^\d{6,12}$/.test(i);

// Simple in-memory rate limit (per Edge Function instance — buena para sandbox; para prod usar Upstash o KV)
const rateLimits = new Map<string, { count: number; reset: number }>();
function checkRateLimit(ip: string, max = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  const r = rateLimits.get(ip);
  if (!r || r.reset < now) {
    rateLimits.set(ip, { count: 1, reset: now + windowMs });
    return true;
  }
  if (r.count >= max) return false;
  r.count++;
  return true;
}

async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET')!;
  if (!token) return false;
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `secret=${secret}&response=${token}`,
  });
  const d = await r.json();
  return !!d.success;
}

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;

  try {
    const body = (await req.json()) as CreateOrderRequest;
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';

    if (!checkRateLimit(ip)) throw ERR.RATE_LIMIT();

    // Turnstile (skipear en local con keys de test que siempre pasan)
    if (Deno.env.get('TURNSTILE_SECRET') !== '1x0000000000000000000000000000000AA') {
      if (!(await verifyTurnstile(body.turnstile_token || ''))) throw ERR.VALIDATION('turnstile');
    }

    // Validaciones
    if (!body.buyer?.name?.trim()) throw ERR.VALIDATION('buyer.name');
    if (!isValidId(body.buyer.id_number)) throw ERR.VALIDATION('buyer.id_number');
    if (!isValidPhone(body.buyer.phone)) throw ERR.VALIDATION('buyer.phone');
    if (!isValidEmail(body.buyer.email)) throw ERR.VALIDATION('buyer.email');

    const sb = getServiceClient();

    // Cargar evento + zona
    const { data: zone, error: zErr } = await sb
      .from('zones').select('*, events(*)')
      .eq('code', body.zone_code).single();
    if (zErr || !zone) throw ERR.VALIDATION('zone_code');

    // Blacklist
    const { data: bl } = await sb.from('blacklist').select('id')
      .or(`id_number.eq.${body.buyer.id_number},phone.eq.${body.buyer.phone}`)
      .maybeSingle();
    if (bl) throw new AppError('BLACKLISTED', 403, 'No se puede procesar la compra');

    let quantity: number;
    let seat_ids: string[] = [];

    if (zone.seating_mode === 'numbered') {
      seat_ids = body.seat_ids || [];
      if (seat_ids.length === 0 || seat_ids.length > zone.events.settings.max_seats_per_order) {
        throw ERR.VALIDATION('seat_ids');
      }
      quantity = seat_ids.length;
    } else {
      quantity = body.quantity || 0;
      if (quantity < 1 || quantity > zone.events.settings.max_seats_per_order) {
        throw ERR.VALIDATION('quantity');
      }
      // Verificar capacidad
      const { data: avail } = await sb.from('v_zone_availability')
        .select('available').eq('zone_id', zone.id).single();
      if (!avail || avail.available < quantity) throw ERR.SOLD_OUT();
    }

    // Validar cupón
    // deno-lint-ignore no-explicit-any
    let coupon: any = null;
    let discount_cop = 0;
    if (body.coupon_code) {
      const { data: c } = await sb.from('coupons')
        .select('*').eq('code', body.coupon_code.toUpperCase())
        .eq('status', 'active').maybeSingle();
      if (!c) throw ERR.INVALID_COUPON('Cupón inexistente o inactivo');
      if (c.uses_count >= c.max_uses) throw ERR.INVALID_COUPON('Cupón agotado');
      if (c.valid_until && new Date(c.valid_until) < new Date()) throw ERR.INVALID_COUPON('Cupón vencido');
      if (c.valid_from && new Date(c.valid_from) > new Date()) throw ERR.INVALID_COUPON('Cupón aún no activo');
      coupon = c;
      discount_cop = c.discount_cop;
    }

    const subtotal = zone.price_cop * quantity;
    const total = Math.max(0, subtotal - discount_cop);
    const wompi_reference = `NS-${crypto.randomUUID()}`;

    // Insertar order
    const { data: order, error: oErr } = await sb.from('orders').insert({
      event_id: zone.event_id,
      zone_id: zone.id,
      buyer_name: body.buyer.name.trim(),
      buyer_id_number: body.buyer.id_number,
      buyer_phone: body.buyer.phone,
      buyer_email: body.buyer.email.toLowerCase(),
      quantity,
      subtotal_cop: subtotal,
      discount_cop,
      total_cop: total,
      coupon_id: coupon?.id || null,
      referrer_id: coupon?.referrer_id || null,
      attribution: body.attribution || {},
      wompi_reference,
      client_ip: ip,
      user_agent: req.headers.get('user-agent') || '',
    }).select().single();
    if (oErr) throw new AppError('DB', 500, oErr.message);

    // Reservar asientos (Cantas)
    if (zone.seating_mode === 'numbered') {
      const holds = seat_ids.map(seat_id => ({ seat_id, order_id: order.id }));
      const { data: inserted, error: hErr } = await sb.from('seat_holds')
        .upsert(holds, { onConflict: 'seat_id', ignoreDuplicates: true })
        .select('seat_id');

      if (hErr) throw new AppError('DB', 500, hErr.message);

      const insertedIds = new Set((inserted || []).map(h => h.seat_id));
      const unavailable = seat_ids.filter(id => !insertedIds.has(id));
      if (unavailable.length > 0) {
        // Rollback: borrar order + holds que sí entraron
        await sb.from('orders').delete().eq('id', order.id);
        throw ERR.SEATS_TAKEN({ unavailable_seat_ids: unavailable });
      }
    }

    // Generar integrity signature para el widget Wompi
    const integrity = await generateIntegritySignature(wompi_reference, total * 100);

    return jsonResponse({
      order_id: order.id,
      order_number: order.order_number,
      wompi_reference,
      total_cop: total,
      subtotal_cop: subtotal,
      discount_cop,
      expires_at: order.expires_at,
      public_key: Deno.env.get('WOMPI_PUBLIC_KEY'),
      integrity_signature: integrity,
      buyer_email: order.buyer_email,
      seats: seat_ids,
    });
  } catch (e) {
    if (e instanceof AppError) {
      return jsonResponse({ error: e.code, message: e.message, ...((e.extra as object) || {}) }, e.httpStatus);
    }
    console.error('[create-order]', e);
    return jsonResponse({ error: 'INTERNAL', message: String(e) }, 500);
  }
});

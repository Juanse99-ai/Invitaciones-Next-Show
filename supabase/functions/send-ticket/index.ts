import { getServiceClient } from '../_shared/supabase.ts';
import { jsonResponse } from '../_shared/cors.ts';
import { generateQrPng, generateQrDataUrl } from '../_shared/qr.ts';
import { generateTicketPdf } from '../_shared/pdf.ts';
import { sendEmail } from '../_shared/email.ts';
import { sendWhatsAppTemplate } from '../_shared/whatsapp.ts';
import { signToken } from '../_shared/signing.ts';

Deno.serve(async (req) => {
  const { order_id } = await req.json();
  const sb = getServiceClient();

  const { data: order } = await sb.from('orders')
    .select('*, zones(*), events(*)').eq('id', order_id).single();
  if (!order) return jsonResponse({ error: 'NOT_FOUND' }, 404);

  const { data: tickets } = await sb.from('tickets')
    .select('*, seats(row_label, seat_number)').eq('order_id', order_id);

  const baseUrl = Deno.env.get('APP_BASE_URL')!;
  const eventDate = new Date(order.events.event_date).toLocaleString('es-CO', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota',
  });

  let i = 1;
  for (const t of tickets || []) {
    const qrUrl = `${baseUrl}/v?t=${t.ticket_code}`;
    const qrPng = await generateQrPng(qrUrl);
    const seatLabel = t.seats ? `Fila ${t.seats.row_label} · Silla ${t.seats.seat_number}` : undefined;

    const pdfBytes = await generateTicketPdf({
      order_number: order.order_number,
      buyer_name: order.buyer_name,
      attendee_name: t.attendee_name,
      zone_name: order.zones.name,
      seat_label: seatLabel,
      ticket_index: i,
      ticket_total: tickets!.length,
      event_name: order.events.name,
      event_date: eventDate,
      venue: order.events.venue,
      qr_png: qrPng,
    });

    // Subir a Storage
    const path = `${order.id}/${t.ticket_code}.pdf`;
    await sb.storage.from('tickets').upload(path, pdfBytes, {
      contentType: 'application/pdf', upsert: true,
    });
    const { data: signed } = await sb.storage.from('tickets')
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    await sb.from('tickets').update({ pdf_url: signed?.signedUrl }).eq('id', t.id);

    const assignToken = await signToken(Deno.env.get('ASSIGN_SIGNING_SECRET')!, order.id);
    const assignUrl = `${baseUrl}/asignar.html?o=${order.id}&token=${encodeURIComponent(assignToken)}`;

    // Email
    await sb.from('delivery_log').insert({ ticket_id: t.id, channel: 'email', status: 'pending' });
    try {
      const qrDataUrl = await generateQrDataUrl(qrUrl);
      await sendEmail(
        order.buyer_email,
        `Tu boleta NEXT SHOW · ${order.order_number}`,
        ticketEmailHtml(order, t, seatLabel, signed?.signedUrl || '', assignUrl, qrDataUrl, eventDate),
        []
      );
      await sb.from('delivery_log').update({ status: 'sent', last_attempt_at: new Date().toISOString() })
        .eq('ticket_id', t.id).eq('channel', 'email');
    } catch (e) {
      await sb.from('delivery_log').update({
        status: 'failed', last_error: String(e), last_attempt_at: new Date().toISOString(),
      }).eq('ticket_id', t.id).eq('channel', 'email');
    }

    // WhatsApp
    await sb.from('delivery_log').insert({ ticket_id: t.id, channel: 'whatsapp', status: 'pending' });
    try {
      await sendWhatsAppTemplate(`57${order.buyer_phone}`, Deno.env.get('WA_TEMPLATE_TICKET')!, [
        order.buyer_name, order.order_number, signed?.signedUrl || '',
      ]);
      await sb.from('delivery_log').update({ status: 'sent', last_attempt_at: new Date().toISOString() })
        .eq('ticket_id', t.id).eq('channel', 'whatsapp');
    } catch (e) {
      await sb.from('delivery_log').update({
        status: 'failed', last_error: String(e), last_attempt_at: new Date().toISOString(),
      }).eq('ticket_id', t.id).eq('channel', 'whatsapp');
    }

    i++;
  }

  return jsonResponse({ ok: true, sent: tickets?.length || 0 });
});

// deno-lint-ignore no-explicit-any
function ticketEmailHtml(order: any, _t: any, seat: string | undefined, pdfUrl: string, assignUrl: string, qrDataUrl: string, eventDate: string): string {
  return `
<!doctype html><html><body style="font-family: -apple-system, sans-serif; background: #0a0612; color: #f5f3ff; padding: 40px;">
  <div style="max-width: 560px; margin: 0 auto; background: #14091f; border-radius: 12px; padding: 32px;">
    <h1 style="color: #d946ef; font-size: 28px; margin: 0;">NEXT SHOW</h1>
    <p style="color: #a39db8;">Toromobolo + Jair Luquez</p>
    <h2 style="margin-top: 24px;">¡Tu boleta está lista!</h2>
    <p>Hola <strong>${order.buyer_name}</strong>, tu pago fue aprobado.</p>
    <div style="background: #1a0d2e; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 4px 0;"><strong>Orden:</strong> ${order.order_number}</p>
      <p style="margin: 4px 0;"><strong>Evento:</strong> ${eventDate}</p>
      <p style="margin: 4px 0;"><strong>Lugar:</strong> ${order.events.venue}</p>
      <p style="margin: 4px 0;"><strong>Zona:</strong> ${order.zones.name}</p>
      ${seat ? `<p style="margin: 4px 0;"><strong>Asiento:</strong> ${seat}</p>` : ''}
    </div>
    <div style="text-align: center; margin: 32px 0;">
      <img src="${qrDataUrl}" alt="QR" style="max-width: 240px;" />
    </div>
    <a href="${pdfUrl}" style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #ec4899); color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600;">Descargar PDF</a>
    <p style="margin-top: 24px;">Recordá <a href="${assignUrl}" style="color: #d946ef;">asignar el nombre</a> de quien usará cada boleta antes del evento.</p>
    <p style="color: #6b6480; font-size: 12px; margin-top: 32px;">Boleta personal e intransferible. Se exige cédula coincidente con el nombre del asistente.</p>
  </div>
</body></html>`;
}

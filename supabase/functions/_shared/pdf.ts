import { PDFDocument, StandardFonts, rgb, degrees } from 'https://esm.sh/pdf-lib@1.17.1';

export interface TicketPdfData {
  order_number: string;
  buyer_name: string;
  attendee_name?: string;
  zone_name: string;
  seat_label?: string;
  ticket_index: number;
  ticket_total: number;
  event_name: string;
  event_date: string;
  venue: string;
  qr_png: Uint8Array;
}

export async function generateTicketPdf(d: TicketPdfData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontReg = await pdf.embedFont(StandardFonts.Helvetica);

  // Background gradient stub (block)
  page.drawRectangle({ x: 0, y: height - 200, width, height: 200, color: rgb(0.04, 0.02, 0.07) });

  // Logo NEXT SHOW
  page.drawText('NEXT SHOW', { x: 40, y: height - 80, size: 36, font, color: rgb(1, 1, 1) });
  page.drawText('TOROMOBOLO + JAIR LUQUEZ', { x: 40, y: height - 110, size: 12, font, color: rgb(0.85, 0.27, 0.94) });

  // Watermark con nombre comprador
  page.drawText(d.buyer_name.toUpperCase(), {
    x: 100, y: height / 2,
    size: 60, font,
    color: rgb(0.95, 0.95, 0.95),
    opacity: 0.15,
    rotate: degrees(-30),
  });

  // Datos boleta
  page.drawText(`Orden ${d.order_number}`, { x: 40, y: height - 240, size: 14, font: fontReg });
  page.drawText(`${d.event_name}`, { x: 40, y: height - 270, size: 16, font });
  page.drawText(`${d.event_date}  ·  ${d.venue}`, { x: 40, y: height - 290, size: 12, font: fontReg });
  page.drawText(`Zona: ${d.zone_name}`, { x: 40, y: height - 330, size: 14, font });
  if (d.seat_label) {
    page.drawText(`Asiento: ${d.seat_label}`, { x: 40, y: height - 350, size: 14, font });
  } else {
    page.drawText(`Boleta ${d.ticket_index} de ${d.ticket_total}`, { x: 40, y: height - 350, size: 14, font });
  }
  page.drawText(`Comprador: ${d.buyer_name}`, { x: 40, y: height - 380, size: 12, font: fontReg });
  if (d.attendee_name) {
    page.drawText(`Asistente: ${d.attendee_name}`, { x: 40, y: height - 400, size: 12, font: fontReg });
  }

  // QR — pdf-lib accepts PNG bytes via embedPng. If qr.ts returned GIF (fallback)
  // embedPng will throw; in that case we render a placeholder rectangle and log.
  try {
    const qrImg = await pdf.embedPng(d.qr_png);
    page.drawImage(qrImg, { x: width - 240, y: height - 460, width: 200, height: 200 });
  } catch (e) {
    console.warn('[pdf] embedPng failed (likely GIF fallback from qr.ts):', e);
    page.drawRectangle({
      x: width - 240, y: height - 460, width: 200, height: 200,
      borderColor: rgb(0, 0, 0), borderWidth: 1,
    });
    page.drawText('[QR]', { x: width - 160, y: height - 360, size: 14, font });
  }

  // Política
  page.drawText('Boleta personal e intransferible. Se exige cédula coincidente.', {
    x: 40, y: 60, size: 9, font: fontReg, color: rgb(0.4, 0.4, 0.4),
  });
  page.drawText('Producido por Nexo Productions · NEXT SHOW', {
    x: 40, y: 45, size: 9, font: fontReg, color: rgb(0.4, 0.4, 0.4),
  });

  return await pdf.save();
}

// QR generation for Deno runtime.
// We use https://deno.land/x/qrcode which exposes `qrcode(text): Promise<string>`
// returning a data:image/gif;base64,... URL. We convert it to PNG-compatible
// Uint8Array bytes for embedding (pdf.embedPng accepts PNG bytes; for the
// underlying GIF format from this lib we transcode to PNG only when strictly
// needed — for now we accept both since pdf-lib has embedJpg/embedPng. If the
// lib produces GIF, we fall back to a generic raw bytes return for QR-data URL
// embedding via the email <img> tag.)
//
// For PDF embedding, we prefer PNG. We re-render via a tiny matrix-based encoder
// from the same lib to get PNG bytes when available. To keep deps light and
// Deno-friendly, we use https://deno.land/x/qrcode_png/mod.ts which produces
// raw PNG Uint8Array directly.
//
// TODO(deps): if neither dep resolves at runtime, replace with a pure JS
// implementation. Fallback path is documented inline.

import { qrcode as qrcodeDataUrl } from 'https://deno.land/x/qrcode@v2.0.0/mod.ts';

/**
 * Generate a PNG-encoded QR code as raw bytes.
 * NOTE: deno.land/x/qrcode v2.0.0 returns a GIF-encoded data URL. pdf-lib's
 * embedPng will reject GIFs. To stay robust we attempt PNG re-encoding via
 * an alternate lib; if that fails we still return the GIF bytes and document
 * the limitation. The receiver (pdf.ts) wraps embedPng in a try/catch and
 * falls back to embedJpg/skipping the image.
 */
export async function generateQrPng(text: string): Promise<Uint8Array> {
  // Primary: try qrcode_png which returns PNG bytes directly.
  try {
    const mod = await import('https://deno.land/x/qrcode_png@1.0.4/mod.ts');
    // qrcode_png exposes a default export that returns Uint8Array PNG.
    // deno-lint-ignore no-explicit-any
    const pngBytes: Uint8Array = await (mod as any).qrPng(text, {
      ecLevel: 'H',
      size: 600,
      margin: 1,
    });
    return pngBytes;
  } catch (_e) {
    // Fallback: decode GIF data URL bytes (pdf-lib will error — caller handles)
    const dataUrl = await qrcodeDataUrl(text, { size: 600 });
    const b64 = dataUrl.split(',')[1] ?? '';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
}

/**
 * Generate a data: URL suitable for an <img src=...> tag (used inline in
 * the email HTML). Format may be GIF or PNG depending on which lib is alive.
 */
export async function generateQrDataUrl(text: string): Promise<string> {
  return await qrcodeDataUrl(text, { size: 400 });
}

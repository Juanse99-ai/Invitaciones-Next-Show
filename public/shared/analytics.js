/**
 * NEXT SHOW · Analytics wrappers
 *
 * Cubre:
 *  - Meta Pixel (window.fbq)
 *  - TikTok Pixel (window.ttq)
 *  - Google Analytics 4 (window.gtag)
 *
 * Si los pixel IDs no estan configurados (placeholder o vacios) no-op silencioso.
 * En dev imprime logs en consola para verificar que se disparan los eventos.
 */

const DEV = ['localhost', '127.0.0.1'].includes(window.location.hostname);

function safeFbq(...args) {
  try {
    if (typeof window.fbq === 'function') window.fbq(...args);
    else if (DEV) console.debug('[analytics] fbq no cargado:', args);
  } catch (err) {
    if (DEV) console.warn('[analytics] fbq error:', err);
  }
}

function safeTtq(eventName, payload) {
  try {
    if (window.ttq && typeof window.ttq.track === 'function') {
      window.ttq.track(eventName, payload);
    } else if (DEV) console.debug('[analytics] ttq no cargado:', eventName, payload);
  } catch (err) {
    if (DEV) console.warn('[analytics] ttq error:', err);
  }
}

function safeGtag(...args) {
  try {
    if (typeof window.gtag === 'function') window.gtag(...args);
    else if (DEV) console.debug('[analytics] gtag no cargado:', args);
  } catch (err) {
    if (DEV) console.warn('[analytics] gtag error:', err);
  }
}

/** Vio info de una zona (modal abierto en step 1). */
export function trackViewContent({ zone } = {}) {
  safeFbq('track', 'ViewContent', { content_name: zone, content_category: 'tickets' });
  safeTtq('ViewContent', { content_id: zone, content_type: 'product' });
  safeGtag('event', 'view_item', { item_id: zone, item_category: 'tickets' });
  if (DEV) console.debug('[analytics] view_content', zone);
}

/** Selecciono asientos / cantidad. */
export function trackAddToCart({ zone, qty, value } = {}) {
  const payload = { content_name: zone, content_ids: [zone], num_items: qty, value, currency: 'COP' };
  safeFbq('track', 'AddToCart', payload);
  safeTtq('AddToCart', { content_id: zone, quantity: qty, value, currency: 'COP' });
  safeGtag('event', 'add_to_cart', { items: [{ item_id: zone, quantity: qty, price: value / Math.max(qty,1) }], value, currency: 'COP' });
  if (DEV) console.debug('[analytics] add_to_cart', payload);
}

/** Submit form datos comprador → init checkout. */
export function trackInitiateCheckout({ value } = {}) {
  safeFbq('track', 'InitiateCheckout', { value, currency: 'COP' });
  safeTtq('InitiateCheckout', { value, currency: 'COP' });
  safeGtag('event', 'begin_checkout', { value, currency: 'COP' });
  if (DEV) console.debug('[analytics] initiate_checkout', value);
}

/** Pago APPROVED. */
export function trackPurchase({ value, orderId } = {}) {
  safeFbq('track', 'Purchase', { value, currency: 'COP', order_id: orderId });
  safeTtq('CompletePayment', { value, currency: 'COP', content_id: orderId });
  safeGtag('event', 'purchase', { transaction_id: orderId, value, currency: 'COP' });
  if (DEV) console.debug('[analytics] purchase', orderId, value);
}

export default { trackViewContent, trackAddToCart, trackInitiateCheckout, trackPurchase };

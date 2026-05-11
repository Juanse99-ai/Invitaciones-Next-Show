/**
 * NEXT SHOW · Wompi widget wrapper
 *
 * Carga el script oficial https://checkout.wompi.co/widget.js dinamicamente
 * y expone openCheckout() que devuelve una Promise con el resultado.
 *
 * Si la public key no esta configurada (placeholder pub_test_REPLACE_ME),
 * simula un pago aprobado para poder testear el Step 4 sin Wompi real.
 */

const WOMPI_WIDGET_URL = 'https://checkout.wompi.co/widget.js';
let widgetPromise = null;

function loadWidget() {
  if (widgetPromise) return widgetPromise;
  widgetPromise = new Promise((resolve, reject) => {
    if (window.WidgetCheckout) return resolve(window.WidgetCheckout);
    const s = document.createElement('script');
    s.src = WOMPI_WIDGET_URL;
    s.async = true;
    s.onload = () => {
      if (window.WidgetCheckout) resolve(window.WidgetCheckout);
      else reject(new Error('Wompi widget cargo pero WidgetCheckout no esta definido'));
    };
    s.onerror = () => reject(new Error('No se pudo cargar el widget de Wompi'));
    document.head.appendChild(s);
  });
  return widgetPromise;
}

function isPlaceholderKey(key) {
  if (!key) return true;
  if (key.includes('REPLACE') || key.includes('REEMPLAZAR')) return true;
  if (key === 'pub_test_REPLACE_ME') return true;
  return false;
}

/**
 * Abre el widget Wompi y resuelve cuando el usuario completa o cancela.
 *
 * @param {object} cfg
 * @param {string} cfg.publicKey         pub_test_... o pub_prod_...
 * @param {string} cfg.reference         Referencia unica de orden
 * @param {number} cfg.amountInCents     Monto total en centavos COP
 * @param {string} cfg.integrity         Firma de integridad SHA-256 (hex)
 * @param {string} cfg.customerEmail     Email del comprador
 * @param {string} [cfg.currency='COP']
 * @param {string} [cfg.redirectUrl]     Si quiere redirect post-pago
 * @returns {Promise<{transaction: object|null, mocked?: boolean, dismissed?: boolean}>}
 */
export async function openCheckout(cfg) {
  const {
    publicKey,
    reference,
    amountInCents,
    integrity,
    customerEmail,
    currency = 'COP',
    redirectUrl,
  } = cfg;

  // Sandbox no configurado: simula pago aprobado para no bloquear el flujo
  if (isPlaceholderKey(publicKey)) {
    console.warn('[wompi] public key es placeholder, simulando pago APPROVED para test del flujo Step 4');
    return new Promise((resolve) => {
      // Mostrar un pequeno modal nativo de confirmacion para simular
      setTimeout(() => {
        resolve({
          mocked: true,
          transaction: {
            id: `MOCK-${reference}-${Date.now()}`,
            status: 'APPROVED',
            reference,
            amount_in_cents: amountInCents,
            currency,
            customer_email: customerEmail,
          },
        });
      }, 1500);
    });
  }

  const Widget = await loadWidget();

  return new Promise((resolve) => {
    const checkout = new Widget({
      currency,
      amountInCents,
      reference,
      publicKey,
      signature: { integrity },
      customerData: customerEmail ? { email: customerEmail } : undefined,
      redirectUrl,
    });

    checkout.open((result) => {
      // result.transaction = { id, status: APPROVED|DECLINED|VOIDED|ERROR|PENDING, ... }
      // si el usuario cierra sin pagar, transaction puede ser null
      resolve({
        transaction: result?.transaction || null,
        dismissed: !result?.transaction,
        raw: result,
      });
    });
  });
}

export default { openCheckout };

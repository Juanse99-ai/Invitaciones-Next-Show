const WOMPI_API = 'https://sandbox.wompi.co/v1';

export interface WompiTransaction {
  id: string;
  reference: string;
  status: 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'PENDING';
  amount_in_cents: number;
  payment_method_type: string;
  customer_email: string;
}

export async function fetchWompiTransaction(id: string): Promise<WompiTransaction> {
  const key = Deno.env.get('WOMPI_PRIVATE_KEY')!;
  const r = await fetch(`${WOMPI_API}/transactions/${id}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!r.ok) throw new Error(`Wompi fetch failed: ${r.status}`);
  return (await r.json()).data;
}

export async function refundWompiTransaction(id: string, amount_in_cents: number) {
  const key = Deno.env.get('WOMPI_PRIVATE_KEY')!;
  const r = await fetch(`${WOMPI_API}/transactions/${id}/refunds`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount_in_cents }),
  });
  if (!r.ok) throw new Error(`Wompi refund failed: ${r.status}`);
  return await r.json();
}

export async function generateIntegritySignature(
  reference: string,
  amount_in_cents: number,
  currency = 'COP'
): Promise<string> {
  const secret = Deno.env.get('WOMPI_INTEGRITY_SECRET')!;
  const message = `${reference}${amount_in_cents}${currency}${secret}`;
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(message));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

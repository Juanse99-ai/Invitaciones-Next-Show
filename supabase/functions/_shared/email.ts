// deno-lint-ignore no-explicit-any
export async function sendEmail(to: string, subject: string, html: string, attachments: any[] = []) {
  const key = Deno.env.get('RESEND_API_KEY')!;
  const from = Deno.env.get('RESEND_FROM_EMAIL')!;
  if (key === 'mock') {
    console.log('[MOCK EMAIL]', { to, subject, attachments_count: attachments.length });
    return { id: 'mock-' + crypto.randomUUID() };
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html, attachments }),
  });
  if (!r.ok) throw new Error(`Resend error: ${r.status} ${await r.text()}`);
  return await r.json();
}

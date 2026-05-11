export async function sendWhatsAppTemplate(
  to: string,
  template: string,
  params: string[]
) {
  const token = Deno.env.get('WA_CLOUD_TOKEN')!;
  if (token === 'mock') {
    console.log('[MOCK WA]', { to, template, params });
    return { ok: true, mock: true };
  }
  const phoneId = Deno.env.get('WA_PHONE_NUMBER_ID')!;
  const r = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: template,
        language: { code: 'es' },
        components: [{ type: 'body', parameters: params.map(text => ({ type: 'text', text })) }],
      },
    }),
  });
  if (!r.ok) throw new Error(`WA error: ${r.status} ${await r.text()}`);
  return await r.json();
}

export async function sendWhatsAppText(to: string, body: string) {
  const token = Deno.env.get('WA_CLOUD_TOKEN')!;
  if (token === 'mock') {
    console.log('[MOCK WA TEXT]', { to, body });
    return { ok: true, mock: true };
  }
  const phoneId = Deno.env.get('WA_PHONE_NUMBER_ID')!;
  const r = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  });
  if (!r.ok) throw new Error(`WA error: ${r.status} ${await r.text()}`);
  return await r.json();
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function signToken(secret: string, payload: string): Promise<string> {
  const sig = await hmacSha256(secret, payload);
  return `${btoa(payload)}.${sig}`;
}

export async function verifyToken(secret: string, token: string): Promise<string | null> {
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return null;
  let payload: string;
  try {
    payload = atob(b64);
  } catch {
    return null;
  }
  const expected = await hmacSha256(secret, payload);
  if (expected !== sig) return null;
  return payload;
}

export async function verifyWompiSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const expected = await hmacSha256(secret, body);
  return expected === signature;
}

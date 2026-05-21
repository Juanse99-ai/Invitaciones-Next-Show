import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyMetaWebhookSignature } from '../../supabase/functions/_shared/signing.ts';

const secret = 'test_meta_app_secret';

function sign(body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

describe('verifyMetaWebhookSignature', () => {
  it('accepts valid signature with sha256= prefix', async () => {
    const body = '{"object":"whatsapp_business_account"}';
    expect(await verifyMetaWebhookSignature(body, sign(body), secret)).toBe(true);
  });
  it('rejects tampered body', async () => {
    const body = '{"object":"whatsapp_business_account"}';
    expect(await verifyMetaWebhookSignature(body + 'tampered', sign(body), secret)).toBe(false);
  });
  it('rejects missing signature', async () => {
    expect(await verifyMetaWebhookSignature('{}', '', secret)).toBe(false);
  });
  it('rejects malformed signature (no prefix)', async () => {
    const body = '{}';
    const sig = createHmac('sha256', secret).update(body).digest('hex');  // no sha256= prefix
    expect(await verifyMetaWebhookSignature(body, sig, secret)).toBe(false);
  });
});

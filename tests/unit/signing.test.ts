import { describe, it, expect } from 'vitest';
import { signToken, verifyToken } from '../../supabase/functions/_shared/signing.ts';

describe('signing', () => {
  it('round-trips a payload', async () => {
    const t = await signToken('secret', 'hello');
    const p = await verifyToken('secret', t);
    expect(p).toBe('hello');
  });

  it('rejects tampered payload', async () => {
    const t = await signToken('secret', 'hello');
    const tampered = t.slice(0, -2) + 'xx';
    const p = await verifyToken('secret', tampered);
    expect(p).toBe(null);
  });

  it('rejects wrong secret', async () => {
    const t = await signToken('secret', 'hello');
    const p = await verifyToken('other', t);
    expect(p).toBe(null);
  });
});

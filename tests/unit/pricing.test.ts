import { describe, it, expect } from 'vitest';
import { calculateTotal } from '../../supabase/functions/_shared/errors.ts';

describe('pricing.calculateTotal', () => {
  it('computes subtotal/total without coupon', () => {
    const r = calculateTotal(100_000, 2);
    expect(r.subtotal).toBe(200_000);
    expect(r.discount).toBe(0);
    expect(r.total).toBe(200_000);
  });

  it('applies a fixed-amount discount', () => {
    const r = calculateTotal(100_000, 2, 50_000);
    expect(r.subtotal).toBe(200_000);
    expect(r.discount).toBe(50_000);
    expect(r.total).toBe(150_000);
  });

  it('clamps total to 0 when discount exceeds subtotal', () => {
    const r = calculateTotal(100_000, 1, 250_000);
    expect(r.subtotal).toBe(100_000);
    expect(r.discount).toBe(250_000);
    expect(r.total).toBe(0);
  });
});

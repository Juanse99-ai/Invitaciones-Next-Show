import { describe, it, expect } from 'vitest';
import { transition, type ConvState, type Event } from '../../supabase/functions/_shared/wa-state.ts';

describe('wa-state transition', () => {
  const baseCtx = { phone: '+573001234567' };

  it('idle + text "hola" → greet', () => {
    const next = transition({ state: 'idle', context: baseCtx }, { type: 'text', text: 'hola' });
    expect(next.state).toBe('greet');
    expect(next.actions[0].kind).toBe('send_greeting');
  });

  it('greet + button "start" → quantity', () => {
    const next = transition({ state: 'greet', context: baseCtx }, { type: 'button', id: 'start' });
    expect(next.state).toBe('quantity');
  });

  it('quantity + button "qty_3" → buyer_name with qty=3 in context', () => {
    const next = transition({ state: 'quantity', context: baseCtx }, { type: 'button', id: 'qty_3' });
    expect(next.state).toBe('buyer_name');
    expect(next.context.qty).toBe(3);
  });

  it('quantity + button "qty_more" → group_handoff', () => {
    const next = transition({ state: 'quantity', context: baseCtx }, { type: 'button', id: 'qty_more' });
    expect(next.state).toBe('group_handoff');
    expect(next.actions.some(a => a.kind === 'notify_staff')).toBe(true);
  });

  it('buyer_name + text "Juan Pérez" → buyer_cedula', () => {
    const next = transition(
      { state: 'buyer_name', context: { ...baseCtx, qty: 2 } },
      { type: 'text', text: 'Juan Pérez' },
    );
    expect(next.state).toBe('buyer_cedula');
    expect(next.context.name).toBe('Juan Pérez');
  });

  it('buyer_cedula + invalid cedula stays in buyer_cedula with retry msg', () => {
    const next = transition(
      { state: 'buyer_cedula', context: { ...baseCtx, qty: 2, name: 'J' } },
      { type: 'text', text: 'abc' },
    );
    expect(next.state).toBe('buyer_cedula');
    expect(next.actions[0].kind).toBe('send_invalid_cedula');
  });

  it('buyer_cedula + valid 10-digit cedula → email_opt', () => {
    const next = transition(
      { state: 'buyer_cedula', context: { ...baseCtx, qty: 2, name: 'J' } },
      { type: 'text', text: '1234567890' },
    );
    expect(next.state).toBe('email_opt');
    expect(next.context.cedula).toBe('1234567890');
  });

  it('email_opt + text "saltar" → confirm', () => {
    const next = transition(
      { state: 'email_opt', context: { ...baseCtx, qty: 2, name: 'J', cedula: '1234567890' } },
      { type: 'text', text: 'saltar' },
    );
    expect(next.state).toBe('confirm');
    expect(next.context.email).toBeUndefined();
  });

  it('email_opt + valid email → confirm with email set', () => {
    const next = transition(
      { state: 'email_opt', context: { ...baseCtx, qty: 2, name: 'J', cedula: '1234567890' } },
      { type: 'text', text: 'a@b.co' },
    );
    expect(next.state).toBe('confirm');
    expect(next.context.email).toBe('a@b.co');
  });

  it('confirm + button "pay" → payment_pending with create_order action', () => {
    const next = transition(
      { state: 'confirm', context: { ...baseCtx, qty: 2, name: 'J', cedula: '1234567890', zone: 'risas' } },
      { type: 'button', id: 'pay' },
    );
    expect(next.state).toBe('payment_pending');
    expect(next.actions.some(a => a.kind === 'create_order')).toBe(true);
  });

  it('any state + text "menu" → reset to greet', () => {
    const next = transition({ state: 'payment_pending', context: baseCtx }, { type: 'text', text: 'menu' });
    expect(next.state).toBe('greet');
  });

  it('any state + text "mi boleta" → recover_qr', () => {
    const next = transition({ state: 'idle', context: baseCtx }, { type: 'text', text: 'mi boleta' });
    expect(next.state).toBe('recover_qr');
  });

  it('three consecutive fallbacks → fallback state with handoff action', () => {
    let s: ConvState = { state: 'greet', context: { ...baseCtx, fallback_count: 2 } };
    const next = transition(s, { type: 'text', text: 'gibberish' });
    expect(next.state).toBe('fallback');
    expect(next.actions.some(a => a.kind === 'notify_staff')).toBe(true);
  });

  it('paid + generic text → send_post_purchase_info action, stays paid', () => {
    const next = transition({ state: 'paid', context: baseCtx }, { type: 'text', text: '¿dónde recoger?' });
    expect(next.state).toBe('paid');
    expect(next.actions.some(a => a.kind === 'send_post_purchase_info')).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.SUPABASE_URL;
const SVC    = process.env.SUPABASE_SERVICE_ROLE_KEY;
const maybeIt = (SB_URL && SVC) ? it : it.skip;

const sb = SB_URL && SVC ? createClient(SB_URL, SVC) : null;

async function callCalc(zoneCode: 'risas' | 'cantas', qty: number): Promise<number> {
  if (!sb) throw new Error('SB env missing');
  const { data: zone } = await sb.from('zones').select('id').eq('code', zoneCode).single();
  const { data, error } = await sb.rpc('calc_price', { p_zone_id: zone!.id, p_qty: qty });
  if (error) throw error;
  return data as number;
}

describe('calc_price', () => {
  maybeIt('RISAS 1 boleta = 75000',  async () => expect(await callCalc('risas', 1)).toBe(75000));
  maybeIt('RISAS 5 boletas = 375000 (no volume yet)', async () => expect(await callCalc('risas', 5)).toBe(375000));
  maybeIt('RISAS 6 boletas = 420000 (volume discount kicks in at 6)', async () => expect(await callCalc('risas', 6)).toBe(420000));
  maybeIt('RISAS 10 boletas = 700000 (volume)', async () => expect(await callCalc('risas', 10)).toBe(700000));
  maybeIt('CANTAS 1 boleta = 100000', async () => expect(await callCalc('cantas', 1)).toBe(100000));
  maybeIt('CANTAS 6 boletas = 600000 (no volume discount on CANTAS)', async () => expect(await callCalc('cantas', 6)).toBe(600000));
});

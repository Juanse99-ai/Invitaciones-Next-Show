/**
 * NEXT SHOW · Supabase client
 *
 * Lightweight wrapper sobre fetch para REST + Edge Functions.
 * Realtime se carga on-demand via esm.sh para no inflar el bundle inicial.
 *
 * Configuracion: window.NEXTSHOW_CONFIG = { SUPABASE_URL, SUPABASE_ANON_KEY }
 * Si no esta seteado, usa defaults del stack local de Supabase.
 */

const SUPABASE_URL = window.NEXTSHOW_CONFIG?.SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = window.NEXTSHOW_CONFIG?.SUPABASE_ANON_KEY || '';

export const sb = {
  url: SUPABASE_URL,
  key: SUPABASE_ANON_KEY,

  /**
   * Query REST API (PostgREST) sobre una tabla o vista.
   * @param {string} table  Tabla o vista
   * @param {object} opts
   * @param {string} opts.select  Columnas (default '*')
   * @param {object} opts.filters Mapa de filtros PostgREST: { 'zone_id': 'eq.X', 'status': 'eq.paid' }
   * @param {string} opts.order   ORDER (e.g. 'paid_at.desc')
   * @param {number} opts.limit
   * @param {boolean} opts.single Devuelve primer elemento
   */
  async query(table, { select = '*', filters = {}, order, limit, single = false } = {}) {
    const params = new URLSearchParams({ select });
    for (const [k, v] of Object.entries(filters)) params.set(k, v);
    if (order) params.set('order', order);
    if (limit != null) params.set('limit', String(limit));
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error(`Query ${table} failed: ${r.status} ${txt}`);
    }
    const data = await r.json();
    return single ? data[0] : data;
  },

  /**
   * Invoca una Edge Function por nombre.
   * @param {string} name  Funcion (e.g. 'create-order')
   * @param {object} body  Cuerpo JSON
   * @returns {Promise<object>} Respuesta parseada
   */
  async fn(name, body = {}) {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error(data.message || data.error || `Edge function ${name} failed (${r.status})`);
      err.code = data.error || `HTTP_${r.status}`;
      err.status = r.status;
      err.extra = data;
      throw err;
    }
    return data;
  },

  realtime: null,

  /**
   * Carga el cliente oficial de Supabase desde esm.sh (lazy) para Realtime channels.
   * Devuelve el SupabaseClient (cacheado entre llamadas).
   */
  async loadRealtime() {
    if (this.realtime) return this.realtime;
    try {
      const mod = await import('https://esm.sh/@supabase/supabase-js@2.45.0');
      this.realtime = mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        realtime: { params: { eventsPerSecond: 5 } },
      });
      return this.realtime;
    } catch (err) {
      console.warn('[supabase] realtime no disponible:', err.message);
      return null;
    }
  },
};

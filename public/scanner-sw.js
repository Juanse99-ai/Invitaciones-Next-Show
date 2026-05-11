/**
 * NEXT SHOW · Scanner Service Worker
 *
 * Estrategia:
 *  - Shell (scanner.html, manifest, iconos, jsQR): cache-first.
 *  - scanner-manifest endpoint: network-first (refresca tickets), fallback cache.
 *  - validate-ticket endpoint: network-only; si offline, encolar en IndexedDB.
 *  - Background Sync: drenar la cola al recuperar conexión.
 *
 * Cache name versionado para invalidar al deploy.
 */
'use strict';

const CACHE_NAME = 'ns-scanner-v1';
const MANIFEST_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const MANIFEST_TIMESTAMP_HEADER = 'x-ns-cached-at';

const SHELL_ASSETS = [
  '/scanner.html',
  '/scanner-manifest.json',
  '/assets/icons/scanner-icon.svg',
  '/assets/icons/scanner-icon-maskable.svg',
  '/assets/icons/scanner-192.png',
  '/assets/icons/scanner-512.png',
  '/assets/icons/scanner-maskable.png',
  // jsQR via CDN — fallback offline ya que iOS Safari no tiene BarcodeDetector
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
];

const ENDPOINT_MANIFEST = '/functions/v1/scanner-manifest';
const ENDPOINT_VALIDATE = '/functions/v1/validate-ticket';
const QUEUE_DB_NAME = 'ns-scanner-queue';
const QUEUE_STORE = 'pending_validations';

// ============================================================================
// IndexedDB helpers (vainilla, sin libs)
// ============================================================================

function openQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueueValidation(payload) {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    const req = store.add({
      ...payload,
      queued_at: new Date().toISOString(),
    });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getQueuedValidations() {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const req = tx.objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteQueuedValidation(id) {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const req = tx.objectStore(QUEUE_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ============================================================================
// Lifecycle
// ============================================================================

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // addAll falla si UNO falla — agregamos uno a uno tolerante.
      await Promise.all(
        SHELL_ASSETS.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: 'reload' }));
          } catch (err) {
            console.warn('[sw] no se pudo cachear', url, err);
          }
        })
      );
      await self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })
  );
});

// ============================================================================
// Fetch routing
// ============================================================================

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo manejamos GET/POST. Otros métodos: passthrough.
  if (req.method !== 'GET' && req.method !== 'POST') return;

  // 1. validate-ticket → network-only con queue offline
  if (url.pathname.endsWith(ENDPOINT_VALIDATE)) {
    if (req.method !== 'POST') return;
    event.respondWith(handleValidateTicket(req));
    return;
  }

  // 2. scanner-manifest → network-first con TTL 5min
  if (url.pathname.endsWith(ENDPOINT_MANIFEST)) {
    event.respondWith(handleScannerManifest(req));
    return;
  }

  // 3. Shell assets → cache-first
  if (req.method === 'GET') {
    event.respondWith(handleShellRequest(req));
  }
});

async function handleShellRequest(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req, { ignoreSearch: false });
  if (cached) {
    // Refresco best-effort en background (stale-while-revalidate ligero)
    fetch(req)
      .then((res) => {
        if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      })
      .catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(req);
    // Solo cacheamos respuestas OK del mismo origen o CDN whitelisteado
    if (res && res.ok && (req.url.startsWith(self.location.origin) || isWhitelistedCDN(req.url))) {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    // Sin red, sin cache → para navegaciones devolver scanner.html como fallback
    if (req.mode === 'navigate') {
      const fallback = await cache.match('/scanner.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}

function isWhitelistedCDN(urlStr) {
  return urlStr.startsWith('https://cdn.jsdelivr.net/');
}

async function handleScannerManifest(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) {
      // Clonamos y agregamos timestamp header para que el cliente sepa frescura.
      const cloned = await stampCachedResponse(fresh.clone());
      cache.put(req, cloned).catch(() => {});
    }
    return fresh;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) {
      // Verificamos TTL — si vencido, igual servimos pero con header indicando staleness
      const cachedAt = cached.headers.get(MANIFEST_TIMESTAMP_HEADER);
      const isStale = cachedAt && (Date.now() - new Date(cachedAt).getTime()) > MANIFEST_CACHE_TTL_MS;
      if (isStale) {
        const newHeaders = new Headers(cached.headers);
        newHeaders.set('x-ns-stale', '1');
        const body = await cached.blob();
        return new Response(body, { status: 200, headers: newHeaders });
      }
      return cached;
    }
    return new Response(JSON.stringify({ error: 'offline_no_manifest_cache' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }
}

async function stampCachedResponse(response) {
  const body = await response.blob();
  const headers = new Headers(response.headers);
  headers.set(MANIFEST_TIMESTAMP_HEADER, new Date().toISOString());
  return new Response(body, { status: response.status, headers });
}

async function handleValidateTicket(req) {
  // Necesitamos clonar antes de consumir el body para poder reenviar.
  const cloned = req.clone();
  try {
    const res = await fetch(req);
    return res;
  } catch (err) {
    // Offline: encolar payload para sync posterior y responder con resultado optimista.
    let payload = null;
    try {
      payload = await cloned.json();
    } catch {
      payload = null;
    }
    if (payload) {
      try {
        await enqueueValidation({
          url: req.url,
          headers: serializeHeaders(req.headers),
          body: payload,
        });
        // Registrar background sync si está soportado.
        if ('sync' in self.registration) {
          try {
            await self.registration.sync.register('ns-validate-sync');
          } catch {}
        }
      } catch (e) {
        console.error('[sw] error encolando validación', e);
      }
    }
    // Devolvemos respuesta sintética: el cliente decidirá usando manifest local.
    return new Response(
      JSON.stringify({ result: 'offline_queued', queued_at: new Date().toISOString() }),
      { status: 202, headers: { 'content-type': 'application/json' } }
    );
  }
}

function serializeHeaders(headers) {
  const out = {};
  for (const [k, v] of headers.entries()) out[k] = v;
  return out;
}

// ============================================================================
// Background Sync — drenar cola al recuperar conexión
// ============================================================================

self.addEventListener('sync', (event) => {
  if (event.tag === 'ns-validate-sync') {
    event.waitUntil(drainValidationQueue());
  }
});

// Mensaje desde la página: "drená la cola ahora" (fallback para browsers sin Sync API)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'drain-queue') {
    event.waitUntil(
      drainValidationQueue().then((report) => {
        if (event.source) {
          event.source.postMessage({ type: 'queue-drained', report });
        }
      })
    );
  }
});

async function drainValidationQueue() {
  const items = await getQueuedValidations().catch(() => []);
  const report = { processed: 0, failed: 0, conflicts: [] };
  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: 'POST',
        headers: item.headers || { 'content-type': 'application/json' },
        body: JSON.stringify({ ...item.body, offline_replay: true, queued_at: item.queued_at }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data && data.result === 'already_used') {
          report.conflicts.push({ ticket_code: item.body && item.body.ticket_code, data });
        }
        await deleteQueuedValidation(item.id);
        report.processed++;
      } else {
        report.failed++;
      }
    } catch (e) {
      report.failed++;
    }
  }
  // Notificar a clientes abiertos para que actualicen UI/stats
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    client.postMessage({ type: 'sync-complete', report });
  }
  return report;
}

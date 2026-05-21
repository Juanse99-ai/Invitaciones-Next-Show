# NEXT SHOW Landing Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `public/index.html` cascarón to fix protagonistas (Toromobolo + Jair, not Jair + Natalya), reposition Natalya as host, drop Tarima tier, apply 3-stop cyan→violet→magenta palette, add live FOMO ticker + sticky CTA + snap-scroll desktop. Keep checkout intact.

**Architecture:** Single-file `public/index.html` with inline `<style>` (design tokens + sections) and inline `<script type="module">` (bootstrap + scroll FX + checkout glue). Extract `UrlAttribution` and `FomoEngine` to `public/shared/` ES modules. Reuse existing `CheckoutModal/SeatMap/QuantityStepper/BuyerForm/OrderConfirmation` inline classes verbatim. New `public/assets/img/` directory holds optimized photos.

**Tech Stack:** HTML5 + ES2024 vanilla, CSS custom properties + Grid/Flex, IntersectionObserver, Supabase JS REST/Realtime, Wompi widget, Vitest + Playwright tests, `sips` for image optimization (macOS built-in).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `public/index.html` | rewrite | Full landing markup + inline styles + bootstrap script |
| `public/index.html.pre-rebuild` | new | Backup of pre-rebuild landing (gitignored) |
| `public/shared/url-attribution.js` | new | Extract `UrlAttribution` class as ES module |
| `public/shared/fomo-engine.js` | new | Extract `FomoEngine` class as ES module |
| `public/assets/brand/favicon.svg` | new | Inline SVG favicon (NS glyph + gradient) |
| `public/assets/brand/nextshow-wordmark.svg` | new | SVG wordmark fallback when Anton fails to load |
| `public/assets/img/toromobolo-hero.jpg` | new | 1600w + 800w + .webp variants |
| `public/assets/img/jair-hero.jpg` | new | 1600w + 800w + .webp variants |
| `public/assets/img/natalya.jpg` | new | 1200w + 600w + .webp variants |
| `public/assets/img/venue-cancha-noche.jpg` | new | 2400w + 1200w + .webp variants |
| `public/i18n/es.json` | modify | New section keys |
| `public/i18n/en.json` | modify | New section keys |
| `tests/unit/url-attribution.test.js` | new | Vitest unit tests for extracted module |
| `tests/unit/fomo-engine.test.js` | new | Vitest unit tests for extracted module |
| `tests/e2e/landing-to-checkout.spec.ts` | new | Playwright happy path |
| `tests/visual/landing-sections.spec.ts` | new | Playwright screenshot smoke |
| `.gitignore` | modify | Ignore `public/index.html.pre-rebuild` |

---

## Phase 0 · Prep & safety nets

### Task 0.1: Branch + backup current landing

**Files:**
- Modify: `.gitignore`
- Create: `public/index.html.pre-rebuild`

- [ ] **Step 1: Verify clean working tree**

Run: `git status --short`
Expected: empty or only `recursos/`, `package-lock.json` untracked (those are pre-existing).

- [ ] **Step 2: Create branch from main**

Run:
```bash
git checkout -b feat/landing-rebuild-2026-05-20
```
Expected: `Switched to a new branch 'feat/landing-rebuild-2026-05-20'`

- [ ] **Step 3: Snapshot current landing**

Run:
```bash
cp public/index.html public/index.html.pre-rebuild
```

- [ ] **Step 4: Add backup to .gitignore**

Edit `.gitignore`, add immediately before `# lighthouse reports`:
```
# rebuild backup of landing (kept locally only)
public/index.html.pre-rebuild
```

- [ ] **Step 5: Commit branch marker**

```bash
git add .gitignore
git commit -m "chore(landing): branch prep + ignore pre-rebuild backup"
```
Expected: 1 file changed.

---

### Task 0.2: Verify Supabase view for boletería counters

**Files:**
- (read-only) Supabase schema

- [ ] **Step 1: List existing views**

Using the `supabase-ancestral` MCP tool:
```
list_tables({ schemas: ['public'] })
```
Look for a view named `seats_summary` or similar with columns like `zone`, `available`, `total`.

- [ ] **Step 2: Document outcome**

If view exists → record exact name + column shape in a comment in `public/index.html` near `Boleteria.refreshCounts` (Phase 4, Task 4.4).

If view does NOT exist → Task 4.4 will skip the fetch entirely and render static "Cupos limitados · 300 en total". Add a TODO comment in code: `// TODO: create seats_summary view in Supabase migration` (do NOT create the view as part of this plan — out of scope per spec).

No code changes yet; this is a discovery step.

- [ ] **Step 3: Commit nothing**

Just record the outcome mentally / in a scratch note for Task 4.4.

---

## Phase 1 · Extract reusable JS modules (TDD)

### Task 1.1: Extract `UrlAttribution` to `public/shared/url-attribution.js`

**Files:**
- Create: `public/shared/url-attribution.js`
- Create: `tests/unit/url-attribution.test.js`

- [ ] **Step 1: Write failing test**

Create `tests/unit/url-attribution.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UrlAttribution } from '../../public/shared/url-attribution.js';

describe('UrlAttribution', () => {
  beforeEach(() => {
    sessionStorage.clear();
    // jsdom: stub location
    delete window.location;
    window.location = new URL('https://nextshow.co/?utm_source=ig&utm_campaign=launch&ref=fer');
    Object.defineProperty(document, 'referrer', { configurable: true, value: 'https://instagram.com/' });
  });

  it('captures utm + ref params into sessionStorage on construction', () => {
    new UrlAttribution();
    const stored = JSON.parse(sessionStorage.getItem('nextshow_attribution'));
    expect(stored.utm_source).toBe('ig');
    expect(stored.utm_campaign).toBe('launch');
    expect(stored.ref).toBe('fer');
    expect(stored.referrer).toBe('https://instagram.com/');
  });

  it('does not overwrite existing capture when new URL has no utm params', () => {
    sessionStorage.setItem('nextshow_attribution', JSON.stringify({ utm_source: 'fb' }));
    window.location = new URL('https://nextshow.co/'); // no params
    new UrlAttribution();
    const stored = JSON.parse(sessionStorage.getItem('nextshow_attribution'));
    expect(stored.utm_source).toBe('fb');
  });

  it('get() returns {} when nothing stored', () => {
    const a = new UrlAttribution();
    sessionStorage.clear();
    expect(a.get()).toEqual({});
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/unit/url-attribution.test.js`
Expected: FAIL — `Cannot find module '../../public/shared/url-attribution.js'`.

- [ ] **Step 3: Create the module**

Create `public/shared/url-attribution.js`:
```js
/**
 * NEXT SHOW · URL Attribution
 * Captura utm_* + ref + referrer + first_landing en sessionStorage.
 * No sobreescribe captura previa cuando el nuevo URL no trae utm/ref nuevos.
 *
 * Uso:
 *   import { UrlAttribution } from '/shared/url-attribution.js';
 *   const attr = new UrlAttribution();
 *   const data = attr.get();
 */

export class UrlAttribution {
  constructor() {
    this.STORAGE_KEY = 'nextshow_attribution';
    this.captureOnLoad();
  }

  captureOnLoad() {
    try {
      const params = new URLSearchParams(window.location.search);
      const data = {
        utm_source: params.get('utm_source'),
        utm_medium: params.get('utm_medium'),
        utm_campaign: params.get('utm_campaign'),
        utm_term: params.get('utm_term'),
        utm_content: params.get('utm_content'),
        ref: params.get('ref'),
        first_landing: window.location.pathname,
        captured_at: new Date().toISOString(),
        referrer: document.referrer || null,
      };
      const hasAny = Object.entries(data).some(
        ([k, v]) => v && !['captured_at', 'first_landing', 'referrer'].includes(k),
      );
      const existing = sessionStorage.getItem(this.STORAGE_KEY);
      if (hasAny || !existing) {
        sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
      }
    } catch (err) {
      console.warn('[attribution] no se pudo capturar:', err);
    }
  }

  get() {
    try {
      const raw = sessionStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run tests/unit/url-attribution.test.js`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add public/shared/url-attribution.js tests/unit/url-attribution.test.js
git commit -m "feat(shared): extract UrlAttribution to ES module with tests"
```

---

### Task 1.2: Extract `FomoEngine` to `public/shared/fomo-engine.js`

**Files:**
- Create: `public/shared/fomo-engine.js`
- Create: `tests/unit/fomo-engine.test.js`

- [ ] **Step 1: Write failing test**

Create `tests/unit/fomo-engine.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FomoEngine } from '../../public/shared/fomo-engine.js';

describe('FomoEngine', () => {
  let container;
  let mockSb;

  beforeEach(() => {
    document.body.innerHTML = '<div id="fomo-container"></div>';
    container = document.getElementById('fomo-container');
    mockSb = {
      query: vi.fn().mockResolvedValue([
        { id: 1, buyer_name: 'Juan Perez', buyer_city: 'Sabanalarga', paid_at: '2026-08-14T10:00:00Z' },
        { id: 2, buyer_name: 'Maria',       buyer_city: 'Barranquilla', paid_at: '2026-08-14T11:00:00Z' },
      ]),
    };
    vi.useFakeTimers();
  });

  it('anonymizes "Juan Perez" to "Juan P."', () => {
    const fe = new FomoEngine({ sb: mockSb });
    expect(fe.anonymize('Juan Perez')).toBe('Juan P.');
  });

  it('anonymizes single-name "Maria" to "Maria"', () => {
    const fe = new FomoEngine({ sb: mockSb });
    expect(fe.anonymize('Maria')).toBe('Maria');
  });

  it('returns "Alguien" for empty input', () => {
    const fe = new FomoEngine({ sb: mockSb });
    expect(fe.anonymize('')).toBe('Alguien');
  });

  it('start() pulls orders and schedules first tick', async () => {
    const fe = new FomoEngine({ sb: mockSb, containerId: 'fomo-container', intervalMs: 30000 });
    await fe.start();
    expect(mockSb.query).toHaveBeenCalledWith('orders', expect.objectContaining({
      filters: expect.objectContaining({ status: 'eq.paid' }),
    }));
    expect(fe.recent.length).toBe(2);
    vi.advanceTimersByTime(5000);
    expect(container.querySelectorAll('.fomo-pop').length).toBe(1);
  });

  it('start() is a no-op when sb returns []', async () => {
    mockSb.query.mockResolvedValueOnce([]);
    const fe = new FomoEngine({ sb: mockSb });
    await fe.start();
    expect(fe.timer).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/unit/fomo-engine.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the module**

Create `public/shared/fomo-engine.js`:
```js
/**
 * NEXT SHOW · FOMO Engine
 * Pulls recent paid orders from Supabase and shows rotating pop-ups.
 *
 * Dependency-injected `sb` so tests can mock without touching real Supabase.
 *
 * Uso:
 *   import { FomoEngine } from '/shared/fomo-engine.js';
 *   import { sb } from '/shared/supabase-client.js';
 *   const fe = new FomoEngine({ sb });
 *   fe.start();
 */

const escapeHTML = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

export class FomoEngine {
  constructor({ sb, containerId = 'fomo-container', intervalMs = 30000, lookbackHours = 24 } = {}) {
    this.sb = sb;
    this.containerId = containerId;
    this.intervalMs = intervalMs;
    this.lookbackHours = lookbackHours;
    this.container = null;
    this.recent = [];
    this.idx = 0;
    this.timer = null;
  }

  async start() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) {
      console.warn('[fomo] container not found:', this.containerId);
      return;
    }
    try {
      const since = new Date(Date.now() - this.lookbackHours * 3600 * 1000).toISOString();
      const orders = await this.sb.query('orders', {
        select: 'id,buyer_name,buyer_city,paid_at',
        filters: { status: 'eq.paid', paid_at: `gte.${since}` },
        order: 'paid_at.desc',
        limit: 5,
      }).catch(() => []);
      this.recent = (orders || []).map((o) => ({
        name: this.anonymize(o.buyer_name),
        city: o.buyer_city || 'Sabanalarga',
      }));
    } catch {
      this.recent = [];
    }
    if (!this.recent.length) return;
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    setTimeout(() => this.tick(), 5000);
  }

  anonymize(fullName) {
    if (!fullName) return 'Alguien';
    const parts = String(fullName).trim().split(/\s+/);
    const first = parts[0];
    const lastInitial = parts[1] ? ` ${parts[1][0].toUpperCase()}.` : '';
    return first + lastInitial;
  }

  tick() {
    if (!this.recent.length || !this.container) return;
    const item = this.recent[this.idx % this.recent.length];
    this.idx++;
    const el = document.createElement('div');
    el.className = 'fomo-pop';
    el.innerHTML =
      `<span class="fomo-dot"></span>` +
      `<span><strong>${escapeHTML(item.name)}</strong> de ${escapeHTML(item.city)} acaba de comprar</span>`;
    this.container.appendChild(el);
    setTimeout(() => el.remove(), 7800);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run tests/unit/fomo-engine.test.js`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add public/shared/fomo-engine.js tests/unit/fomo-engine.test.js
git commit -m "feat(shared): extract FomoEngine to ES module with DI + tests"
```

---

## Phase 2 · Asset pipeline

### Task 2.1: Process artist + venue photos with `sips`

**Files:**
- Create: `public/assets/img/toromobolo-hero.jpg` (+ `-mobile.jpg`, `.webp`, `-mobile.webp`)
- Create: `public/assets/img/jair-hero.jpg` (+ variants)
- Create: `public/assets/img/natalya.jpg` (+ variants)
- Create: `public/assets/img/venue-cancha-noche.jpg` (+ variants)

- [ ] **Step 1: Create destination directory**

```bash
mkdir -p public/assets/img
```

- [ ] **Step 2: Confirm `sips` available**

Run: `which sips`
Expected: `/usr/bin/sips` (macOS built-in).

- [ ] **Step 3: Resize Toromobolo desktop (1600w JPG)**

```bash
sips -s format jpeg -s formatOptions 82 -Z 1600 \
  "FOTOS ARTISTAS/Fondo de "DSC_3083" eliminado.png" \
  --out "public/assets/img/toromobolo-hero.jpg"
```
Expected: file < 250 KB. Run `ls -l public/assets/img/toromobolo-hero.jpg` to verify.

- [ ] **Step 4: Resize Toromobolo mobile (800w JPG)**

```bash
sips -s format jpeg -s formatOptions 78 -Z 800 \
  "FOTOS ARTISTAS/Fondo de "DSC_3083" eliminado.png" \
  --out "public/assets/img/toromobolo-hero-mobile.jpg"
```

- [ ] **Step 5: Repeat for Jair (1600w + 800w)**

```bash
sips -s format jpeg -s formatOptions 82 -Z 1600 \
  "FOTOS ARTISTAS/Fondo de "JAIR LUQUEZ" eliminado.png" \
  --out "public/assets/img/jair-hero.jpg"
sips -s format jpeg -s formatOptions 78 -Z 800 \
  "FOTOS ARTISTAS/Fondo de "JAIR LUQUEZ" eliminado.png" \
  --out "public/assets/img/jair-hero-mobile.jpg"
```

- [ ] **Step 6: Repeat for Natalya (1200w + 600w)**

```bash
sips -s format jpeg -s formatOptions 82 -Z 1200 \
  "recursos/propuestas/fotonatfinal.png" \
  --out "public/assets/img/natalya.jpg"
sips -s format jpeg -s formatOptions 78 -Z 600 \
  "recursos/propuestas/fotonatfinal.png" \
  --out "public/assets/img/natalya-mobile.jpg"
```

- [ ] **Step 7: Venue (2400w + 1200w)**

```bash
sips -s format jpeg -s formatOptions 80 -Z 2400 \
  "recursos/ambiente/fotocanchadenoche.png" \
  --out "public/assets/img/venue-cancha-noche.jpg"
sips -s format jpeg -s formatOptions 76 -Z 1200 \
  "recursos/ambiente/fotocanchadenoche.png" \
  --out "public/assets/img/venue-cancha-noche-mobile.jpg"
```

- [ ] **Step 8: Verify all sizes**

```bash
ls -la public/assets/img/
```
Expected: 8 JPG files. None > 300 KB. If any exceed, re-run with quality `72`.

- [ ] **Step 9: Try WebP via `cwebp` (if available)**

```bash
command -v cwebp >/dev/null && for f in public/assets/img/*.jpg; do
  cwebp -q 80 "$f" -o "${f%.jpg}.webp"
done || echo "cwebp not installed — WebP variants skipped; <picture> will use JPG only"
```
Expected: either 8 `.webp` files OR the skip message. If skipped, Task 3.4 / 3.5 will omit `<source type=image/webp>` lines.

- [ ] **Step 10: Commit images**

```bash
git add public/assets/img/
git commit -m "feat(assets): add optimized artist + venue photos (jpg + webp 2 sizes)"
```

---

### Task 2.2: Brand SVGs (favicon + wordmark fallback)

**Files:**
- Create: `public/assets/brand/favicon.svg`
- Create: `public/assets/brand/nextshow-wordmark.svg`

- [ ] **Step 1: Create destination**

```bash
mkdir -p public/assets/brand
```

- [ ] **Step 2: Write `favicon.svg`**

Create `public/assets/brand/favicon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#00d4ff"/>
      <stop offset="50%" stop-color="#7c3aed"/>
      <stop offset="100%" stop-color="#d946ef"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="12" fill="#0a0612"/>
  <text x="50%" y="56%" text-anchor="middle"
        font-family="Anton, Impact, sans-serif" font-size="34" font-weight="900"
        fill="url(#g)" dominant-baseline="middle" letter-spacing="-1">NS</text>
</svg>
```

- [ ] **Step 3: Write `nextshow-wordmark.svg`** (used as `<img>` fallback when Anton fails)

Create `public/assets/brand/nextshow-wordmark.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 120" width="360" height="120">
  <defs>
    <linearGradient id="gw" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#00d4ff"/>
      <stop offset="50%" stop-color="#7c3aed"/>
      <stop offset="100%" stop-color="#d946ef"/>
    </linearGradient>
  </defs>
  <text x="0" y="52" font-family="Anton, Impact, sans-serif" font-size="56" font-weight="900"
        fill="#f5f3ff" letter-spacing="-1">NEXT</text>
  <text x="0" y="110" font-family="Anton, Impact, sans-serif" font-size="56" font-weight="900"
        fill="url(#gw)" letter-spacing="-1">SHOW</text>
</svg>
```

- [ ] **Step 4: Commit**

```bash
git add public/assets/brand/
git commit -m "feat(brand): favicon + wordmark SVG fallback with cyan→violet→magenta gradient"
```

---

## Phase 3 · Rewrite `public/index.html`

All Phase 3 tasks edit ONE file (`public/index.html`). Work sequentially top-to-bottom, committing after each task so reverting is easy.

> **Critical for executor:** at the start of Phase 3, the new `public/index.html` starts as an empty file. Build it up section by section. Do NOT lose the inline checkout classes (CheckoutModal, SeatMap, QuantityStepper, BuyerForm, OrderConfirmation) — they will be re-pasted in Task 4.6 from `public/index.html.pre-rebuild`.

### Task 3.1: New `index.html` skeleton + meta + design tokens

**Files:**
- Modify: `public/index.html` (rewrite from scratch)

- [ ] **Step 1: Empty out current file (after backup confirmed)**

Confirm `public/index.html.pre-rebuild` exists, then:
```bash
> public/index.html
```

- [ ] **Step 2: Write skeleton**

Replace `public/index.html` content with:
```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="dark">
  <title>NEXT SHOW · Toromobolo + Jair Luquez · 15 ago 2026 · Sabanalarga</title>
  <meta name="description" content="Una noche híbrida: bloque podcast en vivo + show completo. Toromobolo Welc'h y Jair Luquez en Sabanalarga, Atlántico. 15 agosto 2026.">
  <link rel="icon" type="image/svg+xml" href="/assets/brand/favicon.svg">
  <link rel="canonical" href="https://nextshow.co/">

  <!-- OG / Twitter -->
  <meta property="og:type" content="event">
  <meta property="og:title" content="NEXT SHOW · Toromobolo + Jair Luquez">
  <meta property="og:description" content="Bloque podcast + show completo. 15 ago 2026, Sabanalarga.">
  <meta property="og:image" content="https://nextshow.co/assets/img/toromobolo-hero.jpg">
  <meta property="og:url" content="https://nextshow.co/">
  <meta name="twitter:card" content="summary_large_image">

  <!-- JSON-LD Event -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": "NEXT SHOW · Toromobolo + Jair Luquez",
    "startDate": "2026-08-15T20:00:00-05:00",
    "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
    "eventStatus": "https://schema.org/EventScheduled",
    "location": {
      "@type": "Place",
      "name": "Cancha Sabanalarga",
      "address": { "@type": "PostalAddress", "addressLocality": "Sabanalarga", "addressRegion": "Atlántico", "addressCountry": "CO" }
    },
    "performer": [
      { "@type": "PerformingGroup", "name": "Toromobolo Welc'h" },
      { "@type": "MusicGroup", "name": "Jair Luquez" }
    ],
    "organizer": { "@type": "Organization", "name": "NEXT SHOW · Nexo Productions" },
    "offers": [
      { "@type": "Offer", "name": "Risas", "price": "75000", "priceCurrency": "COP", "availability": "https://schema.org/InStock" },
      { "@type": "Offer", "name": "Cantas", "price": "150000", "priceCurrency": "COP", "availability": "https://schema.org/InStock" }
    ]
  }
  </script>

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@300;400;500;600;700;800&family=Great+Vibes&display=swap">

  <!-- Runtime config (Supabase URL + anon key injected by Netlify at deploy) -->
  <script>
    window.NEXTSHOW_CONFIG = window.NEXTSHOW_CONFIG || {};
  </script>

  <style>
    /* ============ DESIGN TOKENS ============ */
    :root {
      --bg:        #0a0612;
      --bg-2:      #14091f;
      --bg-3:      #1a0d2e;
      --border:    #2a1947;
      --border-hi: #3d2466;
      --cyan:      #00d4ff;
      --violet:    #7c3aed;
      --violet-2:  #a855f7;
      --magenta:   #d946ef;
      --pink:      #ec4899;
      --text:      #f5f3ff;
      --muted:     #a39db8;
      --muted-2:   #6b6480;
      --success:   #22c55e;
      --warning:   #f59e0b;
      --error:     #ef4444;
      --gradient:  linear-gradient(135deg, #00d4ff 0%, #7c3aed 50%, #d946ef 100%);
      --gradient-soft: linear-gradient(135deg, rgba(0,212,255,.15) 0%, rgba(124,58,237,.15) 50%, rgba(217,70,239,.15) 100%);
      --shadow-card: 0 12px 32px rgba(0,0,0,.4);
      --radius-md: 14px;
      --radius-lg: 22px;
      --space-1: 4px;  --space-2: 8px;  --space-3: 12px;
      --space-4: 16px; --space-5: 24px; --space-6: 32px;
      --space-7: 48px; --space-8: 64px; --space-9: 96px;
      --maxw: 1240px;
    }

    /* ============ RESET ============ */
    *, *::before, *::after { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      font-family: 'Inter', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      font-size: 16px;
      line-height: 1.6;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }
    img, picture, svg { display: block; max-width: 100%; }
    a { color: inherit; text-decoration: none; }
    button { font: inherit; cursor: pointer; }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.001ms !important;
        scroll-behavior: auto !important;
      }
    }

    /* Snap scroll desktop only */
    @media (min-width: 768px) {
      html { scroll-snap-type: y proximity; }
      section[data-snap] { scroll-snap-align: start; scroll-snap-stop: normal; }
    }

    /* Reveal on scroll */
    .reveal { opacity: 0; transform: translateY(24px); transition: opacity .6s ease, transform .6s ease; }
    .reveal.visible { opacity: 1; transform: translateY(0); }

    /* Helpers */
    .container { max-width: var(--maxw); margin: 0 auto; padding: 0 var(--space-5); }
    .gradient-text { background: var(--gradient); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .eyebrow { display: inline-block; font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); font-weight: 600; }

    /* CTAs */
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 26px; border-radius: 99px; font-weight: 800; font-size: 14px; letter-spacing: .04em; text-transform: uppercase; border: none; transition: transform .15s ease, box-shadow .15s ease, filter .15s ease; }
    .btn-primary { background: var(--gradient); color: var(--bg); box-shadow: 0 8px 24px rgba(124, 58, 237, .35); }
    .btn-primary:hover { transform: translateY(-2px); filter: brightness(1.08); }
    .btn-ghost { background: transparent; color: var(--text); border: 1px solid var(--border-hi); }
    .btn-ghost:hover { border-color: var(--cyan); color: var(--cyan); }
    .btn:focus-visible { outline: 2px solid var(--cyan); outline-offset: 3px; }
  </style>
</head>
<body>
  <!-- noscript fallback -->
  <noscript>
    <div style="background: var(--warning); color: var(--bg); padding: 12px 20px; text-align: center; font-weight: 700;">
      Activá JavaScript para comprar boletas. Escribínos a <a href="mailto:boletas@nextshow.co">boletas@nextshow.co</a>.
    </div>
  </noscript>

  <!-- sections go here in subsequent tasks -->

  <!-- FOMO pop container -->
  <div id="fomo-container" aria-live="polite" aria-atomic="true"></div>
  <!-- Toast container -->
  <div id="toast-container" aria-live="polite" aria-atomic="true"></div>

  <!-- module script will be added in Phase 4 -->
</body>
</html>
```

- [ ] **Step 3: Smoke check load**

Run the dev server (already running on `:8000`):
```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8000/
```
Expected: `HTTP 200`. Open browser to confirm dark background renders, no console errors.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): skeleton + meta + design tokens (cyan→violet→magenta)"
```

---

### Task 3.2: Nav sticky + CSS wordmark

**Files:**
- Modify: `public/index.html` (add `<style>` rules + nav markup)

- [ ] **Step 1: Append nav styles inside `<style>` (before closing `</style>`)**

Insert before `</style>`:
```css
    /* ============ NAV ============ */
    .nav { position: sticky; top: 0; z-index: 50; backdrop-filter: blur(14px); background: rgba(10, 6, 18, .72); border-bottom: 1px solid var(--border); }
    .nav-row { display: flex; align-items: center; justify-content: space-between; padding: 14px 0; }
    .wordmark { font-family: 'Anton', Impact, sans-serif; font-weight: 900; font-size: 22px; line-height: 1; letter-spacing: -0.01em; text-transform: uppercase; display: inline-flex; gap: 8px; align-items: baseline; }
    .wordmark .next { color: var(--text); }
    .wordmark .show { background: var(--gradient); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .nav-links { display: none; gap: 28px; }
    .nav-links a { font-size: 13px; font-weight: 500; color: var(--muted); letter-spacing: .04em; text-transform: uppercase; transition: color .15s; }
    .nav-links a:hover { color: var(--cyan); }
    @media (min-width: 960px) { .nav-links { display: inline-flex; } }
    .nav .btn { padding: 10px 18px; font-size: 12px; }
```

- [ ] **Step 2: Replace `<!-- sections go here in subsequent tasks -->` with the nav markup**

```html
  <header class="nav" role="banner">
    <div class="container nav-row">
      <a class="wordmark" href="#" aria-label="NEXT SHOW">
        <span class="next">NEXT</span><span class="show">SHOW</span>
      </a>
      <nav class="nav-links" aria-label="Secciones">
        <a href="#protagonistas">Protagonistas</a>
        <a href="#formato">La noche</a>
        <a href="#donde">Dónde</a>
        <a href="#boleteria">Boletas</a>
        <a href="#faq">FAQ</a>
      </nav>
      <button class="btn btn-primary" data-cta="nav-comprar" data-tier="risas">Comprar</button>
    </div>
  </header>

  <main>
  <!-- sections go here in subsequent tasks -->
  </main>
```

Note: closing `</main>` will be added in Task 3.10 (footer task) — for now this opening tag stays unbalanced; subsequent section tasks must insert their markup INSIDE this `<main>`.

- [ ] **Step 3: Reload + visual check**

`curl -s http://localhost:8000/ | grep -c 'class="wordmark"'`
Expected: `1`. Open browser: nav sticky, wordmark with cyan→magenta on SHOW.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): nav sticky + CSS wordmark"
```

---

### Task 3.3: Hero section (ticker + headline + countdown + faces + CTAs + glows)

**Files:**
- Modify: `public/index.html` (styles + hero markup)

- [ ] **Step 1: Append hero styles inside `<style>`**

Insert before `</style>`:
```css
    /* ============ HERO ============ */
    .ticker { background: linear-gradient(90deg, transparent, rgba(0,212,255,.12), transparent); border-bottom: 1px solid var(--border); padding: 8px 0; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--cyan); overflow: hidden; white-space: nowrap; }
    .ticker-track { display: inline-flex; gap: 48px; animation: ticker 38s linear infinite; padding-left: 100%; }
    .ticker-track span::before { content: "●"; margin-right: 10px; color: var(--cyan); animation: pulse 1.4s ease-in-out infinite; }
    @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-100%); } }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

    .hero { position: relative; padding: var(--space-9) 0 var(--space-8); overflow: hidden; min-height: 88vh; display: flex; align-items: center; }
    .hero-glow { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
    .hero-glow::before, .hero-glow::after, .hero-glow > i { content: ""; position: absolute; width: 60vw; height: 60vw; border-radius: 50%; filter: blur(120px); opacity: .35; }
    .hero-glow::before { top: -20%; left: -10%; background: var(--cyan); }
    .hero-glow::after  { top: -10%; right: -10%; background: var(--magenta); }
    .hero-glow > i { bottom: -30%; left: 30%; background: var(--violet); opacity: .25; }

    .hero-grid { position: relative; z-index: 1; display: grid; gap: var(--space-7); align-items: center; }
    @media (min-width: 960px) { .hero-grid { grid-template-columns: 1.2fr 1fr; } }

    .hero h1 { font-family: 'Anton', Impact, sans-serif; font-weight: 900; font-size: clamp(72px, 14vw, 200px); line-height: .88; letter-spacing: -0.02em; text-transform: uppercase; margin: 0 0 var(--space-4); }
    .hero h1 .show { background: var(--gradient); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .hero-sub { font-size: clamp(18px, 2.2vw, 22px); color: var(--muted); margin: 0 0 var(--space-6); font-weight: 500; }
    .hero-sub strong { color: var(--text); }

    .countdown { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: var(--space-3); margin: var(--space-6) 0; max-width: 460px; }
    .cd-card { background: rgba(20,9,31,.6); border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-3) var(--space-2); text-align: center; }
    .cd-num { font-family: 'Anton', Impact, sans-serif; font-size: 34px; line-height: 1; background: var(--gradient); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .cd-lbl { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); margin-top: 4px; }

    .hero-ctas { display: flex; gap: var(--space-3); flex-wrap: wrap; margin-top: var(--space-5); }

    .hero-faces { position: relative; aspect-ratio: 4 / 5; }
    .hero-face { position: absolute; width: 62%; border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-card); border: 1px solid var(--border-hi); }
    .hero-face img { width: 100%; height: 100%; object-fit: cover; }
    .hero-face.toromobolo { left: 0; top: 0; transform: rotate(-3deg); }
    .hero-face.jair       { right: 0; bottom: 0; transform: rotate(3deg); }
```

- [ ] **Step 2: Insert hero markup inside `<main>`** (replace `<!-- sections go here in subsequent tasks -->`)

```html
    <!-- Ticker FOMO -->
    <div class="ticker" aria-hidden="true">
      <div class="ticker-track" id="fomo-ticker">
        <span>15 ago 2026 · Sabanalarga · 300 cupos</span>
        <span>Bloque podcast en vivo + show completo</span>
        <span>Toromobolo Welc'h + Jair Luquez</span>
      </div>
    </div>

    <!-- Hero -->
    <section class="hero" data-snap>
      <div class="hero-glow"><i></i></div>
      <div class="container hero-grid">
        <div>
          <p class="eyebrow">Sabanalarga · 15 ago 2026</p>
          <h1><span>NEXT</span><br><span class="show">SHOW</span></h1>
          <p class="hero-sub">Una noche híbrida: bloque <strong>podcast en vivo</strong> + <strong>show completo</strong>.</p>

          <div class="countdown" aria-label="Cuenta regresiva al evento">
            <div class="cd-card"><div class="cd-num" id="cd-days">--</div><div class="cd-lbl">Días</div></div>
            <div class="cd-card"><div class="cd-num" id="cd-hours">--</div><div class="cd-lbl">Horas</div></div>
            <div class="cd-card"><div class="cd-num" id="cd-min">--</div><div class="cd-lbl">Min</div></div>
            <div class="cd-card"><div class="cd-num" id="cd-sec">--</div><div class="cd-lbl">Seg</div></div>
          </div>

          <div class="hero-ctas">
            <button class="btn btn-primary" data-cta="hero-comprar" data-tier="risas">Comprar boleta</button>
            <a class="btn btn-ghost" href="#formato">Cómo es la noche</a>
          </div>
        </div>

        <div class="hero-faces" aria-hidden="true">
          <div class="hero-face toromobolo">
            <picture>
              <source srcset="/assets/img/toromobolo-hero.webp" type="image/webp">
              <img src="/assets/img/toromobolo-hero.jpg" alt="" loading="eager" decoding="async" width="800" height="1000">
            </picture>
          </div>
          <div class="hero-face jair">
            <picture>
              <source srcset="/assets/img/jair-hero.webp" type="image/webp">
              <img src="/assets/img/jair-hero.jpg" alt="" loading="eager" decoding="async" width="800" height="1000">
            </picture>
          </div>
        </div>
      </div>
    </section>

    <!-- sections continue below -->
```

If WebP was skipped in Task 2.1 Step 9, remove the two `<source type="image/webp">` lines.

- [ ] **Step 3: Visual check**

Reload `http://localhost:8000/`. Confirm: huge NEXT/SHOW headline, countdown shows `--`, ticker scrolls, two faces overlap with rotation.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): hero with ticker, countdown, faces, radial glows"
```

---

### Task 3.4: PROTAGONISTAS section

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Append section styles inside `<style>`**

```css
    /* ============ SECTIONS COMMON ============ */
    .section { padding: var(--space-9) 0; position: relative; }
    .section-head { text-align: center; max-width: 720px; margin: 0 auto var(--space-7); }
    .section-head h2 { font-family: 'Anton', Impact, sans-serif; font-size: clamp(48px, 8vw, 96px); line-height: 1; letter-spacing: -0.02em; text-transform: uppercase; margin: 0 0 var(--space-3); }
    .section-head p { color: var(--muted); font-size: 18px; }

    /* ============ PROTAGONISTAS ============ */
    .protag-grid { display: grid; gap: var(--space-5); grid-template-columns: 1fr; }
    @media (min-width: 760px) { .protag-grid { grid-template-columns: 1fr 1fr; } }
    .protag-card { background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; transition: transform .25s ease, border-color .25s ease; }
    .protag-card:hover { transform: translateY(-4px); border-color: var(--violet-2); }
    .protag-photo { aspect-ratio: 4 / 5; overflow: hidden; background: var(--gradient-soft); }
    .protag-photo img { width: 100%; height: 100%; object-fit: cover; }
    .protag-body { padding: var(--space-5) var(--space-5) var(--space-6); }
    .protag-role { color: var(--cyan); font-size: 12px; letter-spacing: .14em; text-transform: uppercase; font-weight: 700; margin-bottom: 6px; }
    .protag-name { font-family: 'Anton', Impact, sans-serif; font-size: 36px; line-height: 1; text-transform: uppercase; margin: 0 0 var(--space-2); }
    .protag-trayectoria { color: var(--muted); font-size: 14px; margin: 0 0 var(--space-3); }
    .protag-bio { color: var(--text); font-size: 15px; line-height: 1.6; margin: 0; }
```

- [ ] **Step 2: Insert PROTAGONISTAS markup after the hero `</section>`** (before `<!-- sections continue below -->`)

```html
    <section id="protagonistas" class="section" data-snap>
      <div class="container">
        <div class="section-head reveal">
          <p class="eyebrow">Lineup confirmado</p>
          <h2>Los <span class="gradient-text">protagonistas</span></h2>
        </div>

        <div class="protag-grid">
          <article class="protag-card reveal">
            <div class="protag-photo">
              <picture>
                <source srcset="/assets/img/toromobolo-hero.webp" type="image/webp">
                <img src="/assets/img/toromobolo-hero.jpg" alt="Toromobolo Welc'h" loading="lazy" decoding="async">
              </picture>
            </div>
            <div class="protag-body">
              <div class="protag-role">Humorista · 20+ años</div>
              <h3 class="protag-name">Toromobolo Welc'h</h3>
              <p class="protag-trayectoria">Voz consagrada del humor costeño. Veterano de la escena en vivo.</p>
              <p class="protag-bio">Hora de stand-up sin filtros que conecta con cada generación del público. La risa que viste tu casa los domingos, ahora en vivo.</p>
            </div>
          </article>

          <article class="protag-card reveal">
            <div class="protag-photo">
              <picture>
                <source srcset="/assets/img/jair-hero.webp" type="image/webp">
                <img src="/assets/img/jair-hero.jpg" alt="Jair Luquez" loading="lazy" decoding="async">
              </picture>
            </div>
            <div class="protag-body">
              <div class="protag-role">Cantante vallenato · 15+ años</div>
              <h3 class="protag-name">Jair Luquez</h3>
              <p class="protag-trayectoria">Vallenato auténtico, banda completa.</p>
              <p class="protag-bio">Repertorio que te hace cantar de pie. Una hora sin pausas hasta el cierre.</p>
            </div>
          </article>
        </div>
      </div>
    </section>

```

(If WebP skipped: remove `<source>` lines.)

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): protagonistas section (Toromobolo + Jair) — fixes wrong lineup"
```

---

### Task 3.5: CÓMO ES LA NOCHE + NATALYA section

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Append styles inside `<style>`**

```css
    /* ============ FORMATO ============ */
    .formato { background: var(--bg-2); }
    .formato-grid { display: grid; gap: var(--space-6); grid-template-columns: 1fr; align-items: start; }
    @media (min-width: 960px) { .formato-grid { grid-template-columns: 1.4fr 1fr; } }

    .steps { display: grid; gap: var(--space-4); }
    .step { display: grid; grid-template-columns: auto 1fr; gap: var(--space-4); padding: var(--space-5); background: var(--bg-3); border: 1px solid var(--border); border-radius: var(--radius-md); }
    .step-num { font-family: 'Anton', Impact, sans-serif; font-size: 56px; line-height: 1; background: var(--gradient); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .step-title { margin: 0 0 6px; font-size: 18px; font-weight: 700; }
    .step-copy { color: var(--muted); margin: 0; font-size: 15px; }

    .host-card { background: var(--bg-3); border: 1px solid var(--border-hi); border-radius: var(--radius-lg); overflow: hidden; }
    .host-photo { aspect-ratio: 1 / 1; overflow: hidden; position: relative; }
    .host-photo img { width: 100%; height: 100%; object-fit: cover; }
    .host-chip { position: absolute; top: var(--space-3); left: var(--space-3); background: var(--gradient); color: var(--bg); font-size: 11px; padding: 6px 10px; border-radius: 99px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
    .host-body { padding: var(--space-5); }
    .host-name { font-family: 'Anton', Impact, sans-serif; font-size: 28px; margin: 0 0 6px; }
    .host-line { color: var(--muted); font-size: 14px; margin: 0; }
```

- [ ] **Step 2: Insert markup after Task 3.4's `</section>`**

```html
    <section id="formato" class="section formato" data-snap>
      <div class="container">
        <div class="section-head reveal">
          <p class="eyebrow">El diferencial</p>
          <h2>Cómo es <span class="gradient-text">la noche</span></h2>
          <p>No es solo otro show. Es contenido que vive más allá de la noche.</p>
        </div>

        <div class="formato-grid">
          <div class="steps">
            <div class="step reveal">
              <div class="step-num">01</div>
              <div>
                <h3 class="step-title">Bloque podcast en vivo · 15-20 min</h3>
                <p class="step-copy">Natalya entrevista al artista. Carrera, anécdotas, momentos clave. Capturado para YouTube y Spotify.</p>
              </div>
            </div>
            <div class="step reveal">
              <div class="step-num">02</div>
              <div>
                <h3 class="step-title">Show completo del artista</h3>
                <p class="step-copy">Sin cortes. Una hora de risa y una hora de cante. La noche que prometemos.</p>
              </div>
            </div>
            <div class="step reveal">
              <div class="step-num">03</div>
              <div>
                <h3 class="step-title">El contenido queda vivo</h3>
                <p class="step-copy">El bloque podcast se publica los días siguientes. Tu noche se convierte en pieza de contenido que dura meses.</p>
              </div>
            </div>
          </div>

          <aside class="host-card reveal">
            <div class="host-photo">
              <span class="host-chip">Conduce</span>
              <picture>
                <source srcset="/assets/img/natalya.webp" type="image/webp">
                <img src="/assets/img/natalya.jpg" alt="Natalya Ruiz Blel" loading="lazy" decoding="async">
              </picture>
            </div>
            <div class="host-body">
              <h3 class="host-name">Natalya Ruiz Blel</h3>
              <p class="host-line">A un Click · Telecaribe · 59K IG</p>
            </div>
          </aside>
        </div>
      </div>
    </section>

```

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): formato section with 3 steps + Natalya host card"
```

---

### Task 3.6: DÓNDE (venue) section

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Append styles inside `<style>`**

```css
    /* ============ VENUE ============ */
    .venue { padding: 0; position: relative; }
    .venue-photo { position: relative; aspect-ratio: 16 / 9; max-height: 80vh; overflow: hidden; }
    .venue-photo img { width: 100%; height: 100%; object-fit: cover; filter: brightness(.55) saturate(1.1); }
    .venue-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; padding: var(--space-5); background: linear-gradient(180deg, transparent 0%, rgba(10,6,18,.6) 100%); }
    .venue-overlay h2 { font-family: 'Anton', Impact, sans-serif; font-size: clamp(48px, 9vw, 120px); line-height: .95; margin: 0 0 var(--space-3); text-transform: uppercase; }
    .venue-overlay p { color: var(--text); font-size: 18px; margin: 0 0 var(--space-5); }
    .venue-overlay strong { color: var(--cyan); }
```

- [ ] **Step 2: Insert markup after Task 3.5's `</section>`**

```html
    <section id="donde" class="venue" data-snap>
      <div class="venue-photo">
        <picture>
          <source srcset="/assets/img/venue-cancha-noche.webp" type="image/webp">
          <img src="/assets/img/venue-cancha-noche.jpg" alt="Cancha Sabanalarga de noche" loading="lazy" decoding="async">
        </picture>
        <div class="venue-overlay">
          <div class="reveal">
            <p class="eyebrow">El lugar</p>
            <h2><span class="gradient-text">Sabanalarga</span><br>Atlántico</h2>
            <p><strong>300 cupos.</strong> Un solo evento. Una sola noche.</p>
            <a class="btn btn-ghost" href="https://maps.google.com/?q=Sabanalarga,+Atlántico" target="_blank" rel="noopener">Cómo llegar</a>
          </div>
        </div>
      </div>
    </section>

```

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): venue section (cancha noche full-bleed)"
```

---

### Task 3.7: ELIGE TU EXPERIENCIA (boletería) section

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Append styles inside `<style>`**

```css
    /* ============ BOLETERIA ============ */
    .boleteria-grid { display: grid; gap: var(--space-5); grid-template-columns: 1fr; max-width: 920px; margin: 0 auto; }
    @media (min-width: 760px) { .boleteria-grid { grid-template-columns: 1fr 1fr; } }
    .tier { background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-6) var(--space-5); position: relative; display: flex; flex-direction: column; gap: var(--space-3); transition: border-color .25s, transform .25s; }
    .tier:hover { transform: translateY(-4px); border-color: var(--violet-2); }
    .tier-name { font-family: 'Anton', Impact, sans-serif; font-size: 42px; line-height: 1; text-transform: uppercase; margin: 0; }
    .tier-name.cantas { background: var(--gradient); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .tier-price { font-size: 28px; font-weight: 800; }
    .tier-price .currency { color: var(--muted); font-size: 14px; font-weight: 400; margin-right: 4px; }
    .tier-aforo { color: var(--muted); font-size: 13px; margin: 0; }
    .tier-features { list-style: none; padding: 0; margin: var(--space-3) 0; display: grid; gap: 8px; font-size: 14px; }
    .tier-features li::before { content: "→"; color: var(--cyan); margin-right: 10px; }
    .tier-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: rgba(0,212,255,.12); color: var(--cyan); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; font-weight: 700; border-radius: 99px; align-self: flex-start; }
    .tier-cta { margin-top: auto; }
    .tier-remaining { font-size: 12px; color: var(--warning); font-weight: 700; }
```

- [ ] **Step 2: Insert markup after Task 3.6's `</section>`**

```html
    <section id="boleteria" class="section" data-snap>
      <div class="container">
        <div class="section-head reveal">
          <p class="eyebrow">Compra ahora</p>
          <h2>Elige tu <span class="gradient-text">experiencia</span></h2>
        </div>

        <div class="boleteria-grid">
          <article class="tier reveal" data-tier="risas">
            <h3 class="tier-name">Risas</h3>
            <p class="tier-aforo">200 cupos · orden de llegada</p>
            <div class="tier-price"><span class="currency">COP</span>$75.000</div>
            <ul class="tier-features">
              <li>Acceso completo a la noche</li>
              <li>Bloque podcast + show del artista</li>
              <li>Espacio de pie / general</li>
            </ul>
            <span class="tier-badge">D-15 · upgrade a Cantas por +$25k</span>
            <p class="tier-remaining" id="risas-remaining" hidden></p>
            <button class="btn btn-primary tier-cta" data-cta="boleteria-risas" data-tier="risas">Comprar Risas</button>
          </article>

          <article class="tier reveal" data-tier="cantas">
            <h3 class="tier-name cantas">Cantas</h3>
            <p class="tier-aforo">100 cupos · silla numerada</p>
            <div class="tier-price"><span class="currency">COP</span>$150.000</div>
            <ul class="tier-features">
              <li>Silla asignada (mapa visual al comprar)</li>
              <li>Acceso preferente al venue</li>
              <li>Bloque podcast + show del artista</li>
            </ul>
            <p class="tier-remaining" id="cantas-remaining" hidden></p>
            <button class="btn btn-primary tier-cta" data-cta="boleteria-cantas" data-tier="cantas">Comprar Cantas</button>
          </article>
        </div>
      </div>
    </section>

```

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): boletería 2 tiers (Risas 75k + Cantas 150k) — drops Tarima"
```

---

### Task 3.8: FAQ (PREGUNTAS) section

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Append styles inside `<style>`**

```css
    /* ============ FAQ ============ */
    .faq { background: var(--bg-2); }
    .faq-list { max-width: 720px; margin: 0 auto; }
    .faq-item { border-bottom: 1px solid var(--border); }
    .faq-item summary { list-style: none; cursor: pointer; padding: var(--space-4) 0; display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); font-size: 16px; font-weight: 600; }
    .faq-item summary::-webkit-details-marker { display: none; }
    .faq-item summary::after { content: "+"; font-size: 22px; color: var(--cyan); transition: transform .2s; }
    .faq-item[open] summary::after { transform: rotate(45deg); }
    .faq-item p { margin: 0 0 var(--space-4); color: var(--muted); font-size: 14px; line-height: 1.7; }
```

- [ ] **Step 2: Insert markup after Task 3.7's `</section>`**

```html
    <section id="faq" class="section faq" data-snap>
      <div class="container">
        <div class="section-head reveal">
          <p class="eyebrow">Preguntas</p>
          <h2>Todo lo que <span class="gradient-text">necesitas saber</span></h2>
        </div>

        <div class="faq-list">
          <details class="faq-item">
            <summary>¿Hay edad mínima?</summary>
            <p>+18. Menores acompañados de un adulto responsable.</p>
          </details>
          <details class="faq-item">
            <summary>¿Habrá comida y bebida?</summary>
            <p>Sí. Barra y zona gastronómica en el venue. Pagos en efectivo y digitales.</p>
          </details>
          <details class="faq-item">
            <summary>¿Hay parqueadero?</summary>
            <p>Sí, parqueadero externo gratuito junto a la cancha. Recomendamos llegar con tiempo.</p>
          </details>
          <details class="faq-item">
            <summary>¿Qué pasa si llueve?</summary>
            <p>El evento es al aire libre con cobertura parcial. Anunciamos cualquier cambio por WhatsApp 24h antes y reprogramamos si la lluvia es total.</p>
          </details>
          <details class="faq-item">
            <summary>¿Puedo devolver la boleta?</summary>
            <p>No hay devoluciones, pero sí transferencias de nombre hasta 48h antes del evento desde tu enlace de boleta.</p>
          </details>
          <details class="faq-item">
            <summary>¿Cómo contacto al equipo?</summary>
            <p>WhatsApp <a href="https://wa.me/573106619353" style="color: var(--cyan);">+57 310 661 9353</a> o email <a href="mailto:boletas@nextshow.co" style="color: var(--cyan);">boletas@nextshow.co</a>.</p>
          </details>
        </div>
      </div>
    </section>

```

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): FAQ section with 6 preguntas frecuentes"
```

---

### Task 3.9: Footer

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Append styles inside `<style>`**

```css
    /* ============ FOOTER ============ */
    .footer { padding: var(--space-7) 0 var(--space-6); border-top: 1px solid var(--border); }
    .footer-row { display: flex; flex-direction: column; gap: var(--space-4); align-items: center; text-align: center; }
    @media (min-width: 760px) { .footer-row { flex-direction: row; justify-content: space-between; text-align: left; } }
    .footer-credits { color: var(--muted); font-size: 13px; }
    .footer-links { display: flex; gap: var(--space-4); flex-wrap: wrap; font-size: 13px; color: var(--muted); }
    .footer-links a:hover { color: var(--cyan); }
    .footer-social { display: flex; gap: var(--space-3); }
    .footer-social a { width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--border-hi); border-radius: 50%; transition: border-color .2s, color .2s; color: var(--text); }
    .footer-social a:hover { border-color: var(--cyan); color: var(--cyan); }
```

- [ ] **Step 2: Insert before `</main>` and close `</main>`**

Replace the trailing `</main>` (if open) or add at the end:
```html
  </main>

  <footer class="footer" role="contentinfo">
    <div class="container footer-row">
      <a class="wordmark" href="#" aria-label="NEXT SHOW">
        <span class="next">NEXT</span><span class="show">SHOW</span>
      </a>
      <p class="footer-credits">Producido por <strong>Nexo Productions</strong> · © 2026</p>
      <nav class="footer-links" aria-label="Legales">
        <a href="/politica-privacidad.html">Privacidad</a>
        <a href="/politica-privacidad.html#terminos">Términos</a>
        <a href="mailto:boletas@nextshow.co">Contacto</a>
      </nav>
      <div class="footer-social">
        <a href="https://instagram.com/nextshowcol" aria-label="Instagram" target="_blank" rel="noopener">IG</a>
        <a href="https://wa.me/573106619353" aria-label="WhatsApp" target="_blank" rel="noopener">WA</a>
      </div>
    </div>
  </footer>
```

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): footer with credits + legales + redes"
```

---

### Task 3.10: Sticky CTA bar

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Append styles inside `<style>`**

```css
    /* ============ STICKY CTA ============ */
    .sticky-cta { position: fixed; left: 50%; bottom: var(--space-5); transform: translateX(-50%) translateY(150%); display: inline-flex; gap: var(--space-3); align-items: center; padding: 10px 12px 10px var(--space-5); background: rgba(10,6,18,.92); backdrop-filter: blur(18px); border: 1px solid var(--border-hi); border-radius: 99px; box-shadow: 0 18px 36px rgba(0,0,0,.5); z-index: 60; transition: transform .35s ease; }
    .sticky-cta[data-visible="true"] { transform: translateX(-50%) translateY(0); }
    .sticky-cta .info { font-size: 13px; color: var(--muted); }
    .sticky-cta .info strong { color: var(--text); }
    @media (max-width: 599px) {
      .sticky-cta { left: 0; right: 0; bottom: 0; transform: translateY(150%); border-radius: 0; padding: var(--space-3) var(--space-4); width: 100%; justify-content: space-between; }
      .sticky-cta[data-visible="true"] { transform: translateY(0); }
    }
```

- [ ] **Step 2: Insert markup just before `</body>`** (after footer, before `<div id="fomo-container">`)

```html
  <div class="sticky-cta" id="sticky-cta" data-visible="false" aria-hidden="true">
    <span class="info">Risas <strong>$75k</strong> · Cantas <strong>$150k</strong></span>
    <button class="btn btn-primary" data-cta="sticky-comprar" data-tier="risas">Comprar</button>
  </div>
```

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): sticky CTA bar (desktop pill + mobile full bar)"
```

---

## Phase 4 · JS wire-up

### Task 4.1: Bootstrap module (UrlAttribution + i18n + countdown init)

**Files:**
- Modify: `public/index.html` (append `<script type="module">` block before `</body>`)

- [ ] **Step 1: Append the script block**

Insert immediately before `</body>` (after sticky-cta + fomo-container + toast-container divs):
```html
  <!-- ============ BOOTSTRAP ============ -->
  <script type="module">
    import { sb } from '/shared/supabase-client.js';
    import { loadI18n } from '/shared/i18n.js';
    import { Toast } from '/shared/toast.js';
    import { UrlAttribution } from '/shared/url-attribution.js';
    import { FomoEngine } from '/shared/fomo-engine.js';

    // ---------- URL Attribution ----------
    const attribution = new UrlAttribution();
    window.__NEXTSHOW_ATTR__ = attribution;  // exposed for CheckoutModal (pasted in Task 4.7)

    // ---------- i18n ----------
    const userLang = (navigator.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es';
    loadI18n(userLang).then(() => {
      // hydrate [data-i18n] keys (i18n.js handles this internally if exported; otherwise no-op)
    }).catch((err) => console.warn('[i18n] load failed:', err));

    // ---------- Countdown ----------
    const EVENT_DATE = new Date('2026-08-15T20:00:00-05:00');
    function tickCountdown() {
      const now = new Date();
      const diff = EVENT_DATE - now;
      const el = (id) => document.getElementById(id);
      if (diff <= 0) {
        el('cd-days').textContent = '0';
        el('cd-hours').textContent = '0';
        el('cd-min').textContent = '0';
        el('cd-sec').textContent = '0';
        return;
      }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff / 3600000) % 24);
      const min   = Math.floor((diff / 60000) % 60);
      const sec   = Math.floor((diff / 1000) % 60);
      el('cd-days').textContent = String(days);
      el('cd-hours').textContent = String(hours).padStart(2, '0');
      el('cd-min').textContent = String(min).padStart(2, '0');
      el('cd-sec').textContent = String(sec).padStart(2, '0');
    }
    tickCountdown();
    setInterval(tickCountdown, 1000);

    // (FOMO engine, boletería refresh, scroll fx wired in next tasks)

    window.__NEXTSHOW__ = { sb, attribution };
  </script>
```

- [ ] **Step 2: Reload + verify**

Open `http://localhost:8000/`, open devtools, confirm:
- No console errors.
- `window.__NEXTSHOW__` exists with `sb` and `attribution`.
- Countdown shows real numbers (days until 2026-08-15).

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): bootstrap module (UrlAttribution + i18n + countdown)"
```

---

### Task 4.2: Mount FomoEngine

**Files:**
- Modify: `public/index.html` (append inside the bootstrap `<script type="module">`)

- [ ] **Step 1: Add FomoEngine init before the final `window.__NEXTSHOW__ = ...` line**

```js
    // ---------- FOMO Engine ----------
    const fomo = new FomoEngine({ sb });
    fomo.start().catch((err) => console.warn('[fomo] start failed:', err));
```

- [ ] **Step 2: Update `window.__NEXTSHOW__` export to include fomo**

Replace:
```js
    window.__NEXTSHOW__ = { sb, attribution };
```
With:
```js
    window.__NEXTSHOW__ = { sb, attribution, fomo };
```

- [ ] **Step 3: Add CSS for FOMO pop (inside the main `<style>` block)**

```css
    /* ============ FOMO POP ============ */
    #fomo-container { position: fixed; left: var(--space-4); bottom: var(--space-5); z-index: 55; display: grid; gap: var(--space-2); pointer-events: none; }
    .fomo-pop { display: inline-flex; align-items: center; gap: 10px; padding: 10px 16px; background: rgba(10,6,18,.92); backdrop-filter: blur(14px); border: 1px solid var(--border-hi); border-radius: 99px; box-shadow: var(--shadow-card); font-size: 13px; animation: fomoIn .35s ease, fomoOut .4s ease 7.4s; }
    .fomo-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 12px var(--cyan); }
    @keyframes fomoIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes fomoOut { to { opacity: 0; transform: translateY(20px); } }
```

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): mount FomoEngine + pop-up styles"
```

---

### Task 4.3: Boletería refresh counts (with fallback)

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Decide based on Task 0.2 outcome**

If `seats_summary` view **exists** in Supabase: follow Step 2.
If view does **NOT** exist: skip to Step 3 (static fallback).

- [ ] **Step 2 (view exists): Add refresh logic**

Inside the `<script type="module">`, before `window.__NEXTSHOW__ = ...`:
```js
    // ---------- Boletería counters ----------
    async function refreshBoleteriaCounts() {
      try {
        const rows = await sb.query('seats_summary', { select: 'zone,available' });
        // Expected shape: [{zone:'risas', available: 87}, {zone:'cantas', available: 32}]
        for (const r of rows || []) {
          if (r.available < 50) {
            const el = document.getElementById(`${r.zone}-remaining`);
            if (el) {
              el.hidden = false;
              el.textContent = `Quedan ${r.available} · cierra pronto`;
            }
          }
        }
      } catch (err) {
        console.warn('[boleteria] counters fetch failed (silent):', err);
      }
    }
    refreshBoleteriaCounts();
```

- [ ] **Step 3 (view does NOT exist): Insert this comment + TODO instead**

```js
    // ---------- Boletería counters ----------
    // TODO: seats_summary view not yet in Supabase. When created, fetch and show
    // "Quedan X · cierra pronto" in #risas-remaining and #cantas-remaining when available < 50.
    // For now counters stay hidden (rendered with [hidden] in HTML).
```

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): boletería counters (live or fallback per Supabase view)"
```

---

### Task 4.4: Scroll FX (reveal + sticky CTA toggle)

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add scroll fx inside the bootstrap script, before `window.__NEXTSHOW__ = ...`**

```js
    // ---------- Scroll FX ----------
    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('visible');
            revealObserver.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12 },
    );
    document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

    const heroEl = document.querySelector('.hero');
    const stickyEl = document.getElementById('sticky-cta');
    if (heroEl && stickyEl) {
      const heroObserver = new IntersectionObserver(
        ([entry]) => {
          const visible = !entry.isIntersecting;
          stickyEl.setAttribute('data-visible', visible ? 'true' : 'false');
          stickyEl.setAttribute('aria-hidden', visible ? 'false' : 'true');
        },
        { threshold: 0.05 },
      );
      heroObserver.observe(heroEl);
    }
```

- [ ] **Step 2: Visual check**

Reload. Scroll past hero → sticky CTA bar slides in. Scroll back to top → slides out.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): IntersectionObserver reveal + sticky CTA toggle"
```

---

### Task 4.5: Wire CTAs to CheckoutModal

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Inside bootstrap script, before `window.__NEXTSHOW__ = ...`, add**

```js
    // ---------- CTA click → CheckoutModal ----------
    document.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-cta]');
      if (!btn) return;
      ev.preventDefault();
      const tier = btn.dataset.tier || 'risas';
      const source = btn.dataset.cta;
      // CheckoutModal class is pasted inline in Task 4.6 and exposed as window.__NEXTSHOW_CHECKOUT__
      if (window.__NEXTSHOW_CHECKOUT__?.open) {
        window.__NEXTSHOW_CHECKOUT__.open({ tier, source });
      } else if (typeof window.comprarBoleta === 'function') {
        // legacy fallback wired in Task 4.6
        window.comprarBoleta(tier);
      } else {
        console.warn('[cta] checkout not ready');
      }
    });
```

- [ ] **Step 2: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): wire data-cta clicks to CheckoutModal"
```

---

### Task 4.6: Re-insert checkout classes from pre-rebuild backup

**Files:**
- Modify: `public/index.html`

> This is the trickiest task: copy the existing inline classes verbatim so checkout keeps working. We're transplanting code, not rewriting it.

- [ ] **Step 1: Extract the relevant block from backup**

Run:
```bash
sed -n '1564,2955p' public/index.html.pre-rebuild > /tmp/checkout-block.txt
wc -l /tmp/checkout-block.txt
```
Expected: ~1390 lines (the block from `<div id="checkout-modal">` through closing `</script>`).

Inspect: `head -20 /tmp/checkout-block.txt; tail -20 /tmp/checkout-block.txt` to confirm it begins with the modal HTML and ends with the closing script tag.

- [ ] **Step 2: Identify what's HTML vs script in that block**

The block contains:
- HTML modal markup (lines `<div id="checkout-modal">...<div id="fomo-container">` — already moved earlier, skip the fomo-container line)
- Inline `<style>` block for checkout CSS
- Inline `<script>` (NOT `type="module"`) declaring classes `CheckoutModal`, `SeatMap`, `QuantityStepper`, `BuyerForm`, `OrderConfirmation` and the legacy `comprarBoleta()` function

We need:
- HTML modal markup → insert before `</main>` in new index.html
- Inline `<style>` block from checkout → append after the existing `<style>` block (or merge into it — appending as a new style block is fine)
- Inline `<script>` (classic, not module) → insert AFTER the module bootstrap script

- [ ] **Step 3: Insert checkout modal HTML before `</main>`**

Open `public/index.html.pre-rebuild`, locate `<div id="checkout-modal" class="checkout-modal" ...>` through its matching `</div>` close (use `grep -n 'checkout-modal\|toast-container\|fomo-container' public/index.html.pre-rebuild` to find boundaries). Copy that exact markup and paste it inside the new `public/index.html`, just before `</main>`.

- [ ] **Step 4: Append checkout `<style>` to new file**

In `public/index.html.pre-rebuild`, find the `<style>` block that contains `.checkout-modal {` (around line 1670). Copy from that opening `<style>` to its matching `</style>` and paste into new `public/index.html` immediately after the closing `</style>` of the design tokens block.

- [ ] **Step 5: Append checkout classic `<script>` to new file**

In `public/index.html.pre-rebuild`, find the `<script>` block that defines `class CheckoutModal` (around line 2496). Copy from that opening `<script>` (note: NOT `type="module"`) to its matching `</script>` and paste into new `public/index.html` AFTER the bootstrap module script.

**Critical:** This block also defines and uses inline `escapeHTML`, `t()`, `sb`, etc. Since the module script imports `sb` and uses ES module scope, but this classic script runs in global scope, we need to ensure the classic script can access `sb`. The original file declares `const { sb }` somewhere — find that line and ensure it's preserved.

If the classic script depends on `sb` being a global, add this line at the TOP of the classic script (before `class CheckoutModal`):
```js
const sb = window.__NEXTSHOW__?.sb;
const attribution = window.__NEXTSHOW__?.attribution;
```

- [ ] **Step 6: Expose CheckoutModal to global so CTA wire-up works**

At the END of the pasted classic script, add:
```js
// Expose to the data-cta wire-up in the bootstrap module
window.__NEXTSHOW_CHECKOUT__ = window.checkoutModal || (window.checkoutModal = new CheckoutModal());
// Legacy entry point that existing tests may call
window.comprarBoleta = window.comprarBoleta || function (tier) {
  window.__NEXTSHOW_CHECKOUT__.open({ tier, source: 'legacy' });
};
```

(If the original file already exposes `window.checkoutModal` or defines `comprarBoleta` globally, leave those lines as-is and skip the duplicates.)

- [ ] **Step 7: Smoke test checkout end-to-end**

Reload `http://localhost:8000/`. Click "Comprar boleta" in hero. Modal should open, show seat picker (Cantas) or quantity stepper (Risas). Fill buyer form, reach Wompi step.

If the modal does NOT open:
- Check console for errors about missing `sb`, missing `t`, missing functions.
- Verify the modal HTML markup is present (`document.getElementById('checkout-modal')` should return a node).
- Verify `window.__NEXTSHOW_CHECKOUT__` exists.

- [ ] **Step 8: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): re-insert CheckoutModal + SeatMap + BuyerForm classes from backup"
```

---

## Phase 5 · i18n keys

### Task 5.1: Add new keys to `es.json` and `en.json`

**Files:**
- Modify: `public/i18n/es.json`
- Modify: `public/i18n/en.json`

- [ ] **Step 1: Inspect existing structure**

```bash
cat public/i18n/es.json | head -30
```

- [ ] **Step 2: Append new keys to `es.json`**

Add (merge into existing JSON top level):
```json
{
  "nav": {
    "protagonistas": "Protagonistas",
    "formato": "La noche",
    "donde": "Dónde",
    "boleteria": "Boletas",
    "faq": "FAQ",
    "comprar": "Comprar"
  },
  "hero": {
    "eyebrow": "Sabanalarga · 15 ago 2026",
    "sub": "Una noche híbrida: bloque podcast en vivo + show completo.",
    "cta_primary": "Comprar boleta",
    "cta_secondary": "Cómo es la noche"
  },
  "protagonistas": {
    "eyebrow": "Lineup confirmado",
    "title": "Los protagonistas"
  },
  "formato": {
    "eyebrow": "El diferencial",
    "title_a": "Cómo es",
    "title_b": "la noche",
    "intro": "No es solo otro show. Es contenido que vive más allá de la noche."
  },
  "boleteria": {
    "eyebrow": "Compra ahora",
    "title": "Elige tu experiencia"
  },
  "faq": {
    "eyebrow": "Preguntas",
    "title": "Todo lo que necesitas saber"
  }
}
```

(Merge keys; do NOT overwrite existing keys for checkout etc.)

- [ ] **Step 3: Mirror keys in `en.json`**

```json
{
  "nav": {
    "protagonistas": "Lineup",
    "formato": "The Night",
    "donde": "Where",
    "boleteria": "Tickets",
    "faq": "FAQ",
    "comprar": "Buy"
  },
  "hero": {
    "eyebrow": "Sabanalarga · Aug 15, 2026",
    "sub": "A hybrid night: live podcast block + full show.",
    "cta_primary": "Buy ticket",
    "cta_secondary": "How the night works"
  },
  "protagonistas": {
    "eyebrow": "Confirmed lineup",
    "title": "The headliners"
  },
  "formato": {
    "eyebrow": "What makes it different",
    "title_a": "How",
    "title_b": "the night flows",
    "intro": "Not just another show. Content that lives beyond the night."
  },
  "boleteria": {
    "eyebrow": "Get yours",
    "title": "Pick your experience"
  },
  "faq": {
    "eyebrow": "Questions",
    "title": "Everything you need to know"
  }
}
```

- [ ] **Step 4: Wire `[data-i18n]` attrs (optional — only if `i18n.js` supports auto-hydration)**

Inspect `public/shared/i18n.js` to see if it exposes a `hydrate()` or similar that walks `[data-i18n]` keys. If yes, sprinkle `data-i18n="nav.comprar"` etc. on markup. If not (it only exports `loadI18n` + `t()`), leave HTML hard-coded in Spanish and rely on `t()` for future dynamic strings. Decide and document the choice as a comment in the bootstrap script.

- [ ] **Step 5: Commit**

```bash
git add public/i18n/es.json public/i18n/en.json
git commit -m "feat(i18n): add nav + hero + sections keys for new landing"
```

---

## Phase 6 · Tests

### Task 6.1: Vitest sanity

**Files:**
- (read-only) existing test suite

- [ ] **Step 1: Run all unit tests**

```bash
npx vitest run
```
Expected: All pass, including the 2 new (url-attribution, fomo-engine) and any pre-existing.

If any fail, investigate. Most likely culprits: existing tests that referenced internals of inline classes — those tests must be updated to import from the new shared modules. Make the fix in the same commit.

- [ ] **Step 2: Commit any fixes**

```bash
git add tests/
git commit -m "test: align pre-existing tests with extracted shared modules"
```

(Skip if no changes needed.)

---

### Task 6.2: Playwright happy-path E2E

**Files:**
- Create: `tests/e2e/landing-to-checkout.spec.ts`

- [ ] **Step 1: Verify Playwright config**

```bash
ls playwright.config.* 2>&1
```
If none, the executor must create `playwright.config.ts` minimal:
```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:8000', headless: true },
  webServer: { command: 'npm run dev', port: 8000, reuseExistingServer: true, timeout: 60000 },
});
```

- [ ] **Step 2: Write the test**

Create `tests/e2e/landing-to-checkout.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test.describe('landing → checkout happy path', () => {
  test('hero CTA opens CheckoutModal in Risas tier', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.wordmark .show')).toBeVisible();
    await expect(page.locator('.hero h1')).toContainText(/NEXT/);
    await page.getByRole('button', { name: /comprar boleta/i }).first().click();
    await expect(page.locator('#checkout-modal')).toBeVisible({ timeout: 5000 });
  });

  test('boletería Cantas CTA opens modal in Cantas tier', async ({ page }) => {
    await page.goto('/#boleteria');
    await page.getByRole('button', { name: /comprar cantas/i }).click();
    await expect(page.locator('#checkout-modal')).toBeVisible({ timeout: 5000 });
    // Cantas should show seat map step
    await expect(page.locator('.seat-map-wrap, .ck-seat-map')).toBeVisible({ timeout: 5000 });
  });

  test('sticky CTA appears after scrolling past hero', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#sticky-cta')).toHaveAttribute('data-visible', 'false');
    await page.locator('#boleteria').scrollIntoViewIfNeeded();
    await expect(page.locator('#sticky-cta')).toHaveAttribute('data-visible', 'true');
  });
});
```

- [ ] **Step 3: Run**

```bash
npx playwright test tests/e2e/landing-to-checkout.spec.ts
```
Expected: 3 passed. If failures, inspect output; most likely the selectors need tweaking based on what the actual CheckoutModal HTML emits (use `--debug`).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/landing-to-checkout.spec.ts playwright.config.ts
git commit -m "test(e2e): landing CTAs open CheckoutModal + sticky CTA toggle"
```

---

### Task 6.3: Lighthouse audit (manual)

**Files:**
- Create: `lighthouse-landing.html` (gitignored, just for record)

- [ ] **Step 1: Run audit**

```bash
npx lighthouse http://localhost:8000/ \
  --preset=desktop --output html --output-path lighthouse-landing-desktop.html \
  --chrome-flags="--headless"
npx lighthouse http://localhost:8000/ \
  --form-factor=mobile --output html --output-path lighthouse-landing-mobile.html \
  --chrome-flags="--headless"
```

- [ ] **Step 2: Read targets**

Open both HTML reports. Spec targets (mobile): Perf ≥90, A11y ≥95, BP ≥95, SEO ≥90.

- [ ] **Step 3: Fix the top 3 offenders if any score is below target**

Common Perf misses + fixes:
- Largest Contentful Paint too slow → add `fetchpriority="high"` to hero `<img>`, ensure `eager` not `lazy`.
- CLS issues → confirm all `<img>` have `width`/`height` attrs.
- Unused CSS → out of scope to chase; only fix if score actually below 90.

A11y misses + fixes:
- Missing `alt` on decorative img → set `alt=""` + `aria-hidden="true"`.
- Color contrast on `--muted` text under 4.5:1 → bump to `#b8b3cc` if needed.

Apply minimal fixes inline and re-run.

- [ ] **Step 4: Commit lighthouse fixes (only) if any**

```bash
git add public/index.html
git commit -m "perf/a11y: fix lighthouse findings (hero priority, alt text, contrast)"
```

---

## Phase 7 · Cleanup & deploy gate

### Task 7.1: HTML size + dead-code check

**Files:**
- Modify: `public/index.html` (only if cleanup needed)

- [ ] **Step 1: Measure size**

```bash
ls -l public/index.html
```
Target: ≤ 220 KB. (Spec said 200; some slack OK if checkout block bloats it.)

If over: scan for repeated CSS that could collapse, dead `comprarBoleta` references that no longer apply, or commented-out blocks. Trim and re-measure.

- [ ] **Step 2: Confirm no references to dropped concepts**

```bash
grep -n -i 'tarima\|lead form\|lead-form\|patrocinadores\|sponsors' public/index.html
```
Expected: 0 hits. If hits exist, remove the markup.

- [ ] **Step 3: Run linter**

```bash
npm run lint
```
Fix any obvious issues.

- [ ] **Step 4: Commit cleanup**

```bash
git add public/index.html
git commit -m "chore(landing): drop dead refs + size audit (≤220 KB)"
```

(Skip if nothing to remove.)

---

### Task 7.2: Cross-device manual smoke

**Files:**
- (none)

- [ ] **Step 1: Desktop Chrome**

Open `http://localhost:8000/` in Chrome:
- Hero loads in <2s.
- Countdown ticks.
- Click "Comprar boleta" → modal opens.
- Tab through nav with keyboard — focus rings visible (cyan).

- [ ] **Step 2: Mobile viewport**

In DevTools, switch to iPhone 14 viewport:
- Hero stacks vertically.
- Sticky CTA appears as full-width bottom bar after scroll.
- Snap-scroll disabled (smooth scroll only).
- Tap "Comprar Risas" → modal opens, scrollable.

- [ ] **Step 3: Reduced motion**

DevTools → Rendering → Emulate CSS prefers-reduced-motion: reduce.
- Reload. No countdown pulse animation, no ticker scroll, no reveal-on-scroll animation.

- [ ] **Step 4: No-JS fallback**

DevTools → Settings → Disable JavaScript. Reload.
- noscript banner visible at top.
- All sections still render (since markup is server-side / static).
- CTAs do nothing on click (acceptable).

- [ ] **Step 5: Note any issues**

If anything blocks deploy, create a follow-up commit with the fix. Otherwise proceed.

---

### Task 7.3: Final PR

**Files:**
- (none)

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/landing-rebuild-2026-05-20
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat(landing): rebuild with cyan palette + correct lineup + FOMO ticker" --body "$(cat <<'EOF'
## Summary
- Rewrite of `public/index.html` cascarón per `docs/superpowers/specs/2026-05-20-landing-rebuild-design.md`
- Fixes incorrect lineup: now lists Toromobolo + Jair as protagonists; Natalya as host of podcast block
- Drops Tarima tier (only Risas $75k and Cantas $150k)
- Applies 3-stop cyan→violet→magenta palette + CSS wordmark
- Adds live FOMO ticker, sticky CTA, snap-scroll on desktop
- Extracts `UrlAttribution` and `FomoEngine` to `public/shared/` with Vitest tests
- Re-uses inline `CheckoutModal` + sub-classes verbatim from pre-rebuild backup
- New optimized photos in `public/assets/img/` (2 sizes each, WebP when available)

## Test plan
- [ ] `npx vitest run` (all pass, includes 2 new modules)
- [ ] `npx playwright test tests/e2e/landing-to-checkout.spec.ts` (3 pass)
- [ ] Lighthouse mobile: Perf ≥90 / A11y ≥95 / BP ≥95 / SEO ≥90
- [ ] Manual: desktop Chrome happy path → checkout step pago
- [ ] Manual: iPhone viewport sticky bar + tap targets
- [ ] Manual: `prefers-reduced-motion` disables animations
- [ ] Manual: no-JS shows fallback banner and all sections still render

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Comment final URL**

When PR is created, copy the URL and post in chat for review.

---

## Out-of-scope follow-ups (do NOT do in this plan)

Track these as separate tasks for future iterations:
1. Regenerate `NEXTSHOW-LOGO-KIT` PNGs with cyan→violet→magenta gradient to match the page palette.
2. Create `seats_summary` Supabase view if Task 0.2 confirmed it's missing.
3. Add `i18n.hydrate([data-i18n])` to `shared/i18n.js` for declarative i18n in markup.
4. Move `CheckoutModal` and sub-classes out of inline `<script>` into `public/shared/checkout/*.js` modules (this plan keeps them inline to minimize risk).
5. Add Playwright visual regression baseline (`tests/visual/landing-sections.spec.ts`) once design is locked.

---

## Self-Review Checklist (already executed)

- [x] **Spec coverage:** every spec section maps to one or more tasks above.
- [x] **No placeholders:** every code step contains real code.
- [x] **Type consistency:** `FomoEngine({ sb, ... })`, `UrlAttribution()`, `data-tier="risas|cantas"`, `data-cta="..."` used identically across phases.
- [x] **Realistic granularity:** each task is 2–10 minutes for a competent developer.

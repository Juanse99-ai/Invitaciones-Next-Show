# NEXT SHOW · Landing rebuild — Diseño

**Fecha:** 2026-05-20
**Evento objetivo:** NEXT SHOW · Toromobolo Welc'h + Jair Luquez · Sabanalarga · 2026-08-15
**Alcance:** Reescritura completa del cascarón visual de `public/index.html` (hero, secciones, footer). Reuso íntegro del checkout y utilidades compartidas.
**Estado:** Pendiente de aprobación final del usuario.

---

## 1. Objetivos y no-objetivos

### Objetivos
- Corregir errores de identidad en la landing actual:
  - Listar a **Toromobolo + Jair** como protagonistas (la versión actual lista incorrectamente a Jair + Natalya).
  - Posicionar a **Natalya Ruiz Blel** como **conductora** del bloque podcast, no como artista.
  - Eliminar el tier "Tarima" (no existe en el pricing vigente; sólo Risas $75k y Cantas $150k).
- Exponer el diferencial comercial principal: el **formato híbrido podcast 15-20 min + show artista**, capturado como contenido digital (tesis "Joven conduce. Maduros entregan. Adultos compran.").
- Vender boletas y capturar leads de forma implícita vía el email del comprador en checkout (sin formulario separado de "descuento $10k", se descarta el del actual).
- Aplicar la paleta oficial **B (3-stop con cyan)**: `--cyan #00d4ff → --violet #7c3aed → --magenta #d946ef`, con cyan reservado como acento eléctrico (ticker, hover, focus, "live").
- Renderizar el wordmark NEXT SHOW vía **CSS** (NEXT blanco + SHOW gradient), reservando los PNGs del `NEXTSHOW-LOGO-KIT` para spots externos (WhatsApp avatar, prints).
- Conservar el patrón vanilla "no build" del proyecto: HTML + ES2024 + CSS inline + CDN.

### No-objetivos
- Reescribir el checkout (CheckoutModal, SeatMap, BuyerForm, QuantityStepper, OrderConfirmation) — se reusan intactos.
- Reescribir utilidades compartidas (`shared/supabase-client.js`, `shared/wompi-client.js`, `shared/toast.js`, `shared/i18n.js`, `shared/analytics.js`).
- Lead form con descuento $10k (descartado por el usuario).
- Sección de patrocinadores en la landing (descartada).
- Regenerar el PNG kit del logo con la paleta cyan (queda como mejora aparte; el wordmark CSS basta para esta landing).
- Cambios al schema de Supabase, edge functions, scanner, admin o asignación.
- i18n: la infraestructura existente (es/en) se mantiene y se hidrata. Se agregan/modifican **keys** dentro de `es.json` y `en.json` para las nuevas secciones, pero **no se agregan idiomas nuevos**.

---

## 2. Decisiones tomadas en brainstorming

| Decisión | Elección |
|---|---|
| Objetivo primario | Vender boletas + capturar leads (lead = email del comprador en checkout) |
| Paleta | **B · 3-stop con cyan** (`#00d4ff → #7c3aed → #d946ef`) |
| Logo en página | Wordmark CSS (NEXT blanco + SHOW gradient en Anton/Impact). PNG kit auxiliar. |
| Estructura artistas + conductora | **2 secciones separadas**: "Los protagonistas" (Toromobolo + Jair) y "Cómo es la noche" (formato + Natalya conduce) |
| Secciones extra | Venue (fotos cancha noche) + FAQ corto. **Sin** lead form, **sin** patrocinadores. |
| Scope rebuild | **Sólo cascarón + secciones**. Checkout y utilidades intactos. |
| Estilo/layout macro | **Approach C · Live ticker urbano** (FOMO ticker, sticky CTA, snap-scroll desktop, micro-animations) |

---

## 3. Arquitectura

### 3.1 File layout
```
public/
├ index.html                       ← reescrito completo
├ assets/
│ ├ brand/
│ │ ├ favicon.svg                  ← extraído del wordmark
│ │ └ nextshow-wordmark.svg        ← fallback no-fuente (cuando Anton no carga); render principal es CSS
│ ├ img/                           ← nuevo
│ │ ├ toromobolo-hero.jpg          ← desde `FOTOS ARTISTAS/Fondo de "DSC_3083" eliminado.png` (convertir a jpg optimizado)
│ │ ├ jair-hero.jpg                ← desde `FOTOS ARTISTAS/Fondo de "JAIR LUQUEZ" eliminado.png`
│ │ ├ natalya.jpg                  ← desde `recursos/propuestas/fotonatfinal.png`
│ │ └ venue-cancha-noche.jpg       ← desde `recursos/ambiente/fotocanchadenoche.png`
│ └ icons/                         ← intacto
├ shared/                          ← intacto
│ ├ analytics.js
│ ├ i18n.js
│ ├ supabase-client.js
│ ├ toast.js
│ └ wompi-client.js
└ i18n/                            ← actualizar es.json/en.json con nuevas keys
```

Imágenes: cada foto en 2 tamaños (mobile 800w + desktop 1600w) con `<picture>` + `srcset`, target ≤200 KB cada archivo (Squoosh/cwebp manual; documentado en el plan).

### 3.2 Patrón vanilla preservado
- Toda la lógica en `<script type="module">` al final del `<body>`, ES2024.
- Design tokens inlineados en `:root` dentro de `<style>` en `<head>` (fuente de verdad sigue siendo `docs/BRAND.md`).
- Imports de utilidades vía rutas relativas `./shared/...js`.
- Sin build step, sin bundler. CDN sólo para fuentes (Google Fonts: Anton, Inter, Great Vibes).

### 3.3 Tres capas JS
1. **Bootstrap** — `UrlAttribution.init()`, lectura `?utm_*` → localStorage, carga i18n, init countdown, init `FomoEngine`.
2. **Reveal / Scroll** — `IntersectionObserver` para revelar cards al entrar viewport y para toggle de la sticky CTA bar.
3. **Checkout** — `CheckoutModal.open({tier, source})` al click en CTA de boletería; toda la lógica posterior delegada al módulo existente.

---

## 4. Inventario de secciones (top → bottom)

| # | Sección | Propósito | Componentes clave |
|---|---------|-----------|--------------------|
| 1 | Nav sticky | Marca + acceso compra siempre visible | Wordmark CSS, links anchor (`#protagonistas`, `#formato`, `#donde`, `#boleteria`, `#faq`), botón "Comprar" compacto |
| 2 | Hero | Impacto + fecha + CTA primaria | Ticker FOMO superior, headline NEXT SHOW (wordmark), subtítulo "Sabanalarga · Atlántico · 15 ago 2026", countdown 4 cards (días/horas/min/seg), 2 caras (Toromobolo + Jair), CTA primario "Comprar boleta" + secundario "Cómo es la noche", radial glows ambient |
| 3 | LOS PROTAGONISTAS | Credibilidad artística | 2 cards grandes (foto + nombre + 1-line trayectoria + bio expandible 2-3 frases) |
| 4 | CÓMO ES LA NOCHE + NATALYA | Diferencial formato podcast | Bloque narrativo 3 pasos numerados ("01 · Bloque podcast 15-20 min" / "02 · Show artista completo" / "03 · El contenido queda vivo"), card lateral Natalya con foto + chip "CONDUCE" + 1 línea ("A un Click · Telecaribe · 59K IG") |
| 5 | DÓNDE | Sentido de lugar | Foto cancha noche full-bleed, dirección Sabanalarga Atlántico, "300 cupos", botón "Cómo llegar" (link Google Maps) |
| 6 | ELIGE TU EXPERIENCIA | Conversión | 2 cards tier (Risas $75k · 200 cupos / Cantas $150k · 100 cupos), badge "+upgrade D-15 a Cantas por $25k" en Risas, contador "Quedan X" si <50, CTA "Comprar" abre `CheckoutModal` con `{tier, source: 'boleteria-{tier}'}` |
| 7 | PREGUNTAS | Quitar fricción de cierre | Acordeón 5-6 (edad mínima · comida/bebida · parking · qué pasa si llueve · devoluciones · contacto) |
| 8 | Footer | Cierre + legales | Wordmark, "Producido por Nexo Productions", links (Política de privacidad, Términos, Contacto), redes (IG, FB, TikTok, WA) |
| 9 | Sticky CTA bar | Conversión siempre al alcance | Aparece tras scroll past hero, muestra "Risas $75k · Cantas $150k", botón "COMPRAR" (abre modal en tier Risas por defecto) |

---

## 5. Data flow

```
DOMContentLoaded
  ├─ UrlAttribution.init()              [shared/analytics.js o módulo nuevo]
  │   └─ lee ?utm_* + referrer → localStorage 'attr'
  ├─ i18n.init(navigator.language)      [shared/i18n.js]
  │   └─ fetch /i18n/{es,en}.json → hidrata [data-i18n]
  ├─ Countdown.start(EVENT_DATE)         [inline, const EVENT_DATE='2026-08-15T20:00:00-05:00']
  │   └─ setInterval 1s → update #cd-days/hours/min/seg, fallback "Hoy" si ≤0
  ├─ FomoEngine.mount('#fomo-ticker')    [reuse, ya existe]
  │   └─ Supabase Realtime channel 'tickets_sold' → push items al ticker
  ├─ Boleteria.refreshCounts()           [nuevo, llama view Supabase]
  │   └─ render "Quedan X" si <50 (asumido: view 'seats_summary' devuelve disponibilidad por tier; si no existe, fallback texto estático)
  └─ ScrollFx.init()                     [inline]
      ├─ IntersectionObserver .reveal-on-scroll → add .visible
      └─ IntersectionObserver .hero → toggle [data-sticky-cta-visible]

Click CTA "Comprar" (cualquiera)
  └─ CheckoutModal.open({ tier, source })   [reuse, ya wired]
      └─ stepper 1→2→3→4 (asientos → datos → pago Wompi → confirmación)
```

**Supuestos verificables en implementación:**
- Existe (o se crea) vista Supabase para contar boletas disponibles por tier. Si no existe, sección boletería muestra contadores estáticos y se crea ticket de seguimiento.
- `FomoEngine` ya está expuesto como módulo importable. Si está embebido inline en `index.html` actual, se extrae a `shared/fomo-engine.js` como parte del rebuild.

---

## 6. Error handling

| Falla | Comportamiento |
|---|---|
| Supabase fetch falla | Countdown muestra fecha estática sin tick; FOMO ticker queda oculto en silencio; contadores boletería caen a texto fijo. Log a `console.warn`, no toast. |
| Image load falla | Placeholder CSS = card con `background: var(--gradient)` + iniciales del artista (T / J / N) centradas en Anton. |
| No-JS habilitado | Contenido HTML semántico visible (todas las secciones renderizan); CTAs "Comprar" caen a `<a href="mailto:boletas@nextshow.co">`. Noscript banner discreto pidiendo activar JS para checkout. |
| Wompi / checkout error | Ya manejado por `CheckoutModal` y `shared/toast.js`. Sin cambios. |
| `prefers-reduced-motion: reduce` | Desactiva snap-scroll, parallax, micro-animations de reveal y countdown pulse. Transiciones pasan a `transition: none`. |
| Móvil < 768px | `scroll-snap-type` se desactiva; sticky CTA bar pasa a barra inferior fija. |
| Imagen muy grande / 3G lento | `<img loading="lazy">` salvo hero (eager). Hero usa `<picture>` con WebP + JPG fallback. |

---

## 7. Testing

| Tipo | Qué se prueba | Cómo |
|---|---|---|
| Visual smoke | Cada sección renderiza correcto desktop+móvil | Playwright screenshot test contra baseline (a generar) |
| E2E happy path | Landing → click "Comprar" Risas → modal abierto → buyer form rellenable → step pago Wompi sandbox alcanzado | `tests/e2e/landing-to-checkout.spec.ts` (a crear) |
| Lighthouse móvil | Performance ≥90 · A11y ≥95 · Best Practices ≥95 · SEO ≥90 | `npx lighthouse` manual + reporte en `lighthouse-landing.html` |
| Unit | Vitest existentes no rompen | `npx vitest run` |
| Manual | reduced-motion, keyboard tab order, screen reader (VoiceOver), no-JS fallback | Checklist en plan |

---

## 8. Assets a generar (fase implementación)

| Asset | Origen | Procesamiento |
|---|---|---|
| toromobolo-hero.jpg | `FOTOS ARTISTAS/Fondo de "DSC_3083" eliminado.png` | resize 1600w + 800w, WebP + JPG, ≤200 KB |
| jair-hero.jpg | `FOTOS ARTISTAS/Fondo de "JAIR LUQUEZ" eliminado.png` | idem |
| natalya.jpg | `recursos/propuestas/fotonatfinal.png` | idem |
| venue-cancha-noche.jpg | `recursos/ambiente/fotocanchadenoche.png` | resize 2400w + 1200w (full-bleed) |
| favicon.svg | Wordmark stacked, glyph N+S en gradient | generar nuevo |

Comando de optimización a documentar en el plan (sin requerir herramienta no instalada, usar `sips` macOS + `cwebp` si está disponible o fallback a `sips` puro).

---

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Snap-scroll molesta en móvil | Desactivar `scroll-snap-type` bajo 768px; usar `proximity` (no `mandatory`) en desktop |
| Ticker FOMO sin datos reales aún | Si Supabase Realtime channel está vacío, ticker muestra mensajes seed honestos (ej. "Cupos limitados · 300 sólo") sin fingir actividad |
| Logo PNG no cuadra con paleta B | Wordmark CSS resuelve para esta landing; se documenta tarea aparte para regenerar PNG kit con cyan |
| Tamaño `index.html` actual (414 KB) viene de CSS+JS inlineados | Mantenemos inline pero auditamos: target ≤200 KB HTML después del rebuild (sin lazy-loaded de scripts compartidos, que se mueven a `shared/*`) |
| Bug regresivo en checkout | Reuso intacto + smoke E2E antes de merge |
| Pérdida de SEO / OG | Conservar y actualizar `<meta>` OG, Twitter Card, JSON-LD `Event` |

---

## 10. Métricas de éxito post-deploy

- Bounce rate ≤55% (medir con analytics existente)
- Click-through hero CTA → checkout open ≥15%
- Checkout open → step pago alcanzado ≥30%
- Lighthouse móvil ≥90 Performance
- Cero errores JS en consola en producción primeras 48h

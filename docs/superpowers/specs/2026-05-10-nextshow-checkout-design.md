# NEXT SHOW · Plataforma de venta de boletas — Diseño

**Fecha:** 2026-05-10
**Evento objetivo:** NEXT SHOW · Toromobolo Welc'h + Jair Luquez · Sabanalarga · 2026-08-15
**Aforo:** 300 cupos (200 Risas + 100 Cantas)
**Estado:** Aprobado, listo para plan de implementación

---

## 1. Objetivos y no-objetivos

### Objetivos
- Convertir la landing actual (`landing-nextshow-v6_1.html`) en una plataforma completa de venta de boletas con sensación de app reactiva.
- Vender el 100% del aforo (300 boletas) con autoservicio: cero intervención manual por compra.
- Soportar dos modalidades: Risas (200, orden de llegada) y Cantas (100, asiento numerado con mapa visual).
- Cobrar online vía Wompi (tarjeta, PSE, Nequi, Bancolombia).
- Emitir boleta digital con QR + PDF, entregada por email y WhatsApp.
- Validar ingreso en puerta con app PWA en celular del staff, con modo offline.
- Capturar atribución completa: cupones de pre-venta, referrers (embajadores, staff, leads orgánicos), UTMs.
- Panel admin accesible desde PC y móvil para operación del evento.

### No-objetivos (fuera de alcance esta fase)
- Facturación electrónica DIAN (Fase 3).
- Marketplace de reventa controlada (Fase 3).
- Programa de fidelización por puntos (Fase 3).
- App móvil nativa (PWA cubre necesidad).
- Multi-evento productizado (preparado en schema, ejecutado cuando haya segundo evento).
- Streaming pago paralelo (Fase 3).

---

## 2. Decisiones tomadas en brainstorming

| Decisión | Elección |
|---|---|
| Pasarela de pago | Wompi (Colombia, soporta tarjeta/PSE/Nequi/Bancolombia, ~3% comisión) |
| Selector de asientos Cantas | Mapa visual interactivo SVG |
| Layout Cantas | 4 filas × 25 sillas, pasillo central entre silla 12 y 13 |
| Precio Cantas | $150.000 todas las sillas (sin sub-zonas) |
| Datos por asistente | Comprador obligatorio + asignación posterior por link enviado al comprador |
| Backend | Supabase (Postgres + Edge Functions + Storage + Auth + pg_cron) |
| Entrega de boleta | Email (Resend) + WhatsApp (Meta Cloud API) con QR y PDF |
| Validación en puerta | Mini-app web custom instalable como PWA |
| Admin panel | Web responsive (PC + móvil), separado del scanner |
| Ubicación del checkout | Modal multi-paso overlay sobre la landing actual |
| Arquitectura del código | Single-file HTML extendido (sin framework), Edge Functions Deno, sin build step |

---

## 3. Alcance por fases

### MVP (lanzamiento del evento)
Sección 1 a 6 del diseño + las siguientes adiciones:
- Contador de cupos disponibles en vivo en la landing
- Tracking UTM persistente en `orders.attribution`
- Recordatorios automáticos por WhatsApp (7 días, 1 día, 2 horas antes)
- Calendar invite (`.ics`) adjunto al email
- Watermark dinámico con nombre del comprador en PDF
- Rate limiting en `create-order` (máx 5/min por IP)
- Cloudflare Turnstile en el checkout
- Pixels: Meta + TikTok + Google Analytics 4 con eventos custom
- FOMO popups con compras recientes anonimizadas
- Códigos QR físicos por canal (`?ref=tienda_juan`)
- Modo offline scanner con manifest cacheado

### Stack moderno 2026 (incluido en MVP)
- **Supabase Realtime**: el mapa de asientos recibe cambios en vivo via Postgres Changes (channel `seat_holds` + `tickets`). Polling de 3s queda como fallback si WS falla.
- **Apple Wallet (.pkpass) + Google Wallet**: post-pago, el ticket se ofrece como pase agregado al wallet nativo del celular (botones "Add to Apple Wallet" / "Add to Google Wallet"). Edge Function `generate-wallet-pass` firma con cert Apple + JWT Google.
- **View Transitions API**: transiciones entre pasos del checkout con `document.startViewTransition()`, animaciones nativas sin librerías (Chrome/Edge/Safari 18+; degrada graceful en Firefox).
- **Wompi 3DS Secure mandatorio** en tarjetas: configurar `acceptance_token` con `three_ds_auth_type=challenge_v2` para reducir contracargos.
- **Lighthouse 95+** target en landing, asignar y mi-boleta. Lazy load imágenes, fonts con `font-display: swap`, SVG inline para mapa, code splitting del modal.
- **WCAG 2.1 AA** en todo: contraste mínimo 4.5:1, navegación con teclado completa, ARIA labels en mapa de asientos (anuncio "Fila A silla 7 disponible" al focus), skip links, modal con focus trap.
- **i18n-ready**: textos en `i18n.es.json`. Función `t(key)` reemplaza strings. Switch a `i18n.en.json` activable con `?lang=en`. MVP solo `es`, infraestructura lista para `en`.
- **Hosting Netlify** con redirects para SPA-like routing y headers de seguridad (CSP, HSTS, X-Frame-Options).
- **GitHub privado** con CI básico (lint + tests E2E sandbox en cada PR).

### Fase 2 (semanas posteriores al MVP, antes del evento)
- Waitlist en zonas agotadas con notificación al liberarse cupo
- Transferir boleta a otro asistente (límite 1 cambio por boleta, log de auditoría)
- Refund self-service hasta 7 días antes del evento
- Addons combo (bebida/cena al checkout) con tabla `addons`
- Heatmap del venue (orden de venta de sillas)
- Reporte post-evento PDF auto-generado
- Encuesta NPS por WhatsApp 12h después
- Pre-venta del próximo evento con descuento al asistente del actual
- Cambio de asiento self-service desde página personal
- Página personal del asistente `/mi-boleta?t=...`
- Validación cédula contra Registraduría (opcional)
- QR rotativo en página personal (anti-foto)

### Fuera de alcance hasta nuevo aviso
DIAN, marketplace reventa, fidelización, app nativa, streaming pago, multi-evento productizado.

---

## 4. Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│  landing-nextshow.html (single file extendido)          │
│  ├─ Landing actual (intacta)                            │
│  ├─ Modal checkout multi-paso                           │
│  │   ├─ SeatMap (SVG interactivo)                       │
│  │   ├─ QuantityStepper                                 │
│  │   ├─ BuyerForm                                       │
│  │   ├─ CouponInput                                     │
│  │   ├─ WompiCheckout (widget oficial)                  │
│  │   └─ OrderConfirmation                               │
│  └─ Clients: SupabaseClient, WompiClient                │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS
            ┌──────────▼─────────┐    ┌───────────────────┐
            │  Supabase          │    │  Wompi Widget JS  │
            │  ─ Postgres + RLS  │◄───┤  + API + Webhooks │
            │  ─ Edge Functions  │    └───────────────────┘
            │     · create-order │
            │     · wompi-hook   │    ┌───────────────────┐
            │     · send-ticket  │───►│  Resend (email)   │
            │     · assign-attds │    │  WA Cloud API     │
            │     · validate-tkt │    └───────────────────┘
            │     · order-status │
            │  ─ Storage (PDFs)  │
            │  ─ pg_cron (clean) │
            └────────────────────┘

┌─────────────────────┐  ┌─────────────────────┐
│  scanner.html (PWA) │  │  admin.html         │
│  ─ Cámara QR        │  │  ─ Dashboard ventas │
│  ─ Modo offline     │  │  ─ Gestión cupones  │
│  ─ Service Worker   │  │  ─ Heatmap venue    │
│  ─ Manifest cache   │  │  ─ Acciones manual  │
└─────────────────────┘  └─────────────────────┘
```

### Archivos finales

```
landing-nextshow.html       ← MVP · compra (extendido del actual, ~3000 líneas)
asignar.html                ← MVP · formulario asignación de nombres
scanner.html                ← MVP · PWA puerta (~400 líneas)
scanner-manifest.json       ← MVP · PWA manifest
scanner-sw.js               ← MVP · service worker
admin.html                  ← MVP · admin desktop + mobile responsive (~2000 líneas)
politica-privacidad.html    ← MVP · Habeas Data (estática)
mi-boleta.html              ← Fase 2 · página personal del asistente
```

### Servicios externos
- Supabase (free tier inicialmente, upgrade a Pro si se necesita backup automático)
- Wompi (cuenta producción + sandbox)
- Resend (free tier 3k emails/mes)
- WhatsApp Cloud API de Meta (gratis ≤1k mensajes/mes)
- Cloudflare Turnstile (free)
- Meta Pixel + TikTok Pixel + Google Analytics 4

---

## 5. Modelo de datos

Todas las tablas con RLS habilitado. Anon key solo lee `events`, `zones`, `seats`, las views de disponibilidad, e inserta en `leads`. Todo lo transaccional pasa por Edge Functions con service role.

### `events`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| slug | text unique | `nextshow-torombolo-jair-2026` |
| name | text | "NEXT SHOW · Torombolo + Jair" |
| event_date | timestamptz | 2026-08-15 20:00 -05 |
| venue | text | "Sabanalarga" |
| total_capacity | int | 300 |
| status | text | `draft` / `selling` / `sold_out` / `closed` / `cancelled` |
| settings | jsonb | door_pin, admin_pins, refund_cutoff_days, etc. |

### `zones`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| event_id | uuid FK | |
| code | text | `risas` / `cantas` |
| name | text | |
| price_cop | int | 100000 / 150000 |
| capacity | int | 200 / 100 |
| seating_mode | text | `general` / `numbered` |

### `seats` (solo Cantas, 100 filas)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| zone_id | uuid FK | |
| row_label | text | `A`-`D` |
| seat_number | int | 1-25 |
| side | text | `izq` (1-12) / `der` (13-25) |
| UNIQUE(zone_id, row_label, seat_number) | | |

### `orders`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| order_number | text unique | `NS-2026-00042` |
| event_id, zone_id | uuid FK | |
| buyer_name, buyer_id_number, buyer_phone, buyer_email | text | |
| quantity | int | |
| subtotal_cop | int | |
| discount_cop | int | default 0 |
| total_cop | int | |
| coupon_id | uuid FK nullable | |
| referrer_id | uuid FK nullable | |
| attribution | jsonb | UTMs + IP + UA al crear |
| status | text | `pending` / `paid` / `expired` / `failed` / `refunded` / `manual_review` |
| wompi_transaction_id | text nullable | |
| wompi_reference | text unique | |
| created_at, paid_at, expires_at, refunded_at | timestamptz | |

### `tickets`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| order_id | uuid FK | |
| ticket_code | text unique | UUID corto, contenido del QR |
| seat_id | uuid FK nullable | solo Cantas |
| attendee_name, attendee_id_number | text nullable | comprador completa después |
| transferred_at, transferred_from | timestamptz, text | log de transferencias (Fase 2) |
| checked_in_at | timestamptz nullable | |
| checked_in_by | text nullable | nombre staff |
| pdf_url | text nullable | URL firmada Storage |

### `seat_holds`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| seat_id | uuid FK unique | un seat solo puede tener un hold activo |
| order_id | uuid FK | |
| expires_at | timestamptz | NOW + 10min |

### `coupons`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| code | text unique | ej `NEXT-AB7K2` |
| event_id | uuid FK | |
| discount_cop | int | |
| max_uses | int | default 1 |
| uses_count | int | default 0 |
| referrer_id | uuid FK nullable | |
| valid_from, valid_until | timestamptz | |
| status | text | `active` / `disabled` / `exhausted` |
| created_at | timestamptz | |

### `referrers`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| type | text | `lead_propio` / `influencer` / `staff` / `sponsor` / `organico` |
| name | text | |
| contact | text nullable | |
| commission_pct | numeric nullable | |
| notes | text nullable | |

### `addons` (Fase 2)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| event_id | uuid FK | |
| code, name, description | text | |
| price_cop | int | |
| max_per_order | int | |
| stock | int nullable | |

### `order_addons` (Fase 2)
| order_id, addon_id, quantity, unit_price_cop | | |

### `leads` (existente, sin cambios)

### `delivery_log`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| ticket_id | uuid FK | |
| channel | text | `email` / `whatsapp` |
| status | text | `pending` / `sent` / `failed` |
| attempts | int | |
| last_error | text nullable | |
| last_attempt_at | timestamptz | |

### `entry_attempts`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| ticket_id | uuid FK nullable | |
| ticket_code_raw | text | lo que se escaneó |
| result | text | `ok` / `already_used` / `invalid` / `unpaid` / `wrong_date` |
| forced | bool | si staff lo dejó pasar igual |
| staff_name | text | |
| created_at | timestamptz | |

### `waitlist` (Fase 2)
| event_id, zone_id, name, phone, email, created_at, notified_at | | |

### `walkup_queue` (operación día evento)
| event_id, name, id_number, phone, position, status (`waiting`/`admitted`/`left`) | | |

### `blacklist`
| event_id (nullable, null = global), id_number, phone (nullable), reason, created_by, created_at | | |

### Vistas

- `v_seat_availability(zone_id, seat_id, status: free|held|sold)` — join `seats` ⟕ `tickets` ⟕ `seat_holds` activos.
- `v_zone_availability(zone_id, capacity, sold, held, available)` — agregado por zona.
- `v_referrer_stats(referrer_id, codes_emitted, codes_used, attributed_revenue, calculated_commission)` — para admin.
- `v_coupon_funnel(coupon_id, code, emitted_at, uses, conversion_pct)` — para admin.
- `v_seat_heatmap(seat_id, sold_at, sale_order_index)` — Fase 2 para análisis.

### Tareas programadas (pg_cron)

| Frecuencia | Acción |
|---|---|
| Cada 1 min | `DELETE FROM seat_holds WHERE expires_at < now()` |
| Cada 1 min | `UPDATE orders SET status='expired' WHERE status='pending' AND expires_at < now()` |
| Cada 5 min | Retry `delivery_log` con fallos pendientes (hasta 3 intentos) |
| Cada hora (semana del evento) | Alerta admin si aforo > 90% |
| Diario | Export `tickets` + `orders` a Google Sheet (backup humano legible) |

---

## 6. Frontend — Modal de checkout

### Estructura

Modal full-screen overlay con 4 pasos. Header con stepper visual, contenido animado en transición horizontal (`transform: translateX()`), footer fijo con resumen y botón principal.

En desktop: modal centrado 720px ancho. En móvil: bottom-sheet que sube desde abajo a fullscreen.

### Paso 1 — Selección

**Cantas (mapa SVG):**
- Render 100 sillas como `<rect>` SVG, agrupadas en 4 filas de 25 con pasillo central.
- Estados visuales: `free` (violeta), `held` (gris claro pulsante), `sold` (gris oscuro tachado), `selected` (magenta con glow).
- Tooltip hover: "Fila A · Silla 7".
- Click: toggle selección. Máximo 10 sillas por orden.
- Polling cada 3s a `v_seat_availability` para refrescar estados (sin Realtime WS para reducir complejidad).
- Mobile: pinch-zoom + pan habilitados, sillas con tap target ≥40px.

**Risas (stepper de cantidad):**
- Botones `−` y `+`, valor inicial 1, mínimo 1, máximo 10.
- Barra de capacidad con `v_zone_availability`, se refresca cada 5s.

### Paso 2 — Datos del comprador

Formulario con: nombre, cédula, WhatsApp (10 dígitos, prefijo +57), email. Validación inline al `blur`.

Input de cupón con botón "Aplicar". Verifica contra `coupons` y actualiza el total del footer al instante.

Checkbox de aceptación de política de boleta personal e intransferible (link a página).

Cloudflare Turnstile invisible para anti-bot.

Al "Continuar" llama `create-order` que reserva los asientos y crea la orden. Si reserva falla por concurrencia, vuelve a Paso 1 con mapa refrescado y mensaje claro.

### Paso 3 — Pago

Resumen de la orden con desglose: items, descuentos, total. Countdown visible del lock (`expires_at - now`). Si llega a 0, vuelve a Paso 1.

Botón "Pagar con Wompi" abre el widget oficial Wompi Checkout (popup que soporta tarjeta, PSE, Nequi, Bancolombia). Al cerrar, dispara callback con resultado.

### Paso 4 — Confirmación

- `APPROVED`: muestra QR, número de orden, mensaje de envío por email/WA, botón "Asignar nombres ahora" (link a `asignar.html`).
- `PENDING` (PSE/Nequi async): spinner con polling a `get-order-status` cada 5s. Cuando webhook actualiza a `paid`, refresca a vista de éxito.
- `DECLINED`: error específico de Wompi + botón "Reintentar pago" (vuelve a Paso 3 con misma orden y mismos seats).

### Componentes JS (clases planas, sin framework)

```
class CheckoutModal     { open(zoneCode), close(), goToStep(n) }
class SeatMap           { render(seats), onSelectionChange(cb), refresh() }
class QuantityStepper   { render(max), get value() }
class BuyerForm         { validate(), getData() }
class CouponInput       { validate(code), apply() }
class WompiCheckout     { open(order), onResult(cb) }
class OrderConfirmation { render(order, tickets) }
class SupabaseClient    { query(table, filters), callFunction(name, body) }
class ToastManager      { show(msg, type) }
```

Todo inline en el `<script>` del HTML extendido. Ningún módulo ES externo más allá del widget Wompi y la lib de Turnstile.

### Sensación reactiva

- Transiciones entre pasos: `transform` + `opacity`, 250ms.
- Skeleton loaders durante carga inicial del mapa.
- Footer total con animación de tick (`scale 1.05 → 1`) al cambiar.
- Asientos seleccionados con pulso glow magenta.
- Botón principal con shake si hay errores.
- Toast notifications, cero `alert()`.
- FOMO popups esquina inferior izquierda con compras recientes (anonimizadas).
- Contador de cupos disponibles en vivo en la landing y en el modal.

---

## 7. Edge Functions (Supabase Deno)

### `create-order`
POST llamado al pasar de Paso 2 a Paso 3.

Input: `{ zone_code, seat_ids[], quantity, buyer{}, coupon_code?, attribution{} }`

Lógica transaccional:
1. Validar zone y disponibilidad.
2. Validar cupón (existe, activo, dentro de ventana, no agotado).
3. Crear `seat_holds` con `INSERT ... ON CONFLICT DO NOTHING`. Si filas insertadas < esperadas → 409 SEATS_TAKEN con `unavailable_seat_ids[]`.
4. Calcular total con descuento.
5. Generar `order_number` legible secuencial.
6. Generar `wompi_reference` único.
7. Insertar en `orders` status `pending`, `expires_at = now() + 10min`.
8. Devolver `{ order_id, wompi_reference, total_cop, expires_at, public_key }`.

Errores: 409 SEATS_TAKEN, 409 SOLD_OUT, 400 INVALID_COUPON, 400 VALIDATION, 429 RATE_LIMIT.

### `wompi-webhook`
POST recibido desde Wompi en cada cambio de estado.

1. Verificar firma HMAC SHA-256 con `Events Secret`. Inválida → 401.
2. Idempotencia: buscar `wompi_transaction_id` ya procesado → 200 sin acción.
3. Buscar order por `wompi_reference`.
4. Switch event:
   - `APPROVED`: `UPDATE orders` a `paid`, crear N filas en `tickets` con `ticket_code` UUID corto, `DELETE seat_holds` de la orden, incrementar `coupons.uses_count`, marcar `exhausted` si llega al tope, invocar `send-ticket` async.
   - `DECLINED` / `VOIDED` / `ERROR`: `UPDATE orders` a `failed`, `DELETE seat_holds`.
5. Caso raro: orden ya `expired` y llega `APPROVED` → intentar re-reservar asientos. Si libres, asignar y emitir. Si tomados, marcar `manual_review`, alertar admin, refund automático Wompi API.
6. Devolver 200.

### `send-ticket`
Invocada desde `wompi-webhook` post `APPROVED`. Por cada ticket:
1. Generar QR (PNG base64) con payload URL `https://nextshow.co/v?t=<ticket_code>`.
2. Generar PDF con plantilla NEXT SHOW: logo, evento, fecha, lugar, zona + asiento o número de boleta, nombre comprador, QR grande, watermark diagonal con nombre, política.
3. Subir PDF a Supabase Storage bucket `tickets`, generar URL firmada (7 días).
4. Enviar email (Resend) con template HTML, QR inline, link al PDF, link "asignar nombres", `.ics` adjunto.
5. Enviar WhatsApp (Meta Cloud API) con template aprobado y link al PDF.
6. Loggear en `delivery_log`. Retry 3× si falla. Si 3 fallos, alertar admin.

### `assign-attendees`
POST desde `asignar.html`. Input: `{ order_id, signed_token, attendees[] }`.

1. Verificar `signed_token` (HMAC del order_id + secret).
2. UPDATE `tickets.attendee_name`, `attendee_id_number`.
3. Opcional: regenerar PDF con nombre actualizado.

### `validate-ticket`
POST desde scanner. Input: `{ ticket_code, staff_name }`.

Transacción atómica con `SELECT ... FOR UPDATE`:
1. Buscar ticket por `ticket_code`.
2. Si no existe → `INVALID`.
3. Si `checked_in_at` no null → `ALREADY_USED` con timestamp + staff anterior.
4. Si orden no `paid` → `UNPAID`.
5. Si event_date no es hoy → `WRONG_DATE`.
6. UPDATE `checked_in_at = now(), checked_in_by = staff_name`.
7. Devolver `OK` con `{ attendee_name, zone, seat_label, order_number }`.

Loggear en `entry_attempts` (incluso fallos).

### `get-order-status`
GET para polling del Paso 4 cuando pago está PENDING. Devuelve `{ status, tickets[] }`.

### `scanner-manifest`
GET autenticado con door_pin. Devuelve array de tickets `paid` del evento para uso offline del scanner. Refresca cada 5min en cliente.

### `generate-wallet-pass`
GET autenticado con `signed_token` del ticket. Devuelve `.pkpass` (Apple) o link a `Google Wallet save`. Genera pase con QR + datos del evento + branding NEXT SHOW. Llamado desde la confirmación post-pago y desde `mi-boleta.html`.

### `admin-auth`
POST PIN admin → genera código OTP de 6 dígitos, lo manda por WA al admin, devuelve session token al verificar. JWT 8h.

### `refund-order` (Fase 2)
POST desde admin o desde página personal del asistente. Verifica cutoff (7 días antes), llama Wompi refund API, marca `refunded`, libera asientos, notifica.

### `transfer-ticket` (Fase 2)
POST desde página personal. Cambia `attendee_name` y `attendee_id_number`, incrementa contador, log auditoría, regenera PDF.

### `notify-waitlist` (Fase 2)
Trigger al liberarse asiento por refund. Notifica primer en `waitlist` con link de compra prioritaria 30min.

### Variables de entorno

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
WOMPI_PUBLIC_KEY
WOMPI_PRIVATE_KEY
WOMPI_EVENTS_SECRET
WOMPI_INTEGRITY_SECRET
RESEND_API_KEY
RESEND_FROM_EMAIL
WA_CLOUD_TOKEN
WA_PHONE_NUMBER_ID
WA_TEMPLATE_TICKET
WA_TEMPLATE_REMINDER_7D
WA_TEMPLATE_REMINDER_1D
WA_TEMPLATE_REMINDER_2H
TICKET_SIGNING_SECRET
ASSIGN_SIGNING_SECRET
APP_BASE_URL
ADMIN_ALERT_EMAIL
ADMIN_ALERT_WA
TURNSTILE_SECRET
META_PIXEL_ID
TIKTOK_PIXEL_ID
GA4_MEASUREMENT_ID
```

---

## 8. Scanner PWA (`scanner.html`)

### Comportamiento como app

- `manifest.json` define ícono NEXT SHOW (negro/violeta), tema, modo `standalone`.
- Service worker (`scanner-sw.js`) cachea HTML/CSS/JS y manifest de boletas para arranque offline.
- Primera visita: navegador ofrece "Agregar a pantalla de inicio". Indistinguible de app nativa al abrir.
- iOS y Android compatibles (iOS con limitaciones menores en push).

### Login

- PIN de 4 dígitos generado por evento (config en `events.settings.door_pin`).
- Selección de nombre staff desde lista predefinida en `events.settings.staff_names[]` (admin la edita desde admin panel antes del evento). El nombre elegido queda en JWT local 24h y se loggea en cada `validate-ticket` como `staff_name`.
- Sin usuarios ni contraseñas: simplifica operación con staff temporal.

### Pantalla principal

- Cámara live preview con `BarcodeDetector` API (Chrome móvil), fallback a `jsQR` (~50KB).
- Detección de QR → lee `ticket_code` de la URL → POST a `validate-ticket`.
- Stats abajo: válidos hoy, rechazados.

### Pantalla de resultado

- **OK** (verde, vibración 200ms): nombre, cédula, zona + asiento, número de orden, botón "Siguiente".
- **ALREADY_USED** (rojo, vibración 3×200ms): hora previa + staff previo, opción "permitir igual" registrada en `entry_attempts.forced=true`.
- **INVALID / UNPAID / WRONG_DATE**: mensaje específico.

### Modo offline

- Al login, scanner descarga **manifest de boletas**: JSON con array de `{ ticket_code, attendee_name, zone, seat_label, order_number, status }` para todas las tickets `paid` del evento. Endpoint: GET `/functions/v1/scanner-manifest` (autenticado con door_pin). Tamaño ~30KB para 300 boletas.
- Service worker cachea el manifest. Refresco cada 5min cuando online.
- Validación local primero (existe en manifest, no marcado en cola local + no `checked_in_at` en manifest).
- Push al servidor en background al `validate-ticket`. Si offline, queue en `localStorage` con marca `pending_sync`.
- Al recuperar conexión, sincroniza queue. Si servidor responde `ALREADY_USED` (otra puerta lo marcó offline también), alerta al staff con detalles para reconciliar.

### Modo admin (`scanner.html?admin=1`)

PIN admin separado. Vista con stats en vivo, últimos 20 escaneos, búsqueda por nombre/cédula/orden, acción "marcar manual" para QRs dañados.

---

## 9. Admin panel (`admin.html`)

### Auth

- PIN admin de 6 dígitos + segundo factor: código one-time por WhatsApp.
- Sesión 8h.
- Solo 2-3 PINs admin con logs de auditoría.

### Vistas desde PC

- Dashboard ventas en vivo: $ recaudado, boletas vendidas por zona, gráfico aforo, % conversión.
- Tabla de órdenes filtrable por status, fecha, zona, cupón, referrer.
- Buscador rápido (cédula, nombre, orden #, teléfono).
- Gestión cupones: crear/editar/desactivar, ver uso por código.
- Gestión referrers: agregar, asignar comisión, ver atribución.
- Exportar CSV: lista asistentes, conciliación contable, comisiones a pagar.
- Logs `delivery_log`: emails/WA fallidos, reintentar manual.
- Acciones: refund (libera asientos), regenerar PDF, reenviar boleta.
- Heatmap del venue (Fase 2).
- Reporte post-evento PDF (Fase 2).

### Vistas desde móvil en el evento

- Layout responsive: tarjetas grandes apiladas, action sheets bottom-sheet.
- Vista "puerta en vivo": mapa Cantas con sillas que cambian de color según check-in (verde = entró, gris = no llegó).
- Velocidad de ingreso (personas/min), ETA último ingreso.
- Alerta si fila acumula >50 personas en una puerta.
- Botón emergencia evacuación: muestra lista total + planos.
- Lista impresa de respaldo: PDF A4 alfabético con cédula y zona.

### Stack

- Single-file `admin.html` con clases JS planas.
- Cliente Supabase con anon key + JWT admin (RLS distintas).
- Charts con Chart.js CDN.
- Tabla virtualizada para escalar.

---

## 10. Errores y edge cases

### Race conditions

| Escenario | Mitigación |
|---|---|
| 2 compradores eligen misma silla | `INSERT ... ON CONFLICT DO NOTHING` + verificar count → segundo recibe 409 |
| Comprador deja Paso 3 abierto sin pagar | Hold expira 10min, pg_cron limpia |
| Wompi confirma después de expirar hold | Re-reservar si libres, sino `manual_review` + refund automático |
| Webhook Wompi duplicado | UNIQUE en `wompi_transaction_id` |
| Webhook nunca llega | Frontend polling + acción manual admin |
| Comprador cierra navegador post-pago | Email/WA llegan igual |

### Errores de pago

- Tarjeta declinada → mensaje exacto + reintentar sin perder seats
- PSE falla → reintento conservando seats
- Nequi >10min pendiente → spinner explicativo, eventual `failed` libera seats
- Cobro doble → detectar y refund automático segundo + alerta

### Errores de entrega

- Email rebotado → log + retry 3× → alerta + WA fallback
- WhatsApp rechazado → log + email fallback
- PDF generation falla → retry 3× → marca `delivery_pending`, no rompe pago

### Edge cases venue

- Internet caído → scanner offline con manifest cacheado
- Doble check-in entre puertas offline → alerta al sincronizar
- Comprador sin celular → admin busca por cédula y check-in manual
- QR perdido → reenvío desde `mi-boleta?cc=<cedula>`
- Cancelación evento → botón admin → refund batch + notificación masiva
- Postergación → botón admin → cambio fecha + WA masivo con opción refund

### Validaciones

- Cédula: 6-12 dígitos
- Celular: 10 dígitos exactos, prefijo `3`
- Email: regex estricto
- Cantidad: 1-10
- Cupón: alphanumeric, max 20, uppercase
- Cero `alert()`, todo toast/inline

---

## 11. Testing

### Unit (Vitest)
- Validaciones input
- Cálculo total con cupón
- Generación `order_number` secuencial
- Verificación HMAC webhook

### Integration (Vitest + Supabase local)
- Race condition: 10 procesos pidiendo misma silla → solo 1 gana
- Webhook idempotente: mismo POST 5× → 1 sola creación
- Hold expira → libera correctamente
- Cupón se agota al `max_uses`

### E2E (Playwright)
- Compra Risas exitosa con sandbox Wompi
- Compra Cantas con selección
- Compra falla y reintenta sin perder seats
- Refund admin libera asientos
- Scanner valida + rechaza + already_used
- PWA install + modo offline

### Carga
- 50 compras simultáneas Cantas → 0 sillas duplicadas
- 100 escaneos/min en scanner

### Pre-evento dry run
- 1 semana antes: simulacro completo con 5 boletas reales del staff. Pago real, escaneo real, todo el flujo end-to-end.

---

## 12. Monitoreo

- Edge Functions logs en Supabase Dashboard
- Sentry para errores frontend + edge functions
- Alertas WA al admin si:
  - Webhook Wompi falla 3× seguido
  - Aforo >90%
  - >5 órdenes `failed` en 10min
  - >10 boletas `delivery_pending`
  - Día evento: scanner reporta error de sync

### Backups

- Supabase backup automático diario (Pro plan)
- Edge Function diaria: export `tickets` + `orders` a Google Sheet (legible humano)
- Día evento: snapshot manual antes de abrir puertas

---

## 13. Configuración inicial requerida

Antes de implementar, el usuario debe proveer o decidir:

1. **Wompi**: crear cuenta merchant, obtener `PUBLIC_KEY`, `PRIVATE_KEY`, `EVENTS_SECRET`, `INTEGRITY_SECRET`. URL de webhook: `https://<supabase-url>/functions/v1/wompi-webhook`.
2. **Supabase**: crear proyecto, habilitar Storage, Edge Functions, pg_cron.
3. **Resend**: cuenta + dominio verificado para `noreply@nextshow.co` (o el dominio elegido).
4. **WhatsApp Cloud API**: cuenta Meta Business, número verificado, templates aprobados (ticket, recordatorios, transferencia, refund, cancelación).
5. **Cloudflare Turnstile**: site key + secret.
6. **Dominio definitivo**: `nextshow.co` u otro. Hosting (Netlify/Vercel/Cloudflare Pages para los HTML).
7. **Pixels**: IDs de Meta, TikTok, GA4.
8. **Datos del evento**: PINs de puerta y admin, nombres de staff de puerta, cantidad de PINs admin.
9. **Cupones iniciales**: lista de embajadores y staff con cupones a generar manualmente al lanzar.
10. **Templates de WhatsApp**: textos exactos para aprobación de Meta (24-48h de revisión).

---

## 14. Próximo paso

Invocar `superpowers:writing-plans` para descomponer este diseño en un plan de implementación con fases, dependencias, estimaciones y orden de ejecución.

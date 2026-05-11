# NEXT SHOW · Plataforma de Venta + Ingreso de Boletas

Plataforma completa para el evento **NEXT SHOW · Toromobolo Welc'h + Jair Luquez** (Sabanalarga, 2026-08-15, 300 cupos).

## Stack

- **Frontend:** HTML5 + ES2024 vanilla (sin framework, sin build), View Transitions API, SVG inline, PWA
- **Backend:** Supabase (Postgres 15 + RLS + Edge Functions Deno + Storage + Realtime + pg_cron)
- **Pagos:** Wompi (sandbox en dev, prod tras aprobación merchant)
- **Email:** Resend (mock en dev)
- **WhatsApp:** Meta Cloud API (mock en dev)
- **Wallet:** Apple PassKit + Google Wallet (stubs hasta certs)
- **Anti-bot:** Cloudflare Turnstile
- **Hosting:** Netlify
- **Scanner puerta:** PWA con BarcodeDetector + jsQR fallback, modo offline
- **Admin:** dashboard responsive PC + móvil con Chart.js

## Quickstart local

```bash
# 1. Instalar deps
npm install

# 2. Levantar Supabase local
supabase start

# 3. Copiar env y completar con valores de `supabase status`
cp .env.example .env.local
supabase status -o env >> .env.local

# 4. Levantar Edge Functions
npm run supabase:functions

# 5. En otra terminal, servir estáticos
npm run dev

# 6. Abrir
open http://localhost:8000
```

## Páginas

| URL | Descripción |
|-----|-------------|
| `/` | Landing + checkout modal |
| `/asignar.html?o=<order_id>&token=<sig>` | Asignación de nombres a boletas |
| `/scanner.html` | PWA validación en puerta |
| `/admin.html` | Panel administración |
| `/mi-boleta.html` | Portal personal (Fase 2) |
| `/politica-privacidad.html` | Habeas Data Colombia |

## Estructura

```
public/                 ← static, deploy target Netlify
supabase/migrations/    ← schema (5 migraciones SQL)
supabase/functions/     ← Edge Functions Deno
tests/                  ← unit + integration + e2e
docs/superpowers/       ← spec + implementation plan
```

## Deploy a producción (cuando estén las credenciales)

1. Crear proyecto Supabase remoto, conectar: `supabase link --project-ref <ref>`
2. Push migraciones: `supabase db push`
3. Set secrets: `supabase secrets set --env-file .env.production`
4. Deploy functions: `supabase functions deploy`
5. Configurar webhook Wompi → URL de `wompi-webhook` en producción
6. Crear sitio Netlify, conectar repo GitHub, deploy automático en `main`
7. DNS: apuntar dominio a Netlify

## Documentación

- **Spec aprobada:** [`docs/superpowers/specs/2026-05-10-nextshow-checkout-design.md`](docs/superpowers/specs/2026-05-10-nextshow-checkout-design.md)
- **Plan de implementación:** [`docs/superpowers/plans/2026-05-10-nextshow-implementation.md`](docs/superpowers/plans/2026-05-10-nextshow-implementation.md)

## Licencia

Privado. © Nexo Productions / NEXT SHOW.

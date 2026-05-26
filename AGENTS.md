# AGENTS.md — Reglas para Claude Code, Codex, Cursor y demás agentes IA

Este archivo lo lee cualquier agente IA al abrir el repo. **Síguelo siempre antes de proponer cambios.** Si vas a romper una regla, avísale al humano primero.

---

## 1. Contexto del proyecto

- **Nombre:** Invitaciones Next Show (landing + generador de tarjetas para el show).
- **Repo oficial:** `Juanse99-ai/Invitaciones-Next-Show` (este).
- **Deploy:** Netlify amarrado a la rama `main`. Cada merge a `main` dispara build automático.
- **Stack:** HTML + JS vanilla + Supabase. **No hay build step.** Editas el HTML/JS y se sirve tal cual.
- **Dueños / colaboradores activos:**
  - Juanse (`Juanse99-ai`) — owner del repo.
  - Fernando (`fernamoreno10-cyber`) — collaborator, socio NEXT SHOW.

## 2. Archivos clave

| Archivo | Para qué sirve |
|---------|----------------|
| `index.html` | Landing principal (lo que ve el usuario al entrar). |
| `generador.html` | Herramienta interna para generar tarjetas/invitaciones. |
| `tarjeta.html` | Plantilla de la invitación individual. |
| `invitados.json` | Base de datos de invitados (225+ registros). |
| `links.csv` | Exportación de links/UTMs. |
| `_redirects` | Reglas de Netlify (rutas, redirecciones). |
| `assets/` | Imágenes, videos de fondo, fuentes. |
| `public/`, `docs/`, `supabase/`, `tests/` | Recursos auxiliares. |

**No tocar sin avisar:** `invitados.json` (data en vivo), `_redirects` (puede romper enlaces compartidos en WhatsApp).

## 3. Flujo de trabajo (OBLIGATORIO)

> Regla de oro: **nunca commit directo a `main`**. Siempre rama + PR.

### Antes de empezar cualquier cambio

```bash
git checkout main
git pull origin main
```

### Para cada tarea

```bash
# 1. Crear rama desde main
git checkout -b feat/descripcion-corta

# 2. Editar archivos, probar local (abrir index.html en navegador)

# 3. Commit (mensaje en español, estilo conventional)
git add archivo1 archivo2
git commit -m "feat: descripción del cambio"

# 4. Push de la rama
git push -u origin feat/descripcion-corta

# 5. Abrir PR en GitHub apuntando a main
gh pr create --title "feat: ..." --body "..."

# 6. Esperar review del otro colaborador antes de merge
```

### Después del merge a `main`

- Netlify deploya en ~1-2 min.
- Verificar el sitio vivo.
- Si algo rompe, abrir PR de hotfix inmediato: `fix/...`

## 4. Convención de ramas

| Prefijo | Cuándo usar |
|---------|-------------|
| `feat/` | Funcionalidad nueva. |
| `fix/` | Corrige bug. |
| `docs/` | Solo documentación. |
| `refactor/` | Limpieza sin cambio funcional. |
| `chore/` | Configuración, deps, build. |
| `backup/` | Snapshots / trabajo en pausa. |

Nombre corto en kebab-case: `feat/precio-cantas`, `fix/whatsapp-link-prefix`.

## 5. Convención de commits

Formato: `tipo(scope opcional): descripción corta en español`.

Ejemplos reales del repo:
- `feat: switch sales mode to WhatsApp + wire Supabase prod`
- `fix(landing): footer WhatsApp link usar # real 573106619353`
- `docs(plan): landing rebuild implementation plan`

**Reglas:**
- En español o inglés, sé consistente con commits previos.
- Máximo ~72 chars la primera línea.
- Cuerpo opcional explicando el porqué.
- Si un agente IA generó el commit, incluir co-author:
  ```
  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  ```

## 6. Reglas para agentes IA

### ✅ Hacer

- Leer este archivo **antes** de tocar nada.
- Inspeccionar archivos relacionados antes de editar (`Read` antes que `Write`).
- Crear rama nueva antes de cambios.
- Mostrar diff resumido al humano antes de commit.
- Preguntar si el cambio puede romper deploy.
- Respetar estructura HTML/JS existente (no introducir frameworks nuevos sin aprobación).

### ❌ No hacer

- **Nunca** commit directo a `main`.
- **Nunca** `git push --force` a `main` o ramas compartidas.
- **Nunca** borrar `invitados.json`, `_redirects` o archivos en `assets/` sin confirmar.
- **Nunca** instalar build tools (Vite, Webpack, etc.) — stack es vanilla a propósito.
- **Nunca** subir `.env.local`, credenciales, ni archivos `>20MB` (videos, .mov).
- **Nunca** alterar el `.gitignore` para incluir cosas pesadas.

## 7. Ramas especiales existentes

| Rama | Contenido |
|------|-----------|
| `main` | Sitio en vivo en Netlify. |
| `backup/local-pre-juanse` | Trabajo previo de Fernando antes de unificar repos: landing rebuild plan, switch a WhatsApp, UTM preserve, fix scanner SW. Útil si se quiere recuperar features. **No mergear directo** — cherry-pick lo que sirva. |

## 8. Variables de entorno

`.env.local` existe local pero **no se commitea**. Si Supabase u otra integración requiere keys nuevas, documentar el nombre de la variable en este archivo (no el valor) y avisar al otro colaborador.

Variables esperadas:
- `SUPABASE_URL` (pendiente confirmar nombre exacto)
- `SUPABASE_ANON_KEY` (pendiente confirmar nombre exacto)

## 9. Testing antes de merge

No hay CI configurado todavía. Verificación manual:
1. Abrir `index.html` en navegador local.
2. Probar flujo WhatsApp (clic en botón principal).
3. Si tocaste `generador.html`: generar una tarjeta de prueba.
4. Si tocaste `tarjeta.html`: revisar una invitación existente con su slug.
5. Probar en móvil (Chrome DevTools responsive).

## 10. Contacto

Si un agente IA detecta ambigüedad o conflicto entre lo que pide el humano y este archivo: **preguntar al humano**, no asumir. El humano siempre gana.

---

*Última actualización: 2026-05-26*

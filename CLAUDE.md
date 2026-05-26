# CLAUDE.md

Claude Code: lee primero **[AGENTS.md](./AGENTS.md)** — contiene todas las reglas del proyecto, flujo de git, convenciones de commits/ramas, y restricciones.

Las reglas son las mismas para cualquier agente IA. Mantener un solo archivo de verdad (`AGENTS.md`) evita que se desincronicen.

## Resumen ultra-corto

- **Nunca** commit directo a `main`. Siempre `feat/`, `fix/`, etc. + PR.
- Netlify deploya automático cuando se mergea a `main`.
- Stack vanilla (HTML+JS+Supabase), sin build.
- Repo compartido entre Juanse (owner) y Fernando (collaborator).

Detalles completos → `AGENTS.md`.

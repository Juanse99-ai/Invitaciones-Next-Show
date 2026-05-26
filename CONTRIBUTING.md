# Cómo colaborar

Guía rápida para humanos. Si usas un agente IA (Claude Code, Codex, Cursor), revisa también [AGENTS.md](./AGENTS.md).

## Setup inicial (una sola vez)

```bash
# Clonar
git clone https://github.com/Juanse99-ai/Invitaciones-Next-Show.git
cd Invitaciones-Next-Show

# Verificar remote
git remote -v
# Debe mostrar: origin → https://github.com/Juanse99-ai/Invitaciones-Next-Show.git
```

## Flujo diario

### 1. Sincronizar antes de empezar

```bash
git checkout main
git pull origin main
```

### 2. Crear rama para tu cambio

```bash
git checkout -b feat/lo-que-vas-a-hacer
```

Prefijos: `feat/`, `fix/`, `docs/`, `refactor/`, `chore/`.

### 3. Editar y commit

```bash
git add archivo.html
git commit -m "feat: descripción corta del cambio"
```

### 4. Subir rama y abrir PR

```bash
git push -u origin feat/lo-que-vas-a-hacer
```

Luego en GitHub → "Compare & pull request" → describe el cambio → solicita review.

### 5. Después del merge

Netlify deploya en ~1-2 min automáticamente. Verifica el sitio.

## Reglas duras

- **Nunca push directo a `main`.** Siempre PR.
- **Nunca `force push`** a ramas compartidas.
- **Nunca subas** `.env.local`, videos `.mov`, carpetas de descarga, ni binarios pesados.
- **Avisa al otro** antes de tocar `invitados.json` o `_redirects`.

## Stack

- HTML + JS vanilla (sin frameworks, sin build).
- Supabase para datos.
- Netlify para hosting.

Para detalles técnicos, archivos clave, y reglas para agentes IA → [AGENTS.md](./AGENTS.md).

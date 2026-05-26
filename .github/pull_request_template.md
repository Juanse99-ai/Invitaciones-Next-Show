## Qué cambia

<!-- 1-3 bullets describiendo el cambio en lenguaje claro -->
- 
- 

## Por qué

<!-- Contexto: qué problema resuelve, qué pidió el cliente, qué bug corrige -->


## Tipo de cambio

- [ ] `feat` — funcionalidad nueva
- [ ] `fix` — corrige bug
- [ ] `docs` — solo documentación
- [ ] `refactor` — limpieza sin cambio funcional
- [ ] `chore` — config / deps / tooling
- [ ] `style` — formato, CSS, no afecta lógica

## Archivos clave afectados

<!-- Marcar si tocaste alguno de estos (requieren cuidado extra) -->
- [ ] `index.html` (landing)
- [ ] `generador.html` (admin tarjetas)
- [ ] `tarjeta.html` (plantilla invitación)
- [ ] `invitados.json` (data en vivo — coordinar con el otro colaborador)
- [ ] `_redirects` (puede romper links compartidos en WhatsApp)
- [ ] `assets/` (imágenes, videos, fuentes)
- [ ] Otro: 

## Test plan

<!-- Cómo verificaste que funciona. Marcar lo que aplique. -->
- [ ] Abrí `index.html` en navegador, flujo principal OK
- [ ] Probé en móvil (DevTools responsive)
- [ ] Probé botón WhatsApp
- [ ] Si tocó `generador.html`: generé tarjeta de prueba
- [ ] Si tocó `tarjeta.html`: revisé invitación con slug existente
- [ ] No se introdujeron secrets / .env en el diff

## Riesgo de deploy

- [ ] **Bajo** — solo docs / assets aislados
- [ ] **Medio** — cambio funcional en una página
- [ ] **Alto** — toca `_redirects`, `invitados.json` o estructura compartida

## Capturas / video (opcional)

<!-- Pega screenshots o GIFs si es cambio visual -->


## Checklist antes de mergear

- [ ] Branche actualizada con `main` (sin conflictos)
- [ ] Commits con prefijo correcto (`feat:`, `fix:`, etc.)
- [ ] Sin archivos `>20MB` ni secrets en el diff
- [ ] El otro colaborador revisó / aprobó

---

<!-- 
Recuerda: Netlify deploya automático cuando esto se mergea a main.
Si rompes algo, abre PR de hotfix inmediato (fix/...). 
-->

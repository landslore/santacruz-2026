# AGENTS.md — Guía Agéntica de Arquitectura y Mantenimiento (`Santa Cruz 2026`)

Este documento contiene todo el contexto técnico, ingeniería inversa de Futbuteo, arquitectura SPA y flujos de despliegue para mantener e iterar autónomamente el proyecto **Santa Cruz 2026**.

---

## 1. Contexto y Objetivos del Proyecto

- **Propósito**: Web interactiva (SPA) responsive para el seguimiento en tiempo real de la liga de fútbol base del **Santa Cruz C.F.** en **Prebenjamín - Primera Futgal (A Coruña · G1)**, Temporada 2026-2027.
- **Deporte**: Fútbol 8 (Prebenjamín)
- **Equipo destacado**: `Santa Cruz C.F.` (`id: 19230216`)
- **Grupo**: A Coruña · Grupo 1 (14 equipos, 26 jornadas de 7 partidos cada una = 182 partidos en total).
- **Fuente de datos**: `https://futbuteo.com/galicia/resultados/prebenjamin-primera-futgal/a-coruna-g1/?j=1`
- **Comportamiento por defecto**:
  - Abre en la sección **⚽ Resultados**, posicionado en la siguiente jornada a disputar (`jornadaActual`, calculada automáticamente).
  - Al hacer clic sobre cualquier equipo de la liga (en resultados, clasificación, estadísticas o selector) se abre su calendario completo con partidos jugados y pendientes.
  - El botón superior **⭐ Santa Cruz C.F.** abre su calendario directo en un solo clic.
- **Menú superior optimizado en 2 filas**:
  - Fila 1: `⚽ Resultados` + `🏆 Clasificación` + `📊 Estadísticas` (grid de 3 columnas de 33.3%, 0 desbordamiento horizontal en móvil).
  - Fila 2: `⭐ Santa Cruz C.F.` + `🔄 Actualizar`.

---

## 2. Ingeniería Inversa de Futbuteo

### 2.1. Desafío Anti-bot (`fbv.php`)
Futbuteo protege el tráfico con un challenge JavaScript:
```javascript
var k = "...", v = 7;
for (var i = 0; i < 32; i++) v = (v * 31 + k.charCodeAt(i)) % 1000003;
// GET /fbv.php?k=...&n=... -> HTTP 204 con Set-Cookie: fbv=... (validez 7 días)
```
En [`scripts/update-data.mjs`](file:///Users/israelvinualeslopez/sources/santacruz-2026/scripts/update-data.mjs), la función `solveChallengeAndFetchHtml` resuelve este desafío en < 300 ms en Node.js sin navegador externo.

### 2.2. Extracción de Datos
1. **`window.RV_CARA`**:
   - Inyectado en el HTML.
   - `RV_CARA.partidos`: Array con los 182 partidos (26 jornadas × 7 partidos/jornada).
   - `RV_CARA.equipos`: Array con los 14 equipos, posición y forma.
2. **Tabla de clasificación oficial**:
   - Parseada de `table.standings-table` (`Pos, Equipo, Pts, PJ, PG, PE, PP, GF, GC, Dif`).
3. **Escudos**:
   - `https://www.futbuteo.com/escudos/80/gal-{idEquipo}.webp`.
   - Santa Cruz C.F.: `gal-19230216.webp`.

---

## 3. Estructura del Repositorio

```text
/Users/israelvinualeslopez/sources/santacruz-2026/
├── AGENTS.md                  # Manual agéntico de mantenimiento
├── plan.md                    # Historial y seguimiento de fases
├── Código.js                  # Backend Google Apps Script (scraper en vivo para 'Actualizar aquí y ahora')
├── appsscript.json            # Configuración y permisos OAuth de Apps Script
├── .claspignore               # Reglas de subida de clasp
├── scripts/
│   └── update-data.mjs        # Scraper autónomo de Futbuteo -> docs/data.json
├── docs/                      # Carpeta publicada en GitHub Pages
│   ├── index.html             # Frontend SPA responsive con fallback híbrido
│   ├── 404.html               # Redirección SPA
│   ├── data.json              # Snapshot precalculado de la liga
│   └── .nojekyll              # Evita que Jekyll interfiera en GitHub Pages
└── .github/
    └── workflows/
        └── pages.yml          # GitHub Action que actualiza datos cada 6 horas
```

---

## 4. Arquitectura Híbrida de Refresco (A + B)

1. **Capa 1 — Caché local (`localStorage` — 48 horas)**: En aperturas normales la web abre al instante (0 ms).
2. **Capa 2 — Snapshot estático (`docs/data.json` en GitHub Pages)**: Refrescado automáticamente cada 6 horas por GitHub Actions.
3. **Capa 3 — En vivo 'Aquí y Ahora' (`🔄 Actualizar`)**:
   - Al pulsar `🔄 Actualizar`, el frontend invoca en vivo la API Web App de Google Apps Script (`Código.js`).
   - Resuelve el challenge de Futbuteo en 1 segundo y devuelve la última información disponible con CORS abierto.
   - Si la API tardase o estuviera inaccesible, realiza un fallback transparente automático a `./data.json?_t=Date.now()`.

---

## 5. Runbook de Despliegue para Agentes

Cada vez que se modifiquen los scripts o la interfaz, seguir estos pasos:

### Paso 1: Regenerar los datos locales
```bash
node scripts/update-data.mjs
```

### Paso 2: Desplegar cambios en Google Apps Script
```bash
clasp push -f
clasp deploy -i AKfycbwqCjRxCHtbt41eMDFuzIi23N7Z72LADEYZmx-pLLz5Q3y0XhL0tPSTCYyuMvvpTKua4g -d "Descripción de la versión"
```

### Paso 3: Publicar cambios en GitHub
```bash
git add .
git commit --no-gpg-sign -m "feat: descripción de los cambios"
git push origin main
```
GitHub Pages publica automáticamente `/docs` en `https://landslore.github.io/santacruz-2026/`.


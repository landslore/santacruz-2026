# Plan de Desarrollo — Santa Cruz 2026 (`santacruz-2026`)

Web interactiva SPA responsive para el seguimiento de la liga del **Santa Cruz C.F.** en **Prebenjamín - Primera Futgal (A Coruña · G1)**, Temporada 2026-2027, con datos sincronizados automáticamente desde **Futbuteo**.

---

## 1. Contexto y Objetivos

- **Competición**: Prebenjamín - Primera Futgal (Federación Gallega de Fútbol / Futbuteo)
- **Grupo**: A Coruña · Grupo 1 (14 equipos, 26 jornadas, 182 partidos en total)
- **Equipo a destacar**: `Santa Cruz C.F.` (`id: 19230216`)
- **Fuente de datos**: `https://futbuteo.com/galicia/resultados/prebenjamin-primera-futgal/a-coruna-g1/?j=1`
- **Hosting y despliegue**: GitHub Pages gratuito (`https://landslore.github.io/santacruz-2026/`)
- **Actualización automática**: GitHub Actions ejecutado periódicamente cada 6 horas y botón en vivo `🔄 Actualizar`.

---

## 2. Hallazgos de Ingeniería Inversa en Futbuteo

1. **Anti-bot Challenge Solver (`fbv.php`)**:
   - Futbuteo protege las peticiones directas con una verificación JS que calcula `v = (v*31 + k.charCodeAt(i)) % 1000003` para un hash `k` de 32 caracteres y hace `GET /fbv.php?k=...&n=...`.
   - Se resuelve automáticamente en Node.js en < 300 ms obteniendo la cookie `fbv` (validez de 7 días).
2. **Objeto de datos global `window.RV_CARA`**:
   - Inyectado directamente en el HTML de la página.
   - `RV_CARA.partidos`: Array con los 182 partidos de las 26 jornadas con fecha, hora, campo, estado (`pasado: true/false`) y marcador.
   - `RV_CARA.equipos`: Array con los 14 equipos, posición, forma y goles por partido.
3. **Escudos**:
   - CDN universal: `https://www.futbuteo.com/escudos/80/gal-{idEquipo}.webp`.
   - Santa Cruz C.F.: `https://www.futbuteo.com/escudos/80/gal-19230216.webp`.
4. **Tabla oficial**:
   - `table.standings-table` con Posición, Equipo, Puntos, PJ, PG, PE, PP, GF, GC, Diferencia y Forma.

---

## 3. Fases de Ejecución

- [x] **Fase 1: Scraper y Normalizador (`scripts/update-data.mjs`)**
  - Implementar la función de bypass del challenge `fbv` en Node.js puro. ✅ *Completado*.
  - Descargar la página oficial y parsear `window.RV_CARA` y la tabla de clasificación. ✅ *Completado*.
  - Normalizar partidos, equipos, jornada actual y estadísticas en `docs/data.json` (182 partidos de las 26 jornadas, 14 equipos). ✅ *Completado*.
  - Generar el snapshot inicial de datos. ✅ *Completado*.

- [x] **Fase 2: Frontend SPA (`docs/index.html`)**
  - Maquetación adaptativa y responsive comprobada en dispositivos móviles (360x800, cero scroll horizontal). ✅ *Completado*.
  - **Menú superior en 2 filas**:
    - Fila 1: `⚽ Resultados` + `🏆 Clasificación` + `📊 Estadísticas` (grid de 3 columnas de 33.3%).
    - Fila 2: `⭐ Santa Cruz C.F.` (acceso directo a su calendario) + `🔄 Actualizar`. ✅ *Completado*.
  - **Sección Resultados**: Selector de jornadas 1 a 26 posicionado en la siguiente jornada a disputar (Jornada 4); tarjetas de partido en 2 filas con escudo oficial, nombre, marcador y enlace a Google Maps del campo. ✅ *Completado*.
  - **Sección Clasificación**: Tabla con Santa Cruz C.F. resaltado en dorado en 2ª posición; clic en cualquier equipo abre su calendario. ✅ *Completado*.
  - **Sección Estadísticas**: KPIs (3.05 goles/partido, % local/visitante, mayor goleada 0-4 de Santa Cruz C.F.), rankings (ataque, defensa, casa, fuera), rachas y comparador Cara a Cara (H2H) con Santa Cruz C.F. vs próximo rival (Olímpico C.F.). ✅ *Completado*.
  - **Sección Calendario de Equipo**: Detalle de los 26 partidos con filtros (Todos / Jugados / Pendientes). ✅ *Completado*.
  - Soporte de caché en `localStorage` (48 horas) e indicador de tiempo relativo ("actualizado hace X minutos"). ✅ *Completado*.

- [x] **Fase 3: Repositorio GitHub y Despliegue en GitHub Pages**
  - Crear el repositorio público `landslore/santacruz-2026` mediante `gh repo create`. ✅ *Completado*.
  - Configurar GitHub Actions (`.github/workflows/pages.yml`) para actualización automática cada 6 horas. ✅ *Completado*.
  - Publicar en la rama `main` (carpeta `/docs`). ✅ *Completado*.
  - Habilitar GitHub Pages en `https://landslore.github.io/santacruz-2026/` y verificar funcionamiento. ✅ *Completado*.

- [x] **Fase 4: Verificación y Documentación Agéntica**
  - Verificación visual con Chrome headless de todas las vistas en móvil (360px). ✅ *Completado*.
  - Redacción de `AGENTS.md` con las instrucciones de arquitectura y mantenimiento. ✅ *Completado*.
  - Rediseño de tarjeta de partido en escritorio (>600px): estructura flex idéntica a Somos Valle con `[Escudo L] [Nombre L] [Píldora Marcador] [Nombre V] [Escudo V]`. ✅ *Completado*.
  - Rediseño de sección Estadísticas idéntico a Somos Valle: 4 tarjetas de rankings en fila en escritorio, nueva sección «Rachas y forma» (victorias, invicto, sin ganar con dots G/E/P) y comparador Cara a Cara (H2H) con cuadrícula de 5 columnas fijas y podio de posición. ✅ *Completado*.
  - Laboratorio interactivo H2H disponible en `docs/demo-h2h.html`. ✅ *Completado*.
  - Corrección de ordenación en ranking «🛡️ Mejor defensa»: corregida la doble negación que mostraba las peores defensas primero. Ahora lista ordenado por menos goles encajados (Santa Cruz C.F. asciende al puesto #2 con solo 1 GC en 3 PJ). ✅ *Completado*.


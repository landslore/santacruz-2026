import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');

const FUTBUTEO_URL = 'https://futbuteo.com/galicia/resultados/prebenjamin-primera-futgal/a-coruna-g1/?j=1';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FEATURED_TEAM_NAME = 'Santa Cruz C.F.';
const FEATURED_TEAM_ID = 19230216;

async function solveChallengeAndFetchHtml(targetUrl) {
  console.log(`[1/4] Conectando con Futbuteo: ${targetUrl}`);
  const res1 = await fetch(targetUrl, {
    headers: { 'User-Agent': USER_AGENT }
  });
  const html1 = await res1.text();

  let cookies = '';
  const kMatch = html1.match(/var k="([a-f0-9]+)"/);
  if (kMatch) {
    const k = kMatch[1];
    let v = 7;
    for (let i = 0; i < 32; i++) {
      v = (v * 31 + k.charCodeAt(i)) % 1000003;
    }
    console.log(`[2/4] Desafío anti-bot detectado. Resolviendo (k: ${k}, v: ${v})...`);
    const challengeUrl = `https://futbuteo.com/fbv.php?k=${k}&n=${v}`;
    const res2 = await fetch(challengeUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': targetUrl
      }
    });

    const setCookie = res2.headers.get('set-cookie');
    if (setCookie) {
      cookies = setCookie.split(',').map(c => c.split(';')[0].trim()).join('; ');
    }
  }

  console.log('[3/4] Descargando página oficial completa con cookie de sesión...');
  const res3 = await fetch(targetUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Cookie': cookies,
      'Referer': targetUrl
    }
  });

  const fullHtml = await res3.text();
  console.log(`[3/4] Página descargada con éxito (${(fullHtml.length / 1024).toFixed(1)} KB)`);
  return fullHtml;
}

function normalizeTeamName(name) {
  return String(name || '').trim();
}

function parseFutbuteoData(html) {
  console.log('[4/4] Extrayendo datos de partidos, equipos y clasificación...');
  
  // 1. Extraer objeto RV_CARA
  const start = html.indexOf('window.RV_CARA = ');
  if (start === -1) {
    throw new Error('No se encontró window.RV_CARA en el HTML de Futbuteo');
  }
  const jsonStart = start + 'window.RV_CARA = '.length;
  const end = html.indexOf(';</script>', jsonStart);
  if (end === -1) {
    throw new Error('No se encontró el cierre de window.RV_CARA');
  }
  const rvCara = JSON.parse(html.slice(jsonStart, end));

  const equiposRaw = rvCara.equipos || [];
  const partidosRaw = rvCara.partidos || [];

  // Mapear equipos por ID
  const teamsMap = {};
  equiposRaw.forEach(e => {
    const isSantaCruz = e.id === FEATURED_TEAM_ID || e.n.toLowerCase().includes('santa cruz');
    teamsMap[e.id] = {
      id: e.id,
      nombre: normalizeTeamName(e.n),
      escudo: `https://www.futbuteo.com/escudos/80/gal-${e.id}.webp`,
      esSantaCruz: isSantaCruz,
      posicion: e.pos || 0,
      puntos: 0,
      pj: 0,
      pg: 0,
      pe: 0,
      pp: 0,
      gf: 0,
      gc: 0,
      diff: 0,
      forma: e.forma || '',
      partidos: []
    };
  });

  // 2. Extraer tabla de clasificación oficial del HTML
  const clasificacion = [];
  const tStart = html.indexOf('<table');
  if (tStart !== -1) {
    const tEnd = html.indexOf('</table>', tStart);
    const tableHtml = html.slice(tStart, tEnd + 8);
    const trMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];

    // Omitir cabecera (tr 0)
    for (let i = 1; i < trMatches.length; i++) {
      const tr = trMatches[i];
      const cells = (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [])
        .map(td => td.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

      if (cells.length >= 10) {
        const pos = parseInt(cells[0], 10) || i;
        const nombre = normalizeTeamName(cells[1]);
        const pts = parseInt(cells[2], 10) || 0;
        const pj = parseInt(cells[3], 10) || 0;
        const pg = parseInt(cells[4], 10) || 0;
        const pe = parseInt(cells[5], 10) || 0;
        const pp = parseInt(cells[6], 10) || 0;
        const gf = parseInt(cells[7], 10) || 0;
        const gc = parseInt(cells[8], 10) || 0;
        const diff = parseInt(cells[9].replace('+', ''), 10) || (gf - gc);

        // Buscar equipo por nombre o id
        let teamId = 0;
        for (const tid in teamsMap) {
          if (teamsMap[tid].nombre.toLowerCase() === nombre.toLowerCase() ||
              nombre.toLowerCase().includes(teamsMap[tid].nombre.toLowerCase()) ||
              teamsMap[tid].nombre.toLowerCase().includes(nombre.toLowerCase())) {
            teamId = Number(tid);
            break;
          }
        }

        const isSantaCruz = nombre.toLowerCase().includes('santa cruz');
        const escudo = teamId ? `https://www.futbuteo.com/escudos/80/gal-${teamId}.webp` : 'https://www.futbuteo.com/escudos/80/default.webp';

        const row = {
          posicion: pos,
          equipoId: teamId,
          equipo: nombre,
          escudo: escudo,
          esSantaCruz: isSantaCruz,
          puntos: pts,
          pj: pj,
          pg: pg,
          pe: pe,
          pp: pp,
          gf: gf,
          gc: gc,
          diff: diff,
          forma: (teamId && teamsMap[teamId] && teamsMap[teamId].forma) ? teamsMap[teamId].forma : ''
        };

        clasificacion.push(row);

        if (teamId && teamsMap[teamId]) {
          teamsMap[teamId].posicion = pos;
          teamsMap[teamId].puntos = pts;
          teamsMap[teamId].pj = pj;
          teamsMap[teamId].pg = pg;
          teamsMap[teamId].pe = pe;
          teamsMap[teamId].pp = pp;
          teamsMap[teamId].gf = gf;
          teamsMap[teamId].gc = gc;
          teamsMap[teamId].diff = diff;
        }
      }
    }
  }

  // 3. Agrupar partidos en 26 Jornadas (7 partidos por jornada)
  const MATCHES_PER_JORNADA = 7;
  const TOTAL_JORNADAS = 26;
  const jornadas = [];
  let nextJornadaNumero = 1;
  let foundFirstUnplayed = false;

  for (let j = 0; j < TOTAL_JORNADAS; j++) {
    const numJornada = j + 1;
    const batch = partidosRaw.slice(j * MATCHES_PER_JORNADA, (j + 1) * MATCHES_PER_JORNADA);
    
    let jornadaDisputada = true;
    let fechaJornada = '';

    const partidosNormalizados = batch.map(m => {
      const tieneMarcador = Boolean(m.r && /^\d+\s*-\s*\d+$/.test(String(m.r).trim()));
      const jugado = tieneMarcador || Boolean(m.pasado && m.r && m.r.includes('-'));
      if (!jugado) jornadaDisputada = false;

      let golesLocal = null;
      let golesVisitante = null;
      if (jugado && m.r) {
        const parts = m.r.split('-');
        golesLocal = parseInt(parts[0], 10);
        golesVisitante = parseInt(parts[1], 10);
      }

      const matchObj = {
        id: m.id,
        jornada: numJornada,
        fecha: m.f || '',
        hora: m.h || '',
        campo: m.c || 'Campo por determinar',
        equipoLocalId: m.a,
        equipoLocal: normalizeTeamName(m.na),
        equipoLocalEscudo: `https://www.futbuteo.com/escudos/80/gal-${m.a}.webp`,
        esLocalSantaCruz: m.a === FEATURED_TEAM_ID || String(m.na).toLowerCase().includes('santa cruz'),
        equipoVisitanteId: m.b,
        equipoVisitante: normalizeTeamName(m.nb),
        equipoVisitanteEscudo: `https://www.futbuteo.com/escudos/80/gal-${m.b}.webp`,
        esVisitanteSantaCruz: m.b === FEATURED_TEAM_ID || String(m.nb).toLowerCase().includes('santa cruz'),
        resultado: m.r || '',
        golesLocal: golesLocal,
        golesVisitante: golesVisitante,
        jugado: jugado
      };

      if (!fechaJornada && m.f) fechaJornada = m.f;

      // Vincular a los equipos en teamsMap
      if (teamsMap[m.a]) teamsMap[m.a].partidos.push(matchObj);
      if (teamsMap[m.b]) teamsMap[m.b].partidos.push(matchObj);

      return matchObj;
    });

    if (!jornadaDisputada && !foundFirstUnplayed) {
      nextJornadaNumero = numJornada;
      foundFirstUnplayed = true;
    }

    jornadas.push({
      numero: numJornada,
      fecha: fechaJornada,
      disputada: jornadaDisputada,
      partidos: partidosNormalizados
    });
  }

  const now = new Date();
  const format2Digits = n => String(n).padStart(2, '0');
  const updatedAtStr = `${format2Digits(now.getDate())}/${format2Digits(now.getMonth() + 1)}/${now.getFullYear()} ${format2Digits(now.getHours())}:${format2Digits(now.getMinutes())}:${format2Digits(now.getSeconds())}`;

  return {
    ok: true,
    deporte: 'Fútbol 8',
    competicion: 'Prebenjamín - Primera Futgal',
    grupo: 'A Coruña · G1 (14 Equipos)',
    temporada: '2026-2027',
    updatedAt: updatedAtStr,
    fetchedAtMs: now.getTime(),
    jornadaActual: nextJornadaNumero,
    featuredTeamId: FEATURED_TEAM_ID,
    featuredTeamName: FEATURED_TEAM_NAME,
    clasificacion: clasificacion,
    equipos: Object.values(teamsMap),
    teams: teamsMap,
    jornadas: jornadas
  };
}

async function main() {
  try {
    fs.mkdirSync(DOCS_DIR, { recursive: true });

    const html = await solveChallengeAndFetchHtml(FUTBUTEO_URL);
    const data = parseFutbuteoData(html);

    const jsonPath = path.join(DOCS_DIR, 'data.json');
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`✅ Archivo generado: ${jsonPath} (${(fs.statSync(jsonPath).size / 1024).toFixed(1)} KB)`);
    console.log(`   - Equipos: ${data.clasificacion.length}`);
    console.log(`   - Jornadas: ${data.jornadas.length}`);
    console.log(`   - Jornada actual detectada: ${data.jornadaActual}`);
    console.log(`   - Equipo destacado: ${data.featuredTeamName} (Posición ${data.teams[FEATURED_TEAM_ID]?.posicion || '?'})`);
  } catch (err) {
    console.error('❌ Error al actualizar datos de Futbuteo:', err);
    process.exit(1);
  }
}

main();


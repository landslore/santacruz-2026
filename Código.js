/**
 * Santa Cruz 2026 — Backend Google Apps Script
 * Scraper en vivo y API JSON con CORS para Futbuteo
 */

const FUTBUTEO_URL = 'https://futbuteo.com/galicia/resultados/prebenjamin-primera-futgal/a-coruna-g1/?j=1';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FEATURED_TEAM_NAME = 'Santa Cruz C.F.';
const FEATURED_TEAM_ID = 19230216;

const CACHE_KEY_PREFIX = 'SANTACRUZ_2026_CHUNK_';
const CACHE_TTL_SECONDS = 6 * 3600; // 6 horas
const MAX_CHUNK_SIZE = 85000;

function doGet(e) {
  const forceRefresh = Boolean(e && e.parameter && (e.parameter.refresh === '1' || e.parameter.refresh === 'true'));
  const data = getSantaCruzLeagueData(forceRefresh);

  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSantaCruzLeagueData(forceRefresh) {
  if (!forceRefresh) {
    const cached = getCachedData_();
    if (cached) return cached;
  }

  try {
    const liveData = fetchAndParseFutbuteo_();
    if (liveData && liveData.ok) {
      saveCachedData_(liveData);
      return liveData;
    }
  } catch (err) {
    Logger.log('Error en fetch en vivo: ' + err);
    const stale = getCachedData_();
    if (stale) return stale;
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

function fetchAndParseFutbuteo_() {
  // 1. Primera petición para detectar si hay challenge anti-bot
  const res1 = UrlFetchApp.fetch(FUTBUTEO_URL, {
    method: 'get',
    headers: { 'User-Agent': USER_AGENT },
    muteHttpExceptions: true
  });

  const html1 = res1.getContentText();
  let cookieHeader = '';

  const kMatch = html1.match(/var k="([a-f0-9]+)"/);
  if (kMatch) {
    const k = kMatch[1];
    let v = 7;
    for (let i = 0; i < 32; i++) {
      v = (v * 31 + k.charCodeAt(i)) % 1000003;
    }

    const challengeUrl = 'https://futbuteo.com/fbv.php?k=' + k + '&n=' + v;
    const res2 = UrlFetchApp.fetch(challengeUrl, {
      method: 'get',
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': FUTBUTEO_URL
      },
      muteHttpExceptions: true
    });

    const headers = res2.getAllHeaders();
    let rawCookies = headers['Set-Cookie'] || headers['set-cookie'];
    if (rawCookies) {
      if (Array.isArray(rawCookies)) {
        cookieHeader = rawCookies.map(function(c) { return String(c).split(';')[0]; }).join('; ');
      } else {
        cookieHeader = String(rawCookies).split(';')[0];
      }
    }
  }

  // 2. Descargar página oficial completa
  const fetchHeaders = {
    'User-Agent': USER_AGENT,
    'Referer': FUTBUTEO_URL
  };
  if (cookieHeader) {
    fetchHeaders['Cookie'] = cookieHeader;
  }

  const res3 = UrlFetchApp.fetch(FUTBUTEO_URL, {
    method: 'get',
    headers: fetchHeaders,
    muteHttpExceptions: true
  });

  const fullHtml = res3.getContentText();
  return parseFutbuteoHtml_(fullHtml);
}

function parseFutbuteoHtml_(html) {
  const start = html.indexOf('window.RV_CARA = ');
  if (start === -1) {
    throw new Error('window.RV_CARA no encontrado en HTML');
  }
  const jsonStart = start + 'window.RV_CARA = '.length;
  const end = html.indexOf(';</script>', jsonStart);
  if (end === -1) {
    throw new Error('Cierre de window.RV_CARA no encontrado');
  }

  const rvCara = JSON.parse(html.slice(jsonStart, end));
  const equiposRaw = rvCara.equipos || [];
  const partidosRaw = rvCara.partidos || [];

  const teamsMap = {};
  equiposRaw.forEach(function(e) {
    const isSantaCruz = e.id === FEATURED_TEAM_ID || String(e.n).toLowerCase().indexOf('santa cruz') !== -1;
    teamsMap[e.id] = {
      id: e.id,
      nombre: String(e.n || '').trim(),
      escudo: 'https://www.futbuteo.com/escudos/80/gal-' + e.id + '.webp',
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

  const clasificacion = [];
  const tStart = html.indexOf('<table');
  if (tStart !== -1) {
    const tEnd = html.indexOf('</table>', tStart);
    const tableHtml = html.slice(tStart, tEnd + 8);
    const trMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];

    for (let i = 1; i < trMatches.length; i++) {
      const tr = trMatches[i];
      const cells = (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [])
        .map(function(td) { return td.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); });

      if (cells.length >= 10) {
        const pos = parseInt(cells[0], 10) || i;
        const nombre = String(cells[1] || '').trim();
        const pts = parseInt(cells[2], 10) || 0;
        const pj = parseInt(cells[3], 10) || 0;
        const pg = parseInt(cells[4], 10) || 0;
        const pe = parseInt(cells[5], 10) || 0;
        const pp = parseInt(cells[6], 10) || 0;
        const gf = parseInt(cells[7], 10) || 0;
        const gc = parseInt(cells[8], 10) || 0;
        const diff = parseInt(cells[9].replace('+', ''), 10) || (gf - gc);

        let teamId = 0;
        for (const tid in teamsMap) {
          if (teamsMap[tid].nombre.toLowerCase() === nombre.toLowerCase() ||
              nombre.toLowerCase().indexOf(teamsMap[tid].nombre.toLowerCase()) !== -1 ||
              teamsMap[tid].nombre.toLowerCase().indexOf(nombre.toLowerCase()) !== -1) {
            teamId = Number(tid);
            break;
          }
        }

        const isSantaCruz = nombre.toLowerCase().indexOf('santa cruz') !== -1;
        const escudo = teamId ? ('https://www.futbuteo.com/escudos/80/gal-' + teamId + '.webp') : 'https://www.futbuteo.com/escudos/80/default.webp';

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

    const partidosNormalizados = batch.map(function(m) {
      const tieneMarcador = Boolean(m.r && /^\d+\s*-\s*\d+$/.test(String(m.r).trim()));
      const jugado = tieneMarcador || Boolean(m.pasado && m.r && m.r.indexOf('-') !== -1);
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
        equipoLocal: String(m.na || '').trim(),
        equipoLocalEscudo: 'https://www.futbuteo.com/escudos/80/gal-' + m.a + '.webp',
        esLocalSantaCruz: m.a === FEATURED_TEAM_ID || String(m.na).toLowerCase().indexOf('santa cruz') !== -1,
        equipoVisitanteId: m.b,
        equipoVisitante: String(m.nb || '').trim(),
        equipoVisitanteEscudo: 'https://www.futbuteo.com/escudos/80/gal-' + m.b + '.webp',
        esVisitanteSantaCruz: m.b === FEATURED_TEAM_ID || String(m.nb).toLowerCase().indexOf('santa cruz') !== -1,
        resultado: m.r || '',
        golesLocal: golesLocal,
        golesVisitante: golesVisitante,
        jugado: jugado
      };

      if (!fechaJornada && m.f) fechaJornada = m.f;

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
  const format2Digits = function(n) { return (n < 10 ? '0' : '') + n; };
  const updatedAtStr = format2Digits(now.getDate()) + '/' + format2Digits(now.getMonth() + 1) + '/' + now.getFullYear() + ' ' +
    format2Digits(now.getHours()) + ':' + format2Digits(now.getMinutes()) + ':' + format2Digits(now.getSeconds());

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
    equipos: Object.keys(teamsMap).map(function(k) { return teamsMap[k]; }),
    teams: teamsMap,
    jornadas: jornadas
  };
}

function getCachedData_() {
  try {
    const cache = CacheService.getScriptCache();
    const countStr = cache.get(CACHE_KEY_PREFIX + 'COUNT');
    if (!countStr) return null;
    const count = parseInt(countStr, 10);
    const chunks = [];
    for (let i = 0; i < count; i++) {
      const chunk = cache.get(CACHE_KEY_PREFIX + i);
      if (!chunk) return null;
      chunks.push(chunk);
    }
    return JSON.parse(chunks.join(''));
  } catch (e) {
    return null;
  }
}

function saveCachedData_(data) {
  try {
    const cache = CacheService.getScriptCache();
    const jsonStr = JSON.stringify(data);
    const count = Math.ceil(jsonStr.length / MAX_CHUNK_SIZE);
    cache.put(CACHE_KEY_PREFIX + 'COUNT', String(count), CACHE_TTL_SECONDS);
    for (let i = 0; i < count; i++) {
      const part = jsonStr.substring(i * MAX_CHUNK_SIZE, (i + 1) * MAX_CHUNK_SIZE);
      cache.put(CACHE_KEY_PREFIX + i, part, CACHE_TTL_SECONDS);
    }
  } catch (e) {
    Logger.log('Error al guardar en CacheService: ' + e);
  }
}


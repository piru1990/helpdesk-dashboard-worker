// Tablero Supervisión Mesa de Ayuda: pasarela de solo lectura hacia Odoo.
// - Exige un JWT válido de Cloudflare Access en TODAS las rutas (también los archivos estáticos).
// - Solo ejecuta consultas fijas (search_read); el cliente elige la página y, en /api/indicadores, el rango de fechas validado.
// - Retransmite la respuesta de Odoo sin procesarla y la guarda 5 minutos en KV.

const EQUIPO = 35;
const TECNICOS = [446, 3554, 3253]; // Técnico A, Técnico B, Técnico C
const PAGINA = 1000;
const MAX_PAGINAS = 40;
const TTL = 300; // segundos
const MESES_HISTORIA = 6;

function desde() {
  // Primer día del mes de hace MESES_HISTORIA meses, en hora de Guatemala (UTC-6).
  const gt = new Date(Date.now() - 6 * 3600e3);
  const d = new Date(Date.UTC(gt.getUTCFullYear(), gt.getUTCMonth() - MESES_HISTORIA, 1));
  return d.toISOString().slice(0, 10);
}

function consulta(tipo, p) {
  const d = desde();
  if (tipo === 'tickets') {
    return {
      modelo: 'helpdesk.ticket',
      cuerpo: {
        domain: [['team_id', '=', EQUIPO], ['user_id', 'in', TECNICOS], ['create_date', '>=', d + ' 06:00:00']],
        fields: ['ticket_ref', 'name', 'user_id', 'partner_id', 'stage_id', 'create_date', 'total_hours_spent',
          'clasificacion_aplicacion_id', 'clasificacion_modulo_id'],
        order: 'id asc', limit: PAGINA, offset: p * PAGINA,
      },
    };
  }
  return {
    modelo: 'account.analytic.line',
    cuerpo: {
      domain: [['helpdesk_ticket_id.team_id', '=', EQUIPO], ['user_id', 'in', TECNICOS], ['date', '>=', d]],
      fields: ['date', 'user_id', 'unit_amount'],
      order: 'id asc', limit: PAGINA, offset: p * PAGINA,
    },
  };
}

/* ---------- Indicadores de desempeño (PDF / Excel por técnico) ---------- */

const TECNICOS_IND = [446, 3554, 3253, 267]; // Técnico A, Técnico B, Técnico C y ex-técnico (reporte de gerencia 2026)
const MAX_DIAS_IND = 400;

function sumarDias(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Devuelve [desde, hasta] validados (YYYY-MM-DD, hora de Guatemala, inclusive) o null.
function rangoIndicadores(url) {
  const f = /^\d{4}-\d{2}-\d{2}$/;
  const a = url.searchParams.get('desde') ?? '', b = url.searchParams.get('hasta') ?? '';
  if (!f.test(a) || !f.test(b)) return null;
  const da = Date.parse(a + 'T00:00:00Z'), db = Date.parse(b + 'T00:00:00Z');
  if (!(da <= db) || (db - da) / 864e5 > MAX_DIAS_IND) return null;
  return [a, b];
}

async function indicadores(url, env, ctx) {
  const rango = rangoIndicadores(url);
  if (!rango) return json({ error: 'Rango de fechas no válido.' }, 400);
  const p = Number(url.searchParams.get('p') ?? '0');
  if (!Number.isInteger(p) || p < 0 || p >= MAX_PAGINAS) return json({ error: 'Página no válida.' }, 400);
  if (!env.ODOO_URL || !env.ODOO_API_KEY) return json({ error: 'Falta configurar la conexión a Odoo.' }, 500);
  const [a, b] = rango;
  const clave = `ind:${a}:${b}:${p}`;
  const cabeceras = { 'Content-Type': 'application/json; charset=utf-8', ...SEGURIDAD };
  const guardado = await env.CACHE.getWithMetadata(clave, { type: 'stream' });
  if (guardado.value) return new Response(guardado.value, { headers: { ...cabeceras, 'x-cache': 'hit', 'x-consultado': guardado.metadata?.at || '' } });

  // Medianoche de Guatemala (UTC-6) = 06:00 UTC.
  const cuerpo = {
    domain: [['team_id', '=', EQUIPO], ['user_id', 'in', TECNICOS_IND],
      ['create_date', '>=', a + ' 06:00:00'], ['create_date', '<', sumarDias(b, 1) + ' 06:00:00']],
    fields: ['ticket_ref', 'name', 'user_id', 'partner_id', 'stage_id', 'create_date', 'cn003_fecha_apertura_reporte',
      'cn003_fecha_cierre_reporte', 'total_hours_spent'],
    order: 'id asc', limit: PAGINA, offset: p * PAGINA,
  };
  let r;
  try {
    r = await fetch(`${env.ODOO_URL.replace(/\/+$/, '')}/json/2/helpdesk.ticket/search_read`, {
      method: 'POST',
      headers: { Authorization: 'bearer ' + env.ODOO_API_KEY, 'Content-Type': 'application/json; charset=utf-8', 'User-Agent': 'tablero-mesa-ayuda' },
      body: JSON.stringify(cuerpo),
    });
  } catch { return json({ error: 'No se pudo conectar con Odoo.' }, 502); }
  if (!r.ok) {
    console.log('Odoo respondió', r.status, (await r.text()).slice(0, 300));
    return json({ error: 'Odoo rechazó la consulta (' + r.status + ').' }, 502);
  }
  const texto = await r.text();
  if (!texto.startsWith('[')) return json({ error: 'Respuesta inesperada de Odoo.' }, 502);
  const at = new Date().toISOString();
  ctx.waitUntil(env.CACHE.put(clave, texto, { expirationTtl: TTL, metadata: { at } }));
  return new Response(texto, { headers: { ...cabeceras, 'x-cache': 'miss', 'x-consultado': at } });
}

/* ---------- Cloudflare Access ---------- */

let jwks = { at: 0, keys: [] };
const b64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function correoAutorizado(request, env) {
  if (env.DEV_NO_ACCESS === '1') return 'dev@local';
  const equipo = env.TEAM_DOMAIN, aud = env.ACCESS_AUD;
  if (!equipo || !aud) return null; // sin configurar: cerrado
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  let cab, datos;
  try {
    cab = JSON.parse(new TextDecoder().decode(b64(partes[0])));
    datos = JSON.parse(new TextDecoder().decode(b64(partes[1])));
  } catch { return null; }
  if (cab.alg !== 'RS256') return null;
  const emisor = 'https://' + equipo;
  if (Date.now() - jwks.at > 3600e3 || !jwks.keys.some((k) => k.kid === cab.kid)) {
    const r = await fetch(emisor + '/cdn-cgi/access/certs');
    if (!r.ok) return null;
    jwks = { at: Date.now(), keys: (await r.json()).keys || [] };
  }
  const jwk = jwks.keys.find((k) => k.kid === cab.kid);
  if (!jwk) return null;
  let valido = false;
  try {
    const clave = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    valido = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', clave, b64(partes[2]), new TextEncoder().encode(partes[0] + '.' + partes[1]));
  } catch { return null; }
  if (!valido) return null;
  const ahora = Date.now() / 1000;
  if (datos.iss !== emisor || !(datos.exp > ahora) || (datos.nbf && datos.nbf > ahora + 60)) return null;
  const auds = Array.isArray(datos.aud) ? datos.aud : [datos.aud];
  if (!auds.includes(aud)) return null;
  return datos.email || 'autorizado';
}

/* ---------- respuestas ---------- */

const SEGURIDAD = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};
const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...SEGURIDAD, ...extra } });

async function api(tipo, url, env, ctx) {
  const p = Number(url.searchParams.get('p') ?? '0');
  if (!Number.isInteger(p) || p < 0 || p >= MAX_PAGINAS) return json({ error: 'Página no válida.' }, 400);
  if (!env.ODOO_URL || !env.ODOO_API_KEY) return json({ error: 'Falta configurar la conexión a Odoo.' }, 500);
  const clave = `${tipo}:${desde()}:${p}`;
  const cabeceras = { 'Content-Type': 'application/json; charset=utf-8', ...SEGURIDAD };

  const guardado = await env.CACHE.getWithMetadata(clave, { type: 'stream' });
  if (guardado.value) return new Response(guardado.value, { headers: { ...cabeceras, 'x-cache': 'hit', 'x-consultado': guardado.metadata?.at || '' } });

  const q = consulta(tipo, p);
  let r;
  try {
    r = await fetch(`${env.ODOO_URL.replace(/\/+$/, '')}/json/2/${q.modelo}/search_read`, {
      method: 'POST',
      headers: { Authorization: 'bearer ' + env.ODOO_API_KEY, 'Content-Type': 'application/json; charset=utf-8', 'User-Agent': 'tablero-mesa-ayuda' },
      body: JSON.stringify(q.cuerpo),
    });
  } catch { return json({ error: 'No se pudo conectar con Odoo.' }, 502); }
  if (!r.ok) {
    console.log('Odoo respondió', r.status, (await r.text()).slice(0, 300));
    return json({ error: 'Odoo rechazó la consulta (' + r.status + ').' }, 502);
  }
  const texto = await r.text();
  if (!texto.startsWith('[')) return json({ error: 'Respuesta inesperada de Odoo.' }, 502);
  const at = new Date().toISOString();
  ctx.waitUntil(env.CACHE.put(clave, texto, { expirationTtl: TTL, metadata: { at } }));
  return new Response(texto, { headers: { ...cabeceras, 'x-cache': 'miss', 'x-consultado': at } });
}

export default {
  async fetch(request, env, ctx) {
    const correo = await correoAutorizado(request, env);
    if (!correo) return new Response('Acceso no autorizado.', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...SEGURIDAD } });
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Método no permitido.', { status: 405, headers: SEGURIDAD });

    const url = new URL(request.url);
    if (url.pathname === '/api/tickets') return api('tickets', url, env, ctx);
    if (url.pathname === '/api/horas') return api('horas', url, env, ctx);
    if (url.pathname === '/api/indicadores') return indicadores(url, env, ctx);
    if (url.pathname.startsWith('/api/')) return json({ error: 'No existe.' }, 404);

    const r = await env.ASSETS.fetch(request);
    const res = new Response(r.body, r);
    for (const [k, v] of Object.entries(SEGURIDAD)) res.headers.set(k, v);
    return res;
  },
};

// Reemplazo mínimo del runtime del tablero: carga los datos de /api/*, los transforma
// (misma lógica que mcp-servers/odoo-helpdesk/tablero_mesa_ayuda.py) y redibuja la página.
(() => {
  const TECNICOS = { 446: 'Técnico A', 3554: 'Técnico B', 3253: 'Técnico C' };
  const REFRESCO = 5 * 60 * 1000;
  const DEFECTO = { tecnico: 'Todos', dia: '', semana: '', mes: '', solo_alertas: false };

  /* ---------- transformación ---------- */

  const TIPOS = [
    ['Error de sistema', /^err(or|ores)\s+(de|en|del|d)\s+(el\s+)?sistemas?\b/],
    ['Configuración de sistema', /^config\w*(\s+(de|del|en)\s+(el\s+)?sistemas?)?\b/],
    ['Error de usuario', /^err(or|ores)\s+(de|del)\s+usuarios?\b/],
    ['Falta de capacitación', /^falta\s+(de\s+)?capacitaci\w+/],
  ];
  const INFERIDOS = [
    ['Falta de capacitación', /^(capacitaci|consulta|duda|induccion|explicaci|apoyo con|como )/],
    ['Error de usuario', /^(mala digitacion|error al digitar|equivocacion)/],
    ['Error de sistema', /^(no |problemas? |err(or|ores)\b|fall[ao]|inconveniente|lentitud|bloqueo de sistema|se cayo)/],
    ['Configuración de sistema', /^(creaci|asignaci|restablec|desbloqueo|actualizaci|carga|cambio|anulaci|habilita|agrega|alta |baja |generaci|reposici|modificaci|eliminaci|apertura|reapertura|cierre|traslado|instalaci|permiso|acceso|requerimiento|solicitud|recibo|nota de|validaci|correcci|reversi|cancelaci|liberaci|autorizaci|ajuste|reasignaci|activaci|desactivaci|ingreso|registro|envio|revision|soporte)/],
  ];
  const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  function clasificar(titulo) {
    const t = sinAcentos(titulo).toLowerCase().trim();
    for (const [tipo, rx] of TIPOS) {
      const m = t.match(rx);
      if (m) return [tipo, 'prefijo', titulo.trim().slice(m[0].length).replace(/^[ :.\-–]+/, '')];
    }
    for (const [tipo, rx] of INFERIDOS) if (rx.test(t)) return [tipo, 'inferido', titulo.trim()];
    return ['Otros', 'inferido', titulo.trim()];
  }
  const nombre = (m2o) => (m2o ? m2o[1] : '');
  const persona = (m2o) => {
    const n = nombre(m2o);
    return n && n === n.toUpperCase() ? n.toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : n;
  };
  const iso = (d) => d.toISOString().slice(0, 10);

  function transformar(crudos, lineas) {
    const repetidos = new Map();
    const tickets = crudos.map((r) => {
      const creado = new Date(new Date(r.create_date.replace(' ', 'T') + 'Z').getTime() - 6 * 3600e3);
      const dia = iso(creado);
      const lunes = new Date(creado); lunes.setUTCDate(lunes.getUTCDate() - ((lunes.getUTCDay() + 6) % 7));
      const titulo = (r.name || '').trim();
      const [tipo, origen, resto] = clasificar(titulo);
      const tecnico = TECNICOS[r.user_id[0]];
      const clave = tecnico + '|' + dia + '|' + sinAcentos(titulo).toLowerCase();
      repetidos.set(clave, (repetidos.get(clave) || 0) + 1);
      const etapa = nombre(r.stage_id);
      return {
        id: r.id, ref: r.ticket_ref || String(r.id), titulo, tecnico, solicitante: persona(r.partner_id), etapa,
        creado: creado.toISOString().slice(0, 16).replace('T', ' '), dia, semana: iso(lunes), mes: dia.slice(0, 7),
        app: nombre(r.clasificacion_aplicacion_id) || '(sin aplicación)',
        modulo: nombre(r.clasificacion_modulo_id) || '(sin módulo)',
        tipo, tipo_origen: origen, horas: Math.round((r.total_hours_spent || 0) * 100) / 100,
        _resto: resto, _clave: clave,
      };
    }).sort((a, b) => (a.creado < b.creado ? -1 : a.creado > b.creado ? 1 : a.id - b.id));
    for (const t of tickets) {
      const al = [];
      if (t.tipo_origen !== 'prefijo') al.push('Sin prefijo estándar');
      if (t._resto.length < 15) al.push('Título muy corto');
      if (t.titulo.length > 150) al.push('Título muy largo');
      if (t.modulo === '(sin módulo)') al.push('Sin módulo');
      if (t.horas === 0 && t.etapa.startsWith('50')) al.push('Cerrado sin horas');
      if (t.horas >= 3) al.push('3 h o más');
      if (repetidos.get(t._clave) > 1) al.push('Título repetido en el día');
      t.alertas = al.join('; ');
      t.n_alertas = al.length;
      delete t._resto; delete t._clave;
    }
    const acum = new Map();
    for (const l of lineas) {
      const k = l.date + '_' + TECNICOS[l.user_id[0]];
      const a = acum.get(k) || { k, fecha: l.date, tecnico: TECNICOS[l.user_id[0]], horas: 0, registros: 0 };
      a.horas += l.unit_amount || 0; a.registros += 1; acum.set(k, a);
    }
    const horas = [...acum.values()].map((a) => ({ ...a, horas: Math.round(a.horas * 100) / 100 })).sort((a, b) => (a.k < b.k ? -1 : 1));
    return { tickets, horas_dia: horas };
  }

  /* ---------- runtime ---------- */

  const fuentes = { tickets: { status: 'loading', data: [] }, horas_dia: { status: 'loading', data: [] } };
  const calcs = {}, memo = {}, dibujos = {}, alDato = [];
  let params = { ...DEFECTO };
  let pendiente = false;

  function data(id) {
    if (fuentes[id]) return fuentes[id];
    const c = calcs[id];
    if (!c) return { status: 'missing', data: null };
    const ins = c.inputs.map(data);
    const mal = ins.find((s) => s.status !== 'ok');
    if (mal) return { status: mal.status, data: null };
    if (!memo[id]) {
      try { memo[id] = { status: 'ok', data: c.fn(...ins.map((s) => s.data)) }; }
      catch (e) { console.error('calc ' + id, e); memo[id] = { status: 'error', data: null, message: String(e) }; }
    }
    return memo[id];
  }
  function pintar() {
    pendiente = false;
    for (const fn of alDato) { try { fn(); } catch (e) { console.error(e); } }
    document.querySelectorAll('[data-draw]').forEach((n) => {
      if (n.closest('[hidden]')) return;
      const fn = dibujos[n.dataset.draw];
      if (!fn) return;
      try { fn(n); } catch (e) { console.error('draw ' + n.dataset.draw, e); }
    });
  }
  const programar = () => { if (!pendiente) { pendiente = true; requestAnimationFrame(pintar); } };

  window.dash = {
    colors: ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'],
    data,
    calc(id, o) { calcs[id] = o; },
    loader() {},
    draw(name, fn) { if (typeof fn === 'function') dibujos[name] = fn; else programar(); },
    onData(fn) { alDato.push(fn); try { fn(); } catch (e) { console.error(e); } },
    params: () => ({ ...params }),
    setParams(o) { params = { ...params, ...o }; programar(); },
    resetParams() { params = { ...DEFECTO }; programar(); },
    setLink(name) { try { history.replaceState(null, '', '#' + name); } catch (e) { /* sin historial */ } },
    refresh() { cargar(); },
  };

  /* ---------- carga ---------- */

  const estado = (texto, error) => {
    document.querySelectorAll('#estado').forEach((n) => { n.textContent = texto; n.classList.toggle('sm-error', !!error); });
  };
  async function paginas(ruta) {
    const filas = []; let consultado = '';
    for (let p = 0; p < 40; p++) {
      const r = await fetch(ruta + '?p=' + p, { credentials: 'same-origin', redirect: 'manual' });
      if (r.type === 'opaqueredirect' || r.status === 401 || r.status === 403) throw new Error('sesion');
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Error ' + r.status);
      const lote = await r.json();
      const at = r.headers.get('x-consultado') || '';
      if (at > consultado) consultado = at;
      filas.push(...lote);
      if (lote.length < 1000) break;
    }
    return { filas, consultado };
  }
  let cargando = false;
  async function cargar() {
    if (cargando) return;
    cargando = true;
    const primera = fuentes.tickets.status !== 'ok';
    if (primera) estado('Consultando Odoo…');
    try {
      const [t, h] = await Promise.all([paginas('/api/tickets'), paginas('/api/horas')]);
      const out = transformar(t.filas, h.filas);
      fuentes.tickets = { status: 'ok', data: out.tickets };
      fuentes.horas_dia = { status: 'ok', data: out.horas_dia };
      for (const k of Object.keys(memo)) delete memo[k];
      const at = new Date(t.consultado > h.consultado ? t.consultado : h.consultado || Date.now());
      estado('Datos de Odoo consultados el ' + at.toLocaleDateString('es-GT', { day: 'numeric', month: 'short' }) + ' a las ' + at.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' · Se actualizan solos cada 5 minutos');
    } catch (e) {
      if (primera) { fuentes.tickets = { status: 'error', data: [] }; fuentes.horas_dia = { status: 'error', data: [] }; }
      estado(e.message === 'sesion' ? 'La sesión venció. Recarga la página para volver a entrar.' : 'No se pudieron actualizar los datos: ' + e.message, true);
    }
    cargando = false;
    programar();
  }

  document.addEventListener('DOMContentLoaded', () => {
    new MutationObserver(programar).observe(document.body, { attributes: true, attributeFilter: ['hidden'], subtree: true });
    let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(programar, 150); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) cargar(); });
    setInterval(() => { if (!document.hidden) cargar(); }, REFRESCO);
    programar();
    cargar();
  });
})();

const META = 8; // horas por técnico por día hábil, definida por el supervisor
const TEC = ['Técnico A', 'Técnico C', 'Técnico B'];
const ODOO = 'https://example.odoo.com/odoo/action-900/';
const root = document.getElementById('dash-root') || document;

/* ---------- cálculos ---------- */

dash.calc('dia_tecnico', {
  title: 'Horas y tickets por técnico y día',
  description: 'Tickets creados y horas registradas cada día por técnico, con la fila Todos como total.',
  inputs: ['tickets', 'horas_dia'],
  fn: (tickets, horas_dia) => {
    const meta = 8;
    const m = new Map();
    const get = (dia, tecnico) => {
      const k = dia + '_' + tecnico;
      if (!m.has(k)) m.set(k, { k, dia, tecnico, tickets: 0, con_alertas: 0, horas: 0, cumplen: 0 });
      return m.get(k);
    };
    for (const t of tickets) for (const who of [t.tecnico, 'Todos']) {
      const r = get(t.dia, who);
      r.tickets += 1;
      if (t.n_alertas > 0) r.con_alertas += 1;
    }
    for (const h of horas_dia) {
      get(h.fecha, h.tecnico).horas += h.horas;
      get(h.fecha, 'Todos').horas += h.horas;
    }
    for (const r of m.values()) r.horas = Math.round(r.horas * 10) / 10;
    for (const r of m.values()) if (r.tecnico !== 'Todos') {
      r.cumplen = r.horas >= meta ? 1 : 0;
      get(r.dia, 'Todos').cumplen += r.cumplen;
    }
    return [...m.values()].sort((a, b) => (a.k < b.k ? -1 : 1));
  },
});

dash.calc('semana_tecnico', {
  title: 'Tickets y horas por semana y técnico',
  description: 'Tickets creados y horas registradas por semana (lunes a domingo), con el cambio frente a la semana anterior hasta el mismo día de la semana.',
  inputs: ['tickets', 'horas_dia'],
  fn: (tickets, horas_dia) => {
    const lunes = (f) => {
      const d = new Date(f + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return d.toISOString().slice(0, 10);
    };
    const previa = (s) => {
      const d = new Date(s + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - 7);
      return d.toISOString().slice(0, 10);
    };
    const m = new Map();
    const get = (semana, tecnico) => {
      const k = semana + '_' + tecnico;
      if (!m.has(k)) m.set(k, { k, semana, tecnico, tickets: 0, horas: 0, tickets_previa: null, cambio: null });
      return m.get(k);
    };
    for (const t of tickets) for (const who of [t.tecnico, 'Todos']) get(t.semana, who).tickets += 1;
    for (const h of horas_dia) for (const who of [h.tecnico, 'Todos']) get(lunes(h.fecha), who).horas += h.horas;
    const primera = [...m.values()].reduce((a, r) => (r.semana < a ? r.semana : a), '9999');
    // La semana en curso se compara con la anterior solo hasta el mismo día de la semana.
    const corte = new Map();
    for (const t of tickets) if (t.dia > (corte.get(t.semana) || '')) corte.set(t.semana, t.dia);
    const dias = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
    for (const r of m.values()) {
      r.horas = Math.round(r.horas * 10) / 10;
      if (r.semana <= primera || !corte.has(r.semana)) continue;
      const p = previa(r.semana), hasta = dias(r.semana, corte.get(r.semana));
      r.tickets_previa = tickets.filter((t) => t.semana === p && dias(p, t.dia) <= hasta && (r.tecnico === 'Todos' || t.tecnico === r.tecnico)).length;
      r.cambio = r.tickets - r.tickets_previa;
    }
    return [...m.values()].sort((a, b) => (a.k < b.k ? -1 : 1));
  },
});

dash.calc('mes_tecnico', {
  title: 'Tickets y horas por mes y técnico',
  description: 'Tickets y horas por mes, comparados con el mes anterior hasta el mismo día del mes.',
  inputs: ['tickets', 'horas_dia'],
  fn: (tickets, horas_dia) => {
    const prev = (mes) => {
      const [y, mo] = mes.split('-').map(Number);
      return mo === 1 ? (y - 1) + '-12' : y + '-' + String(mo - 1).padStart(2, '0');
    };
    const corte = new Map();
    for (const t of tickets) {
      const d = Number(t.dia.slice(8));
      if (d > (corte.get(t.mes) || 0)) corte.set(t.mes, d);
    }
    const primero = [...corte.keys()].sort()[0];
    const m = new Map();
    const get = (mes, tecnico) => {
      const k = mes + '_' + tecnico;
      if (!m.has(k)) m.set(k, { k, mes, tecnico, tickets: 0, horas: 0, corte_dia: corte.get(mes) || null, previo_corte: null, cambio_pct: null });
      return m.get(k);
    };
    for (const t of tickets) for (const who of [t.tecnico, 'Todos']) get(t.mes, who).tickets += 1;
    for (const h of horas_dia) for (const who of [h.tecnico, 'Todos']) get(h.fecha.slice(0, 7), who).horas += h.horas;
    for (const r of m.values()) {
      r.horas = Math.round(r.horas * 10) / 10;
      if (r.mes === primero || !r.corte_dia) continue;
      const p = prev(r.mes);
      r.previo_corte = tickets.filter((t) => t.mes === p && Number(t.dia.slice(8)) <= r.corte_dia && (r.tecnico === 'Todos' || t.tecnico === r.tecnico)).length;
      r.cambio_pct = r.previo_corte ? Math.round(((r.tickets - r.previo_corte) / r.previo_corte) * 100) : null;
    }
    return [...m.values()].sort((a, b) => (a.k < b.k ? -1 : 1));
  },
});

dash.calc('grupos_semana', {
  title: 'Incidentes por aplicación, módulo y tipo, por semana',
  description: 'Cuántos tickets y horas tiene cada combinación de aplicación, módulo y tipo en cada semana, por técnico y en total.',
  inputs: ['tickets'],
  fn: (tickets) => {
    const m = new Map();
    for (const t of tickets) for (const who of [t.tecnico, 'Todos']) {
      const id = [t.semana, who, t.app, t.modulo, t.tipo].join('|');
      if (!m.has(id)) m.set(id, { k: '', semana: t.semana, tecnico: who, app: t.app, modulo: t.modulo, tipo: t.tipo, tickets: 0, horas: 0, ejemplo: t.titulo });
      const r = m.get(id);
      r.tickets += 1;
      r.horas += t.horas;
    }
    const rows = [...m.values()].sort((a, b) => (a.semana < b.semana ? 1 : a.semana > b.semana ? -1 : b.tickets - a.tickets));
    rows.forEach((r, i) => { r.k = 'g' + i; r.horas = Math.round(r.horas * 10) / 10; });
    return rows;
  },
});

dash.calc('grupos_mes', {
  title: 'Incidentes por aplicación, módulo y tipo, por mes',
  description: 'Tickets, horas, minutos promedio por ticket y meses seguidos de cada combinación de aplicación, módulo y tipo en cada mes.',
  inputs: ['tickets'],
  fn: (tickets) => {
    const prev = (mes) => {
      const [y, mo] = mes.split('-').map(Number);
      return mo === 1 ? (y - 1) + '-12' : y + '-' + String(mo - 1).padStart(2, '0');
    };
    const m = new Map();
    for (const t of tickets) for (const who of [t.tecnico, 'Todos']) {
      const id = [t.mes, who, t.app, t.modulo, t.tipo].join('|');
      if (!m.has(id)) m.set(id, { k: '', mes: t.mes, tecnico: who, app: t.app, modulo: t.modulo, tipo: t.tipo, tickets: 0, horas: 0, min_ticket: 0, meses_seguidos: 1, ejemplo: t.titulo });
      const r = m.get(id);
      r.tickets += 1;
      r.horas += t.horas;
    }
    for (const r of m.values()) {
      let mes = prev(r.mes);
      while (m.has([mes, r.tecnico, r.app, r.modulo, r.tipo].join('|'))) { r.meses_seguidos += 1; mes = prev(mes); }
      r.min_ticket = Math.round((r.horas * 60) / r.tickets);
      r.horas = Math.round(r.horas * 10) / 10;
    }
    const rows = [...m.values()].sort((a, b) => (a.mes < b.mes ? 1 : a.mes > b.mes ? -1 : b.tickets - a.tickets));
    rows.forEach((r, i) => { r.k = 'm' + i; });
    return rows;
  },
});

dash.calc('solicitantes_semana', {
  title: 'Solicitantes por semana',
  description: 'Tickets por solicitante en cada semana y la aplicación y módulo que más repite.',
  inputs: ['tickets'],
  fn: (tickets) => {
    const m = new Map();
    for (const t of tickets) for (const who of [t.tecnico, 'Todos']) {
      const nombre = t.solicitante || '(sin solicitante)';
      const id = [t.semana, who, nombre].join('|');
      if (!m.has(id)) m.set(id, { k: '', semana: t.semana, tecnico: who, solicitante: nombre, tickets: 0, tema: '', temas: new Map() });
      const r = m.get(id);
      r.tickets += 1;
      const tema = t.app + ' › ' + t.modulo;
      r.temas.set(tema, (r.temas.get(tema) || 0) + 1);
    }
    const rows = [...m.values()].sort((a, b) => (a.semana < b.semana ? 1 : a.semana > b.semana ? -1 : b.tickets - a.tickets));
    rows.forEach((r, i) => {
      r.k = 's' + i;
      r.tema = [...r.temas.entries()].sort((a, b) => b[1] - a[1])[0][0];
      delete r.temas;
    });
    return rows;
  },
});

dash.calc('apps_mes', {
  title: 'Tickets por aplicación y mes',
  description: 'Tickets por aplicación en cada mes frente al mes anterior hasta el mismo día del mes.',
  inputs: ['tickets'],
  fn: (tickets) => {
    const prev = (mes) => {
      const [y, mo] = mes.split('-').map(Number);
      return mo === 1 ? (y - 1) + '-12' : y + '-' + String(mo - 1).padStart(2, '0');
    };
    const corte = new Map();
    for (const t of tickets) {
      const d = Number(t.dia.slice(8));
      if (d > (corte.get(t.mes) || 0)) corte.set(t.mes, d);
    }
    const primero = [...corte.keys()].sort()[0];
    const m = new Map();
    const alCorte = new Map();
    for (const t of tickets) for (const who of [t.tecnico, 'Todos']) {
      const id = [t.mes, who, t.app].join('|');
      if (!m.has(id)) m.set(id, { k: '', mes: t.mes, tecnico: who, app: t.app, tickets: 0, previo_corte: null, cambio: null });
      m.get(id).tickets += 1;
    }
    for (const mes of corte.keys()) {
      const p = prev(mes);
      for (const t of tickets) if (t.mes === p && Number(t.dia.slice(8)) <= corte.get(mes)) for (const who of [t.tecnico, 'Todos']) {
        const id = [mes, who, t.app].join('|');
        alCorte.set(id, (alCorte.get(id) || 0) + 1);
      }
    }
    for (const [id, r] of m) if (r.mes !== primero) {
      r.previo_corte = alCorte.get(id) || 0;
      r.cambio = r.tickets - r.previo_corte;
    }
    const rows = [...m.values()].sort((a, b) => (a.mes < b.mes ? 1 : a.mes > b.mes ? -1 : b.tickets - a.tickets));
    rows.forEach((r, i) => { r.k = 'a' + i; });
    return rows;
  },
});

/* ---------- utilidades ---------- */

const es = d3.timeFormatLocale({
  dateTime: '%A, %e de %B de %Y, %X', date: '%d/%m/%Y', time: '%H:%M:%S', periods: ['AM', 'PM'],
  days: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  shortDays: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
  months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  shortMonths: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
});
const pDia = d3.utcParse('%Y-%m-%d');
const fDiaLargo = (s) => es.utcFormat('%A %-d de %B')(pDia(s));
const fDiaOpt = (s) => es.utcFormat('%a %-d %b %Y')(pDia(s));
const fDiaTick = (s) => es.utcFormat('%a %-d')(pDia(s));
const fCorto = (s) => es.utcFormat('%-d %b')(pDia(s));
const fSemana = (s) => { const a = pDia(s); const b = new Date(a.getTime() + 6 * 864e5); return es.utcFormat('%-d %b')(a) + ' al ' + es.utcFormat('%-d %b %Y')(b); };
const fMes = (s) => es.utcFormat('%B de %Y')(pDia(s + '-01'));
const fMesTick = (s) => es.utcFormat('%b')(pDia(s + '-01'));
const f1 = (v) => (v == null ? '—' : Number(v).toFixed(1));
const f2 = (v) => (v == null ? '—' : Number(v).toFixed(2));
const sg = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + v);
const finde = (s) => { const d = pDia(s).getUTCDay(); return d === 0 || d === 6; };
const colorDe = (t) => dash.colors[Math.max(0, TEC.indexOf(t)) % dash.colors.length];

const rowsOf = (id) => { const s = dash.data(id); return s.status === 'ok' && Array.isArray(s.data) ? s.data : null; };
const lista = (id, campo) => { const r = rowsOf(id); return r ? [...new Set(r.map((x) => x[campo]))].sort().reverse() : []; };
const elegir = (l, v) => (l.includes(v) ? v : (l[0] ?? null));
const curDia = () => elegir(lista('dia_tecnico', 'dia'), dash.params().dia);
const curSem = () => elegir(lista('semana_tecnico', 'semana'), dash.params().semana);
const curMes = () => elegir(lista('mes_tecnico', 'mes'), dash.params().mes);
const curTec = () => (TEC.includes(dash.params().tecnico) ? dash.params().tecnico : 'Todos');

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const marca = (source, field, k, text) => { const s = el('span', null, text); s.dataset.source = source; s.dataset.field = field; s.dataset.where = 'k=' + k; return s; };
const punto = (t) => { const d = el('i', 'sm-dot'); d.style.background = colorDe(t); return d; };

function palabra(name, fn) {
  dash.draw(name, (n) => { const v = fn(); if (v == null) n.textContent = '—'; else if (v instanceof Node) n.replaceChildren(v); else n.textContent = v; });
}
function selector(name, opciones, actual, etiqueta, param) {
  dash.draw(name, (sel) => {
    const l = opciones();
    sel.replaceChildren(...l.map((v) => new Option(etiqueta(v), v)));
    sel.value = actual() ?? '';
    sel.onchange = () => dash.setParams({ [param]: sel.value });
  });
}
function tabla(name, filas, columnas, vacio) {
  dash.draw(name, (tb) => {
    const rows = filas();
    if (!rows) { tb.replaceChildren(); return; }
    if (!rows.length) {
      const td = el('td', 'sm-empty', vacio || 'Sin datos para esta selección.');
      td.colSpan = columnas.length;
      const tr = el('tr'); tr.append(td); tb.replaceChildren(tr); return;
    }
    tb.replaceChildren(...rows.map((r) => {
      const tr = el('tr');
      tr.dataset.key = r.k ?? r.id;
      for (const c of columnas) {
        const td = el('td', c.cls || null);
        const v = c.v(r);
        if (v instanceof Node) td.append(v); else td.textContent = v ?? '—';
        tr.append(td);
      }
      return tr;
    }));
  });
}
function tooltip(box) {
  const t = el('div', 'sm-tip'); t.hidden = true; box.append(t);
  return {
    show(titulo, lineas, x, y) {
      t.replaceChildren(el('h5', null, titulo), ...lineas.map(([a, b, c]) => {
        const d = el('div'); const s = el('span'); if (c) { const i = el('i', 'sm-dot'); i.style.background = c; s.append(i); }
        s.append(a); d.append(s, el('b', null, b)); return d;
      }));
      t.hidden = false;
      const w = t.offsetWidth, bw = box.clientWidth;
      t.style.left = Math.max(0, Math.min(bw - w, x + 14)) + 'px';
      t.style.top = Math.max(0, y - 8) + 'px';
    },
    hide() { t.hidden = true; },
  };
}
function leyenda(nombres) {
  const l = el('div', 'sm-legend');
  for (const n of nombres) { const s = el('span'); s.append(punto(n), n); l.append(s); }
  return l;
}
function ejeY(svg, y, x0, x1, n) {
  const g = svg.append('g');
  for (const v of y.ticks(n)) {
    g.append('line').attr('x1', x0).attr('x2', x1).attr('y1', y(v)).attr('y2', y(v)).style('stroke', v === 0 ? 'var(--cds-chart-axis)' : 'var(--cds-chart-grid)');
    g.append('text').attr('x', x0 - 6).attr('y', y(v)).attr('dy', '0.32em').attr('text-anchor', 'end').text(v);
  }
}

/* ---------- pestañas y controles fijos ---------- */

const PAGINAS = ['diario', 'semanal', 'mensual'];
function abrir(id) {
  root.querySelectorAll('.sm-page').forEach((s) => { s.hidden = s.id !== id; });
  root.querySelectorAll('.sm-tab').forEach((b) => { const on = b.dataset.tab === id; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.classList.toggle('sm-on', on); });
}
root.querySelectorAll('.sm-tab').forEach((b) => b.addEventListener('click', () => { abrir(b.dataset.tab); dash.setLink(b.dataset.tab); }));
if (PAGINAS.includes(location.hash.slice(1))) abrir(location.hash.slice(1));

root.querySelectorAll('#sel-tecnico').forEach((s) => s.addEventListener('change', () => dash.setParams({ tecnico: s.value })));
root.querySelectorAll('#chk-alertas').forEach((c) => c.addEventListener('change', () => dash.setParams({ solo_alertas: c.checked })));
dash.onData(() => {
  root.querySelectorAll('#sel-tecnico').forEach((s) => { if (document.activeElement !== s) s.value = curTec(); });
  root.querySelectorAll('#chk-alertas').forEach((c) => { c.checked = dash.params().solo_alertas === true; });
});
root.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
  const pre = root.querySelector('[data-draw="' + b.dataset.copy + '"]');
  if (!pre) return;
  const ok = () => { b.querySelectorAll('.sm-c0').forEach((n) => { n.hidden = true; }); b.querySelectorAll('.sm-c1').forEach((n) => { n.hidden = false; });
    setTimeout(() => { b.querySelectorAll('.sm-c0').forEach((n) => { n.hidden = false; }); b.querySelectorAll('.sm-c1').forEach((n) => { n.hidden = true; }); }, 1800); };
  try { await navigator.clipboard.writeText(pre.textContent); ok(); }
  catch (e) { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
}));

/* ---------- Diario ---------- */

const filaDia = (tec) => { const r = rowsOf('dia_tecnico'); const d = curDia(); return r && d ? r.find((x) => x.k === d + '_' + tec) || { k: d + '_' + tec, dia: d, tecnico: tec, tickets: 0, con_alertas: 0, horas: 0, cumplen: 0, vacia: true } : null; };

selector('sel_dia', () => lista('dia_tecnico', 'dia').slice(0, 120), curDia, fDiaOpt, 'dia');
palabra('meta', () => String(META));
palabra('d_fecha', () => { const d = curDia(); return d ? fDiaLargo(d) : null; });
palabra('d_tickets', () => { const r = filaDia('Todos'); return r ? (r.vacia ? '0' : marca('dia_tecnico', 'tickets', r.k, String(r.tickets))) : null; });
palabra('d_cumplen', () => { const r = filaDia('Todos'); return r ? (r.vacia ? '0' : marca('dia_tecnico', 'cumplen', r.k, String(r.cumplen))) : null; });

dash.draw('d_cards', (box) => {
  if (!rowsOf('dia_tecnico') || !curDia()) { box.replaceChildren(); return; }
  const fd = finde(curDia());
  box.replaceChildren(...TEC.map((t) => {
    const r = filaDia(t);
    const card = el('div', 'sm-card');
    const top = el('div', 'sm-card-top');
    const nom = el('span', 'sm-name'); nom.append(punto(t), t);
    let pill;
    if (fd) pill = el('span', 'sm-pill', 'Fin de semana');
    else if (r.horas >= META) pill = el('span', 'sm-pill sm-ok', 'Cumple');
    else if (r.horas > 0) pill = el('span', 'sm-pill sm-warn', 'Faltan ' + f1(META - r.horas) + ' h');
    else pill = el('span', 'sm-pill sm-bad', 'Sin horas');
    top.append(nom, pill);
    const big = el('div', 'sm-big');
    big.append(r.vacia ? '0.0' : marca('dia_tecnico', 'horas', r.k, f1(r.horas)), el('small', null, 'h de ' + META));
    const meter = el('div', 'sm-meter'); const bar = el('i');
    bar.style.width = Math.min(100, (r.horas / META) * 100) + '%'; bar.style.background = colorDe(t); meter.append(bar);
    const foot = el('div', 'sm-foot');
    foot.append(r.vacia ? '0' : marca('dia_tecnico', 'tickets', r.k, String(r.tickets)), ' tickets · ', r.vacia ? '0' : marca('dia_tecnico', 'con_alertas', r.k, String(r.con_alertas)), ' con alertas');
    card.append(top, big, meter, foot);
    return card;
  }));
});

dash.draw('d_hist', (box) => {
  const data = rowsOf('dia_tecnico'); const dia = curDia();
  if (!data || !dia) { box.replaceChildren('—'); return; }
  const dias = lista('dia_tecnico', 'dia').filter((d) => d <= dia).slice(0, 10).reverse();
  const by = new Map(data.map((r) => [r.k, r]));
  const val = (d, t) => by.get(d + '_' + t)?.horas ?? 0;
  const W = Math.max(280, box.clientWidth || 600), H = 230, m = { t: 16, r: 62, b: 24, l: 30 };
  const x0 = d3.scaleBand().domain(dias).range([m.l, W - m.r]).paddingInner(0.28).paddingOuter(0.12);
  const x1 = d3.scaleBand().domain(TEC).range([0, x0.bandwidth()]).paddingInner(0.14);
  const y = d3.scaleLinear().domain([0, Math.max(META + 1, d3.max(dias, (d) => d3.max(TEC, (t) => val(d, t))) || 0)]).nice().range([H - m.b, m.t]);
  const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('height', H).attr('role', 'img')
    .attr('aria-label', 'Horas registradas por día y por técnico en los últimos 10 días con actividad, con la meta de ' + META + ' horas.');
  ejeY(svg, y, m.l, W - m.r, 4);
  const paso = x0.step() < 46 ? 2 : 1;
  dias.forEach((d, i) => {
    const g = svg.append('g').attr('transform', `translate(${x0(d)},0)`);
    for (const t of TEC) {
      const v = val(d, t);
      g.append('rect').attr('x', x1(t)).attr('width', x1.bandwidth()).attr('y', y(v)).attr('height', Math.max(0, y(0) - y(v))).attr('rx', Math.min(3, x1.bandwidth() / 2)).style('fill', colorDe(t));
    }
    if ((dias.length - 1 - i) % paso === 0) svg.append('text').attr('x', x0(d) + x0.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').attr('class', d === dia ? 'sm-strong' : null).text(fDiaTick(d));
  });
  svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(META)).attr('y2', y(META)).style('stroke', 'var(--cds-chart-reference)').style('stroke-dasharray', '4 3');
  svg.append('text').attr('x', W - m.r + 6).attr('y', y(META)).attr('dy', '0.32em').text('Meta ' + META + ' h');
  const tip = (box.replaceChildren(leyenda(TEC), svg.node()), tooltip(box));
  const top = svg.node().getBoundingClientRect().top - box.getBoundingClientRect().top;
  dias.forEach((d) => {
    svg.append('rect').attr('x', x0(d) - x0.step() * 0.14).attr('width', x0.step()).attr('y', m.t).attr('height', H - m.t).style('fill', 'transparent').style('cursor', 'pointer')
      .on('pointermove', (ev) => { const p = d3.pointer(ev, box); tip.show(fDiaLargo(d), TEC.map((t) => [t, f1(val(d, t)) + ' h', colorDe(t)]), p[0], Math.max(top, p[1])); })
      .on('pointerleave', () => tip.hide())
      .on('click', () => dash.setParams({ dia: d }));
  });
});

tabla('d_tabla', () => {
  const r = rowsOf('tickets'); const d = curDia(); if (!r || !d) return null;
  const tec = curTec(), solo = dash.params().solo_alertas === true;
  return r.filter((t) => t.dia === d && (tec === 'Todos' || t.tecnico === tec) && (!solo || t.n_alertas > 0)).sort((a, b) => (a.creado < b.creado ? -1 : 1));
}, [
  { cls: 'sm-nw', v: (t) => { const a = el('a', null, '#' + t.ref); a.href = ODOO + t.id; a.target = '_blank'; a.rel = 'noopener'; return a; } },
  { cls: 'sm-nw', v: (t) => t.creado.slice(11) },
  { cls: 'sm-nw', v: (t) => { const s = el('span', 'sm-name'); s.style.fontWeight = 'inherit'; s.append(punto(t.tecnico), t.tecnico); return s; } },
  { cls: 'sm-title', v: (t) => t.titulo },
  { v: (t) => t.app + ' › ' + t.modulo },
  { cls: 'sm-nw', v: (t) => { const s = el('span', null, t.tipo); if (t.tipo_origen !== 'prefijo') s.append(el('span', 'sm-muted', ' (inferido)')); return s; } },
  { cls: 'sm-n', v: (t) => f2(t.horas) },
  { v: (t) => { if (!t.alertas) return el('span', 'sm-muted', 'Sin alertas'); const c = el('div', 'sm-chips'); for (const a of t.alertas.split('; ')) c.append(el('span', 'sm-chip', a)); return c; } },
], 'No hay tickets para este día con los filtros elegidos.');

/* ---------- Semanal ---------- */

const filaSem = (tec, sem) => { const r = rowsOf('semana_tecnico'); const s = sem || curSem(); return r && s ? r.find((x) => x.k === s + '_' + tec) || null : null; };
const repSem = () => { const r = rowsOf('grupos_semana'); const s = curSem(); return r && s ? r.filter((x) => x.semana === s && x.tecnico === curTec() && x.tickets >= 2).slice(0, 12) : null; };
const solSem = () => { const r = rowsOf('solicitantes_semana'); const s = curSem(); return r && s ? r.filter((x) => x.semana === s && x.tecnico === curTec()).slice(0, 10) : null; };

selector('sel_sem', () => lista('semana_tecnico', 'semana'), curSem, fSemana, 'semana');
palabra('s_fecha', () => { const s = curSem(); return s ? fSemana(s) : null; });
palabra('s_tickets', () => { const r = filaSem(curTec()); return rowsOf('semana_tecnico') ? (r ? marca('semana_tecnico', 'tickets', r.k, String(r.tickets)) : '0') : null; });
palabra('s_horas', () => { const r = filaSem(curTec()); return rowsOf('semana_tecnico') ? (r ? marca('semana_tecnico', 'horas', r.k, f1(r.horas)) : '0.0') : null; });
palabra('s_cambio', () => { const r = filaSem(curTec()); return r && r.cambio != null ? marca('semana_tecnico', 'cambio', r.k, sg(r.cambio)) : null; });

tabla('s_tec', () => (rowsOf('semana_tecnico') && curSem() ? [...TEC, 'Todos'].map((t) => filaSem(t)).filter(Boolean) : null), [
  { cls: 'sm-nw', v: (r) => { if (r.tecnico === 'Todos') return el('b', null, 'Total'); const s = el('span', 'sm-name'); s.style.fontWeight = 'inherit'; s.append(punto(r.tecnico), r.tecnico); return s; } },
  { cls: 'sm-n', v: (r) => String(r.tickets) },
  { cls: 'sm-n', v: (r) => f1(r.horas) },
  { cls: 'sm-n', v: (r) => (r.tickets_previa == null ? '—' : String(r.tickets_previa)) },
  { cls: 'sm-n', v: (r) => sg(r.cambio) },
]);

dash.draw('s_trend', (box) => {
  const data = rowsOf('semana_tecnico'); const sem = curSem();
  if (!data || !sem) { box.replaceChildren('—'); return; }
  const sems = lista('semana_tecnico', 'semana').filter((s) => s <= sem).slice(0, 12).reverse();
  const by = new Map(data.map((r) => [r.k, r]));
  const val = (s, t) => by.get(s + '_' + t)?.tickets ?? 0;
  const W = Math.max(280, box.clientWidth || 600), H = 230;
  const ancho = W >= 480;
  const m = { t: 14, r: ancho ? 96 : 12, b: 24, l: 32 };
  const x = d3.scalePoint().domain(sems).range([m.l, W - m.r]).padding(0.3);
  const y = d3.scaleLinear().domain([0, d3.max(sems, (s) => d3.max(TEC, (t) => val(s, t))) || 1]).nice().range([H - m.b, m.t]);
  const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('height', H).attr('role', 'img')
    .attr('aria-label', 'Tickets por semana de cada técnico en las últimas 12 semanas.');
  ejeY(svg, y, m.l, W - m.r, 4);
  const paso = Math.ceil(sems.length / Math.max(2, Math.floor((W - m.l - m.r) / 54)));
  sems.forEach((s, i) => { if ((sems.length - 1 - i) % paso === 0) svg.append('text').attr('x', x(s)).attr('y', H - 6).attr('text-anchor', 'middle').attr('class', s === sem ? 'sm-strong' : null).text(fCorto(s)); });
  const guia = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).style('stroke', 'var(--cds-chart-axis)').style('visibility', 'hidden');
  const line = d3.line().x((s) => x(s));
  const fin = [];
  for (const t of TEC) {
    svg.append('path').attr('d', line.y((s) => y(val(s, t)))(sems)).style('fill', 'none').style('stroke', colorDe(t)).style('stroke-width', 2).style('stroke-linejoin', 'round');
    const u = sems[sems.length - 1];
    svg.append('circle').attr('cx', x(u)).attr('cy', y(val(u, t))).attr('r', 4).style('fill', colorDe(t)).style('stroke', 'var(--color-bg)').style('stroke-width', 2);
    fin.push({ t, y: y(val(u, t)), v: val(u, t) });
  }
  if (ancho) {
    fin.sort((a, b) => a.y - b.y);
    for (let i = 1; i < fin.length; i++) if (fin[i].y - fin[i - 1].y < 14) fin[i].y = fin[i - 1].y + 14;
    const sobra = fin[fin.length - 1].y - (H - m.b);
    if (sobra > 0) fin.forEach((f) => { f.y -= sobra; });
    for (const f of fin) svg.append('text').attr('x', x(sems[sems.length - 1]) + 10).attr('y', f.y).attr('dy', '0.32em').text(f.t.split(' ')[0] + ' ' + f.v);
  }
  const tip = (box.replaceChildren(leyenda(TEC), svg.node()), tooltip(box));
  const top = svg.node().getBoundingClientRect().top - box.getBoundingClientRect().top;
  svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b + 20).style('fill', 'transparent').style('cursor', 'pointer')
    .on('pointermove', (ev) => {
      const [px] = d3.pointer(ev, svg.node());
      const s = sems.reduce((a, b) => (Math.abs(x(b) - px) < Math.abs(x(a) - px) ? b : a));
      guia.attr('x1', x(s)).attr('x2', x(s)).style('visibility', 'visible');
      const p = d3.pointer(ev, box);
      tip.show('Semana del ' + fSemana(s), [...TEC].sort((a, b) => val(s, b) - val(s, a)).map((t) => [t, String(val(s, t)), colorDe(t)]), p[0], Math.max(top, p[1]));
    })
    .on('pointerleave', () => { tip.hide(); guia.style('visibility', 'hidden'); })
    .on('click', (ev) => { const [px] = d3.pointer(ev, svg.node()); dash.setParams({ semana: sems.reduce((a, b) => (Math.abs(x(b) - px) < Math.abs(x(a) - px) ? b : a)) }); });
});

tabla('s_rep', repSem, [
  { v: (r) => r.app }, { v: (r) => r.modulo }, { cls: 'sm-nw', v: (r) => r.tipo },
  { cls: 'sm-n', v: (r) => String(r.tickets) }, { cls: 'sm-n', v: (r) => f1(r.horas) }, { cls: 'sm-ex', v: (r) => r.ejemplo },
], 'Ninguna combinación se repitió en esta semana.');

tabla('s_sol', solSem, [
  { v: (r) => r.solicitante }, { cls: 'sm-n', v: (r) => String(r.tickets) }, { v: (r) => r.tema },
]);

dash.draw('s_resumen', (pre) => {
  const sem = curSem(), tec = curTec(), tot = filaSem(tec), rep = repSem(), sol = solSem();
  if (!sem || !rep || !sol || !rowsOf('semana_tecnico')) { pre.textContent = '—'; return; }
  const L = ['Análisis semanal de tickets – Mesa de Ayuda', 'Semana del ' + fSemana(sem) + (tec === 'Todos' ? '' : ' · ' + tec), ''];
  L.push('Total: ' + (tot?.tickets ?? 0) + ' tickets y ' + f1(tot?.horas ?? 0) + ' h registradas' + (tot && tot.cambio != null ? ' (semana anterior: ' + tot.tickets_previa + ' tickets, ' + sg(tot.cambio) + ').' : '.'));
  L.push('', 'Por técnico:');
  for (const t of TEC) { const r = filaSem(t); L.push('- ' + t + ': ' + (r?.tickets ?? 0) + ' tickets, ' + f1(r?.horas ?? 0) + ' h'); }
  L.push('', 'Incidentes repetitivos:');
  if (!rep.length) L.push('- Ninguno en la semana.');
  rep.slice(0, 8).forEach((r, i) => L.push((i + 1) + '. ' + r.app + ' › ' + r.modulo + ' · ' + r.tipo + ': ' + r.tickets + ' tickets (' + f1(r.horas) + ' h)'));
  L.push('', 'Usuarios frecuentes:');
  sol.slice(0, 5).forEach((r, i) => L.push((i + 1) + '. ' + r.solicitante + ': ' + r.tickets + ' tickets (' + r.tema + ')'));
  pre.textContent = L.join('\n');
});

/* ---------- Mensual ---------- */

const filaMes = (tec) => { const r = rowsOf('mes_tecnico'); const s = curMes(); return r && s ? r.find((x) => x.k === s + '_' + tec) || null : null; };
const gruposMes = (tipos, n, min) => { const r = rowsOf('grupos_mes'); const s = curMes(); return r && s ? r.filter((x) => x.mes === s && x.tecnico === curTec() && tipos.includes(x.tipo) && x.tickets >= min).slice(0, n) : null; };
const appsMes = () => { const r = rowsOf('apps_mes'); const s = curMes(); return r && s ? r.filter((x) => x.mes === s && x.tecnico === curTec()).slice(0, 10) : null; };
const tendencia = (r) => (!r || r.cambio_pct == null ? null : r.cambio_pct > 5 ? 'en aumento' : r.cambio_pct < -5 ? 'disminuyendo' : 'estables');

selector('sel_mes', () => lista('mes_tecnico', 'mes'), curMes, fMes, 'mes');
palabra('m_fecha', () => { const s = curMes(); return s ? fMes(s) : null; });
palabra('m_tickets', () => { const r = filaMes(curTec()); return rowsOf('mes_tecnico') ? (r ? marca('mes_tecnico', 'tickets', r.k, String(r.tickets)) : '0') : null; });
palabra('m_previo', () => { const r = filaMes(curTec()); return r && r.previo_corte != null ? marca('mes_tecnico', 'previo_corte', r.k, String(r.previo_corte)) : null; });
palabra('m_tend', () => tendencia(filaMes(curTec())));
palabra('m_pct', () => { const r = filaMes(curTec()); return r && r.cambio_pct != null ? marca('mes_tecnico', 'cambio_pct', r.k, sg(r.cambio_pct)) : null; });

dash.draw('m_bars', (box) => {
  const data = rowsOf('mes_tecnico'); const mes = curMes(); const tec = curTec();
  if (!data || !mes) { box.replaceChildren('—'); return; }
  const meses = lista('mes_tecnico', 'mes').reverse();
  const by = new Map(data.map((r) => [r.k, r]));
  const fila = (s) => by.get(s + '_' + tec);
  const val = (s) => fila(s)?.tickets ?? 0;
  const ultimo = meses[meses.length - 1];
  const W = Math.max(280, box.clientWidth || 600), H = 230, m = { t: 22, r: 6, b: 24, l: 36 };
  const x = d3.scaleBand().domain(meses).range([m.l, W - m.r]).padding(0.3);
  const y = d3.scaleLinear().domain([0, d3.max(meses, val) || 1]).nice().range([H - m.b, m.t]);
  const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('height', H).attr('role', 'img')
    .attr('aria-label', 'Tickets por mes' + (tec === 'Todos' ? '' : ' de ' + tec) + '. El último mes está incompleto.');
  ejeY(svg, y, m.l, W - m.r, 4);
  const bw = Math.min(x.bandwidth(), 56);
  const tip = (box.replaceChildren(svg.node()), tooltip(box));
  meses.forEach((s) => {
    const cx = x(s) + x.bandwidth() / 2, v = val(s);
    svg.append('rect').attr('x', cx - bw / 2).attr('width', bw).attr('y', y(v)).attr('height', Math.max(0, y(0) - y(v))).attr('rx', 4)
      .style('fill', tec === 'Todos' ? dash.colors[0] : colorDe(tec)).style('opacity', s === ultimo ? 0.55 : 1);
    svg.append('text').attr('x', cx).attr('y', y(v) - 6).attr('text-anchor', 'middle').attr('class', s === mes ? 'sm-strong' : null).text(v);
    svg.append('text').attr('x', cx).attr('y', H - 6).attr('text-anchor', 'middle').attr('class', s === mes ? 'sm-strong' : null).text(fMesTick(s) + (s === ultimo ? '*' : ''));
    svg.append('rect').attr('x', x(s)).attr('width', x.bandwidth()).attr('y', m.t).attr('height', H - m.t).style('fill', 'transparent').style('cursor', 'pointer')
      .on('pointermove', (ev) => { const p = d3.pointer(ev, box); const r = fila(s); tip.show(fMes(s) + (s === ultimo ? ' (en curso)' : ''), [['Tickets', String(v)], ['Horas', f1(r?.horas ?? 0)], ['Mes anterior al mismo día', r?.previo_corte == null ? '—' : String(r.previo_corte)]], p[0], p[1]); })
      .on('pointerleave', () => tip.hide())
      .on('click', () => dash.setParams({ mes: s }));
  });
  box.append(el('div', 'sm-sub', '* Mes en curso, incompleto.'));
});

tabla('m_tec', () => (rowsOf('mes_tecnico') && curMes() ? [...TEC, 'Todos'].map((t) => filaMes(t)).filter(Boolean) : null), [
  { cls: 'sm-nw', v: (r) => { if (r.tecnico === 'Todos') return el('b', null, 'Total'); const s = el('span', 'sm-name'); s.style.fontWeight = 'inherit'; s.append(punto(r.tecnico), r.tecnico); return s; } },
  { cls: 'sm-n', v: (r) => String(r.tickets) },
  { cls: 'sm-n', v: (r) => f1(r.horas) },
  { cls: 'sm-n', v: (r) => (r.previo_corte == null ? '—' : String(r.previo_corte)) },
  { cls: 'sm-n', v: (r) => sg(r.cambio_pct) },
]);

const colsGrupo = [
  { v: (r) => r.app }, { v: (r) => r.modulo },
  { cls: 'sm-n', v: (r) => String(r.tickets) }, { cls: 'sm-n', v: (r) => f1(r.horas) },
  { cls: 'sm-n', v: (r) => String(r.min_ticket) }, { cls: 'sm-n', v: (r) => String(r.meses_seguidos) },
  { cls: 'sm-ex', v: (r) => r.ejemplo },
];
const autoMes = () => gruposMes(['Configuración de sistema'], 8, 3);
const defMes = () => gruposMes(['Error de sistema'], 8, 3);
const capMes = () => gruposMes(['Error de usuario', 'Falta de capacitación'], 8, 2);
tabla('m_auto', autoMes, colsGrupo, 'Ninguna solicitud se repitió 3 veces o más en el mes.');
tabla('m_def', defMes, colsGrupo, 'Ningún error de sistema se repitió 3 veces o más en el mes.');
tabla('m_cap', capMes, [
  { v: (r) => r.app }, { v: (r) => r.modulo }, { cls: 'sm-nw', v: (r) => r.tipo }, { cls: 'sm-n', v: (r) => String(r.tickets) },
], 'Sin temas repetidos en el mes.');
tabla('m_apps', appsMes, [
  { v: (r) => r.app }, { cls: 'sm-n', v: (r) => String(r.tickets) },
  { cls: 'sm-n', v: (r) => (r.previo_corte == null ? '—' : String(r.previo_corte)) }, { cls: 'sm-n', v: (r) => sg(r.cambio) },
]);

dash.draw('m_resumen', (pre) => {
  const mes = curMes(), tec = curTec(), tot = filaMes(tec), au = autoMes(), de = defMes(), ca = capMes(), ap = appsMes();
  if (!mes || !au || !de || !ca || !ap || !rowsOf('mes_tecnico')) { pre.textContent = '—'; return; }
  const L = ['Análisis mensual de tickets – Mesa de Ayuda', fMes(mes) + (tot?.corte_dia ? ' (datos hasta el día ' + tot.corte_dia + ')' : '') + (tec === 'Todos' ? '' : ' · ' + tec), ''];
  L.push('Tendencia: ' + (tot?.tickets ?? 0) + ' tickets y ' + f1(tot?.horas ?? 0) + ' h.' + (tot && tot.previo_corte != null ? ' Al mismo día del mes anterior iban ' + tot.previo_corte + ' (' + sg(tot.cambio_pct) + '%): las incidencias están ' + tendencia(tot) + '.' : ''));
  L.push('', 'Por técnico:');
  for (const t of TEC) { const r = filaMes(t); L.push('- ' + t + ': ' + (r?.tickets ?? 0) + ' tickets, ' + f1(r?.horas ?? 0) + ' h'); }
  const bloque = (titulo, rows, extra) => { L.push('', titulo); if (!rows.length) L.push('- Nada repetido este mes.'); rows.slice(0, 6).forEach((r, i) => L.push((i + 1) + '. ' + r.app + ' › ' + r.modulo + extra(r))); };
  bloque('¿Qué podemos automatizar? (solicitudes de configuración más frecuentes)', au, (r) => ': ' + r.tickets + ' tickets, ' + r.min_ticket + ' min por ticket, ' + r.meses_seguidos + ' meses seguidos');
  bloque('¿Qué necesita solución definitiva? (errores de sistema más repetidos)', de, (r) => ': ' + r.tickets + ' tickets, ' + f1(r.horas) + ' h, ' + r.meses_seguidos + ' meses seguidos');
  bloque('Temas para capacitación:', ca, (r) => ' · ' + r.tipo + ': ' + r.tickets + ' tickets');
  L.push('', '¿Estamos creciendo en incidencias? Por aplicación, frente al mes anterior al mismo día:');
  ap.slice(0, 6).forEach((r) => L.push('- ' + r.app + ': ' + r.tickets + ' tickets (' + (r.cambio == null ? 'sin mes anterior' : sg(r.cambio)) + ')'));
  pre.textContent = L.join('\n');
});

// KPI Mesa de Ayuda (indicadores de desempeño): tabla de medición por técnico, KPI por técnico, PDF (imprimir) y Excel.
// Misma lógica que mesa_ayuda_config.RUBROS / indicadores.py y que el tablero 56 de Odoo.
(function () {
  'use strict';

  const MARGEN_MIN = 20;
  const RUBROS = [
    { nombre: '% de tickets cerrados en tiempo correcto', peso: 0.35, meta: 0.93, pct: true },
    { nombre: 'Promedio de tiempo efectivo por ticket (min)', peso: 0.20, meta: 25, pct: false },
    { nombre: 'Promedio de tiempo abierto por ticket (min)', peso: 0.25, meta: 50, pct: false },
    { nombre: '% de tickets cerrados durante el turno', peso: 0.20, meta: 0.93, pct: true },
  ];
  const TECNICOS = [[446, 'Técnico A'], [3554, 'Técnico B'], [3253, 'Técnico C'], [267, 'ex-técnico']];
  const $ = (id) => document.getElementById(id);
  const hoyGT = () => new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
  const pct = (x) => Math.round(x * 100) + '%';
  const n1 = (x) => (Math.round(x * 10) / 10).toLocaleString('es-GT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  let filas = [];      // una por ticket, ya con valido / finalizado
  let consultado = '';

  /* ---------- datos ---------- */

  function utc(s) { return s ? Date.parse(s.replace(' ', 'T') + 'Z') : NaN; }
  function gt(s) {
    if (!s) return '';
    return new Date(utc(s) - 6 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
  }

  function fila(r) {
    const ef = r.total_hours_spent || 0;
    const a = utc(r.cn003_fecha_apertura_reporte), c = utc(r.cn003_fecha_cierre_reporte);
    let ab = isNaN(a) || isNaN(c) ? 0 : (c - a) / 3600e3;
    let nota = '';
    if (ab < 0) { ab = 0; nota = 'Cierre anterior a la apertura'; }
    return {
      ticket: r.ticket_ref || String(r.id), titulo: r.name || '', cliente: r.partner_id ? r.partner_id[1] : '',
      uid: r.user_id[0], tecnico: r.user_id[1], etapa: r.stage_id ? r.stage_id[1] : '',
      creado: gt(r.create_date), apertura: gt(r.cn003_fecha_apertura_reporte), cierre: gt(r.cn003_fecha_cierre_reporte),
      ef, ab, dif: ab - ef, nota,
      valido: Math.abs(ab - ef) * 60 <= MARGEN_MIN + 0.001 ? 1 : 0,
      finalizado: (r.stage_id && String(r.stage_id[1]).startsWith('50')) ? 1 : 0,
    };
  }

  async function cargar(desde, hasta) {
    const out = [];
    for (let p = 0; p < 40; p++) {
      const r = await fetch(`/api/indicadores?desde=${desde}&hasta=${hasta}&p=${p}`, { credentials: 'same-origin' });
      if (!r.ok) {
        let m = 'Error ' + r.status;
        try { m = (await r.json()).error || m; } catch (e) { /* sin cuerpo */ }
        throw new Error(m);
      }
      const lote = await r.json();
      out.push(...lote);
      if (lote.length < 1000) break;
    }
    return out.map(fila);
  }

  function resumen(fs) {
    const n = fs.length;
    if (!n) return { n: 0 };
    const ef = fs.reduce((s, f) => s + f.ef, 0) / n * 60;
    const ab = fs.reduce((s, f) => s + f.ab, 0) / n * 60;
    const ok = fs.reduce((s, f) => s + f.valido, 0);
    const fin = fs.reduce((s, f) => s + f.finalizado, 0);
    const res = [ok / n, ef ? RUBROS[1].meta / ef : 0, ab ? RUBROS[2].meta / ab : 0, fin / n];
    const enMeta = [res[0] >= RUBROS[0].meta, ef > 0 && ef <= RUBROS[1].meta, ab > 0 && ab <= RUBROS[2].meta, res[3] >= RUBROS[3].meta];
    const notas = res.map((x, i) => x * RUBROS[i].peso);
    return { n, ok, fin, ef, ab, res, enMeta, notas, nota: notas.reduce((s, x) => s + x, 0) * 100, nEnMeta: enMeta.filter(Boolean).length };
  }

  const seleccion = () => {
    const v = $('tec').value;
    return v === 'todos' ? TECNICOS : TECNICOS.filter(([u]) => String(u) === v);
  };
  const deTecnico = (uid) => filas.filter((f) => f.uid === uid);

  /* ---------- pantalla ---------- */

  function td(t, cls) { const e = document.createElement('td'); e.textContent = t; if (cls) e.className = cls; return e; }
  function th(t, cls) { const e = document.createElement('th'); e.textContent = t; if (cls) e.className = cls; return e; }
  function tabla(cab, cuerpo, tot) {
    const t = document.createElement('table');
    const hr = document.createElement('tr');
    cab.forEach((c, i) => hr.appendChild(th(c, i ? 'n' : '')));
    t.appendChild(hr);
    cuerpo.forEach((f) => {
      const tr = document.createElement('tr');
      f.forEach((c, i) => tr.appendChild(td(c, i ? 'n' : '')));
      if (tot && f === cuerpo[cuerpo.length - 1]) tr.className = 'tot';
      t.appendChild(tr);
    });
    return t;
  }
  function seccion(titulo, nota) {
    const s = document.createElement('section');
    const h = document.createElement('h2'); h.textContent = titulo; s.appendChild(h);
    if (nota) { const p = document.createElement('p'); p.className = 'nota'; p.textContent = nota; s.appendChild(p); }
    return s;
  }

  function pintar() {
    const cont = $('resultado');
    cont.textContent = '';
    const d = $('desde').value, h = $('hasta').value;
    $('periodo').textContent = `Periodo ${d} a ${h} · tickets creados en el periodo · consultado ${consultado}`;

    // Tabla de medición de resultados
    const s1 = seccion('Tabla de medición de resultados en manejo de tickets',
      `Correcto = tiempo abierto y tiempo efectivo difieren ${MARGEN_MIN} min o menos. Nota = suma de peso × resultado.`);
    const cuerpo = [];
    for (const [uid, nombre] of seleccion().concat([[null, 'Equipo']])) {
      const r = resumen(uid ? deTecnico(uid) : filas.filter((f) => seleccion().some(([u]) => u === f.uid)));
      if (!r.n) { cuerpo.push([nombre, '0', '', '', '', '', '', '', '', '', '', '']); continue; }
      cuerpo.push([nombre, r.n, r.ok, pct(r.ok / r.n), n1(r.ef), pct(r.res[1]), n1(r.ab), pct(r.res[2]), r.fin, pct(r.res[3]),
        n1(r.nota), r.nEnMeta + ' de 4']);
    }
    s1.appendChild(tabla(['Técnico', 'Tickets', 'Correctos', '% correctos', 'Efectivo min', 'Resultado', 'Abierto min', 'Resultado',
      'Finalizados', '% en turno', 'Nota final', 'En meta'], cuerpo, true));
    cont.appendChild(s1);

    // Rubros
    const s2 = seccion('Rubros, pesos y metas');
    s2.appendChild(tabla(['Rubro', 'Peso', 'Meta'], RUBROS.map((r) => [r.nombre, pct(r.peso), r.pct ? pct(r.meta) : String(r.meta)])));
    cont.appendChild(s2);

    // KPI por técnico
    for (const [uid, nombre] of seleccion()) {
      const fs = deTecnico(uid), r = resumen(fs);
      const s = seccion('KPI · ' + nombre, r.n ? `${r.n} tickets del periodo.` : 'Sin tickets en el periodo.');
      s.className = 'tec';
      if (r.n) {
        const cu = RUBROS.map((ru, i) => [ru.nombre, pct(ru.peso), ru.pct ? pct(ru.meta) : String(ru.meta),
          ru.pct ? pct(r.res[i]) : pct(r.res[i]), pct(r.notas[i]), r.enMeta[i] ? 'En meta' : 'Por mejorar']);
        cu.push(['Nota final', '100%', '', '', n1(r.nota), r.nEnMeta + ' de 4']);
        s.appendChild(tabla(['Rubro', 'Peso', 'Meta', 'Resultado', 'Nota', 'Estado'], cu, true));
        const de = document.createElement('p');
        de.className = 'nota';
        de.textContent = `Correctos ${r.ok} de ${r.n} · efectivo promedio ${n1(r.ef)} min · abierto promedio ${n1(r.ab)} min · finalizados ${r.fin} de ${r.n}.`;
        s.appendChild(de);
        const fuera = fs.filter((f) => !f.valido);
        if (fuera.length) {
          const t2 = seccion(`Tickets fuera del margen (${fuera.length})`);
          t2.className = 'sub';
          t2.appendChild(tabla(['Ticket', 'Etapa', 'Apertura', 'Cierre', 'Efectivo min', 'Abierto min', 'Dif. min'],
            fuera.slice(0, 40).map((f) => [f.ticket, f.etapa, f.apertura, f.cierre, n1(f.ef * 60), n1(f.ab * 60), n1(f.dif * 60)])));
          if (fuera.length > 40) { const p = document.createElement('p'); p.className = 'nota'; p.textContent = `Se muestran 40 de ${fuera.length}; el Excel trae todos.`; t2.appendChild(p); }
          s.appendChild(t2);
        }
      }
      cont.appendChild(s);
    }
  }

  async function consultar() {
    const d = $('desde').value, h = $('hasta').value;
    $('estado').textContent = 'Consultando Odoo…';
    ['bpdf', 'bxls', 'bgo'].forEach((i) => { $(i).disabled = true; });
    try {
      filas = await cargar(d, h);
      consultado = new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') + ' (hora de Guatemala)';
      $('estado').textContent = `${filas.length} tickets cargados.`;
      pintar();
      return true;
    } catch (e) {
      $('estado').textContent = 'No se pudo consultar: ' + e.message;
      return false;
    } finally {
      ['bpdf', 'bxls', 'bgo'].forEach((i) => { $(i).disabled = false; });
    }
  }

  /* ---------- Excel (.xlsx mínimo, sin librerías) ---------- */

  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u) => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const enc = new TextEncoder();

  function zip(archivos) { // sin compresión (método 0)
    const partes = [], central = [];
    let pos = 0;
    for (const [nombre, texto] of archivos) {
      const nom = enc.encode(nombre), dat = enc.encode(texto), crc = crc32(dat);
      const loc = new DataView(new ArrayBuffer(30));
      loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true);
      loc.setUint32(14, crc, true); loc.setUint32(18, dat.length, true); loc.setUint32(22, dat.length, true); loc.setUint16(26, nom.length, true);
      partes.push(new Uint8Array(loc.buffer), nom, dat);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
      cen.setUint32(16, crc, true); cen.setUint32(20, dat.length, true); cen.setUint32(24, dat.length, true); cen.setUint16(28, nom.length, true);
      cen.setUint32(42, pos, true);
      central.push(new Uint8Array(cen.buffer), nom);
      pos += 30 + nom.length + dat.length;
    }
    const tam = central.reduce((s, x) => s + x.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
    fin.setUint32(12, tam, true); fin.setUint32(16, pos, true);
    return new Blob([...partes, ...central, new Uint8Array(fin.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const col = (i) => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
  // Celda: texto, número o {v, s} con estilo (1 negrita, 2 0.0, 3 0%).
  function hoja(rows) {
    const xs = rows.map((fila, r) => '<row r="' + (r + 1) + '">' + fila.map((c, i) => {
      if (c === '' || c == null) return '';
      const v = typeof c === 'object' ? c.v : c, s = typeof c === 'object' ? c.s : 0, ref = col(i) + (r + 1);
      return typeof v === 'number' && isFinite(v)
        ? `<c r="${ref}" s="${s}"><v>${v}</v></c>`
        : `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join('') + '</row>').join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<sheetViews><sheetView workbookViewId="0"/></sheetViews><cols><col min="1" max="1" width="44" customWidth="1"/><col min="2" max="14" width="18" customWidth="1"/></cols>'
      + '<sheetData>' + xs + '</sheetData></worksheet>';
  }

  function libro(hojas) {
    const nombres = []; // nombres únicos, ≤ 31 caracteres, sin caracteres no válidos
    for (const [n] of hojas) {
      let b = n.replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31), k = 1;
      while (nombres.includes(b)) b = b.slice(0, 28) + ' ' + (++k);
      nombres.push(b);
    }
    const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '</Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    const wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
      + nombres.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>';
    const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
    const estilos = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0"/></numFmts>'
      + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
      + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '</styleSheet>';
    return zip([['[Content_Types].xml', ct], ['_rels/.rels', rels], ['xl/workbook.xml', wb], ['xl/_rels/workbook.xml.rels', wbRels], ['xl/styles.xml', estilos]]
      .concat(hojas.map(([, rows], i) => [`xl/worksheets/sheet${i + 1}.xml`, hoja(rows)])));
  }

  const B = (v) => ({ v, s: 1 }), N1 = (v) => ({ v: Math.round(v * 10) / 10, s: 2 }), P = (v) => ({ v, s: 3 });

  function excel() {
    const d = $('desde').value, h = $('hasta').value, sel = seleccion();
    const hojas = [];
    const res = [[B('KPI Mesa de Ayuda'), ''], ['Periodo', `${d} a ${h} (tickets creados en el periodo)`], ['Consultado', consultado], [],
      ['Técnico', 'Tickets', 'Correctos', '% correctos', 'Efectivo min', 'Resultado', 'Abierto min', 'Resultado', 'Finalizados', '% en turno', 'Nota final', 'En meta'].map(B)];
    for (const [uid, nombre] of sel.concat([[null, 'Equipo']])) {
      const r = resumen(uid ? deTecnico(uid) : filas.filter((f) => sel.some(([u]) => u === f.uid)));
      res.push(r.n ? [nombre, r.n, r.ok, P(r.ok / r.n), N1(r.ef), P(r.res[1]), N1(r.ab), P(r.res[2]), r.fin, P(r.res[3]), N1(r.nota), r.nEnMeta + ' de 4'] : [nombre, 0]);
    }
    res.push([], ['Rubro', 'Peso', 'Meta'].map(B), ...RUBROS.map((r) => [r.nombre, P(r.peso), r.pct ? P(r.meta) : r.meta]));
    hojas.push(['Resumen', res]);

    for (const [uid, nombre] of sel) {
      const fs = deTecnico(uid), r = resumen(fs);
      const rows = [[B('KPI · ' + nombre)], ['Periodo', `${d} a ${h}`], [], ['Rubro', 'Peso', 'Meta', 'Resultado', 'Nota', 'Estado'].map(B)];
      if (r.n) {
        RUBROS.forEach((ru, i) => rows.push([ru.nombre, P(ru.peso), ru.pct ? P(ru.meta) : ru.meta, P(r.res[i]), P(r.notas[i]), r.enMeta[i] ? 'En meta' : 'Por mejorar']));
        rows.push([B('Nota final'), '', '', '', N1(r.nota), r.nEnMeta + ' de 4']);
      } else rows.push(['Sin tickets en el periodo']);
      rows.push([], ['Detalle por ticket (cada columna alimenta un KPI)'].map(B),
        ['Ticket', 'Título', 'Cliente', 'Etapa', 'Creado', 'Apertura reporte', 'Cierre reporte', 'Efectivo min (KPI 2)', 'Abierto min (KPI 3)',
          'Diferencia min', 'Correcto 1/0 (KPI 1)', 'Finalizado 1/0 (KPI 4)', 'Observación'].map(B));
      fs.forEach((f) => rows.push([f.ticket, f.titulo, f.cliente, f.etapa, f.creado, f.apertura, f.cierre, N1(f.ef * 60), N1(f.ab * 60),
        N1(f.dif * 60), f.valido, f.finalizado, f.nota]));
      if (r.n) rows.push([B('Totales / promedios'), '', '', '', '', '', '', N1(r.ef), N1(r.ab), '', r.ok, r.fin]);
      hojas.push(['KPI ' + nombre, rows]);
    }
    const url = URL.createObjectURL(libro(hojas));
    const a = document.createElement('a');
    a.href = url; a.download = `KPI_Mesa_de_Ayuda_${d}_a_${h}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /* ---------- arranque ---------- */

  async function iniciar() {
    const q = new URLSearchParams(location.search);
    const hoy = hoyGT();
    $('desde').value = /^\d{4}-\d{2}-\d{2}$/.test(q.get('desde') || '') ? q.get('desde') : hoy.slice(0, 8) + '01';
    $('hasta').value = /^\d{4}-\d{2}-\d{2}$/.test(q.get('hasta') || '') ? q.get('hasta') : hoy;
    TECNICOS.forEach(([u, n]) => { const o = document.createElement('option'); o.value = String(u); o.textContent = n; $('tec').appendChild(o); });
    if (q.get('tecnico') && TECNICOS.some(([u]) => String(u) === q.get('tecnico'))) $('tec').value = q.get('tecnico');

    $('bgo').onclick = consultar;
    $('tec').onchange = () => { if (filas.length || consultado) pintar(); };
    $('bpdf').onclick = () => window.print();
    $('bxls').onclick = excel;

    const ok = await consultar();
    const accion = q.get('accion');
    if (ok && accion === 'excel') excel();
    if (ok && accion === 'pdf') setTimeout(() => window.print(), 300);
  }

  iniciar();
})();

// ═══════════════════════════════════════════
//  CALENDARIO.JS — Gestión de ejercicios
// ═══════════════════════════════════════════

let calEjercicios = [];

async function initCalendario() {
  await loadEjercicios();
  renderEjerciciosList();
}

// ─── Cargar ejercicios
async function loadEjercicios() {
  let query = sb.from('ejercicios').select('*').order('fecha_inicio', { ascending: false });
  query = applyGroupFilter(query);
  const { data, error } = await query;
  if (!error && data) calEjercicios = data;
}

// ─── Renderizar lista
function renderEjerciciosList() {
  const list  = document.getElementById('ejerciciosList');
  const count = document.getElementById('ejerciciosCount');
  if (!list) return;

  if (count) count.textContent = `${calEjercicios.length} ejercicio${calEjercicios.length !== 1 ? 's' : ''}`;

  if (!calEjercicios.length) {
    list.innerHTML = `<div class="cal-empty">No hay ejercicios registrados aún</div>`;
    return;
  }

  const activos     = calEjercicios.filter(e => e.estado === 'activo');
  const finalizados = calEjercicios.filter(e => e.estado === 'finalizado');
  const archivados  = calEjercicios.filter(e => e.estado === 'archivado');

  let html = '';

  if (activos.length) {
    html += `<div class="ej-section-label activo-label">● Activos</div>`;
    html += activos.map(e => renderEjercicioCard(e)).join('');
  }
  if (finalizados.length) {
    html += `<div class="ej-section-label">Finalizados</div>`;
    html += finalizados.map(e => renderEjercicioCard(e)).join('');
  }
  if (archivados.length) {
    html += `<div class="ej-section-label" style="opacity:0.5;">Archivados</div>`;
    html += archivados.map(e => renderEjercicioCard(e)).join('');
  }

  list.innerHTML = html;
}

function renderEjercicioCard(e) {
  const inicio  = fmtDate(e.fecha_inicio);
  const fin     = e.fecha_fin ? fmtDate(e.fecha_fin) : '—';
  const estadoClass = {
    activo: 'ej-estado-activo', finalizado: 'ej-estado-finalizado', archivado: 'ej-estado-archivado'
  }[e.estado] || '';

  return `
    <div class="ej-card">
      <div class="ej-card-header">
        <div>
          <div class="ej-card-title">${e.title}</div>
          <div class="ej-card-dates">${inicio} — ${fin} · ${e.total_dias} día${e.total_dias !== 1 ? 's' : ''}</div>
        </div>
        <span class="ej-estado ${estadoClass}">${e.estado}</span>
      </div>
      ${e.description ? `<div class="ej-card-desc">${e.description}</div>` : ''}
      <div class="ej-card-actions">
        ${e.estado === 'activo' ? `
          <button class="btn-edit" onclick="openEditEjercicio('${e.id}')">Editar</button>
          <button class="btn-action" onclick="finalizarEjercicio('${e.id}', '${e.title.replace(/'/g,"\\'")}')">Finalizar</button>
        ` : ''}
        ${e.estado === 'finalizado' ? `
          <button class="btn-action" onclick="descargarReporte('${e.id}')">⬇ Reporte PDF</button>
          <button class="btn-edit" onclick="archivarEjercicio('${e.id}')">Archivar</button>
        ` : ''}
        ${e.estado !== 'archivado' ? `
          <button class="btn-danger" onclick="confirmDeleteEjercicio('${e.id}', '${e.title.replace(/'/g,"\\'")}')">Eliminar</button>
        ` : ''}
      </div>
    </div>
  `;
}

// ─── Abrir modal nuevo ejercicio
function openNewEjercicio() {
  const get = id => document.getElementById(id);
  if (!get('ejModalTitle')) { showToast('Error: recarga la página e intenta de nuevo.'); return; }

  get('ejModalTitle').textContent = 'Nuevo Ejercicio';
  get('ejId').value               = '';
  get('ejTitle').value            = '';
  get('ejDesc').value             = '';
  get('ejFechaInicio').value      = '';
  get('ejFechaFin').value         = '';
  get('ejTotalDias').value        = '1';
  get('ejPorcentaje').value       = '75';
  get('ejError').textContent      = '';
  openModal('modalEjercicio');
}

// ─── Abrir modal editar
function openEditEjercicio(id) {
  const e = calEjercicios.find(x => x.id === id);
  if (!e) return;
  document.getElementById('ejModalTitle').textContent  = 'Editar Ejercicio';
  document.getElementById('ejId').value                = e.id;
  document.getElementById('ejTitle').value             = e.title;
  document.getElementById('ejDesc').value              = e.description || '';
  document.getElementById('ejFechaInicio').value       = e.fecha_inicio;
  document.getElementById('ejFechaFin').value          = e.fecha_fin || '';
  document.getElementById('ejTotalDias').value         = e.total_dias || 1;
  document.getElementById('ejPorcentaje').value        = e.porcentaje_minimo || 75;
  document.getElementById('ejError').textContent       = '';
  openModal('modalEjercicio');
}

// ─── Guardar ejercicio
async function saveEjercicio() {
  const id         = document.getElementById('ejId').value;
  const title      = document.getElementById('ejTitle').value.trim();
  const desc       = document.getElementById('ejDesc').value.trim();
  const inicio     = document.getElementById('ejFechaInicio').value;
  const fin        = document.getElementById('ejFechaFin').value;
  const totalDias  = parseInt(document.getElementById('ejTotalDias').value) || 1;
  const porcentaje = parseInt(document.getElementById('ejPorcentaje').value) || 75;
  const errEl      = document.getElementById('ejError');

  errEl.textContent = '';
  if (!title)  { errEl.textContent = 'El título es obligatorio.'; return; }
  if (!inicio) { errEl.textContent = 'La fecha de inicio es obligatoria.'; return; }

  const payload = {
    title, description: desc, fecha_inicio: inicio,
    fecha_fin: fin || null, total_dias: totalDias,
    porcentaje_minimo: porcentaje,
    group_id: currentUser?.group_id || null,
  };

  if (id) {
    const { error } = await sb.from('ejercicios').update(payload).eq('id', id);
    if (error) { errEl.textContent = 'Error al actualizar.'; return; }
    showToast('Ejercicio actualizado.');
  } else {
    payload.estado = 'activo';
    payload.created_by = currentUser?.id || null;
    const { error } = await sb.from('ejercicios').insert(payload);
    if (error) { errEl.textContent = 'Error al guardar.'; return; }
    showToast('Ejercicio creado.');
  }

  closeModal('modalEjercicio');
  await loadEjercicios();
  renderEjerciciosList();
}

// ─── Finalizar ejercicio
async function finalizarEjercicio(id, title) {
  document.getElementById('finalizarEjNombre').textContent = title;
  document.getElementById('finalizarEjId').value = id;
  openModal('modalFinalizarEj');
}

async function confirmarFinalizar() {
  const id = document.getElementById('finalizarEjId').value;

  // Archivar asistencia actual en asistencia_archivo
  const ej = calEjercicios.find(e => e.id === id);
  if (!ej) return;

  const { data: asistencias } = await sb
    .from('attendance')
    .select('*')
    .gte('date', ej.fecha_inicio)
    .lte('date', ej.fecha_fin || new Date().toISOString().split('T')[0]);

  if (asistencias?.length) {
    const archivo = asistencias.map(a => ({
      ejercicio_id:  id,
      member_id:     a.member_id,
      date:          a.date,
      checked_in_at: a.checked_in_at,
      group_id:      currentUser?.group_id || null,
    }));
    await sb.from('asistencia_archivo').insert(archivo);
  }

  await sb.from('ejercicios').update({ estado: 'finalizado' }).eq('id', id);

  closeModal('modalFinalizarEj');
  showToast('Ejercicio finalizado. Ya puedes descargar el reporte.');
  await loadEjercicios();
  renderEjerciciosList();
}

// ─── Archivar ejercicio (resetea asistencia)
async function archivarEjercicio(id) {
  const ej = calEjercicios.find(e => e.id === id);
  if (!ej) return;

  // Eliminar asistencia del periodo del ejercicio
  await sb.from('attendance')
    .delete()
    .gte('date', ej.fecha_inicio)
    .lte('date', ej.fecha_fin || new Date().toISOString().split('T')[0]);

  await sb.from('ejercicios').update({ estado: 'archivado' }).eq('id', id);

  showToast('Ejercicio archivado. Asistencia reseteada para nuevo ciclo.');
  await loadEjercicios();
  renderEjerciciosList();
}

// ─── Eliminar ejercicio
function confirmDeleteEjercicio(id, title) {
  document.getElementById('deleteEjNombre').textContent = title;
  document.getElementById('deleteEjId').value = id;
  openModal('modalDeleteEj');
}

async function executeDeleteEjercicio() {
  const id = document.getElementById('deleteEjId').value;
  await sb.from('ejercicios').delete().eq('id', id);
  closeModal('modalDeleteEj');
  showToast('Ejercicio eliminado.');
  await loadEjercicios();
  renderEjerciciosList();
}

// ─── Descargar reporte PDF
async function descargarReporte(ejercicioId) {
  const ej = calEjercicios.find(e => e.id === ejercicioId);
  if (!ej) return;

  showToast('Generando reporte...');

  // Cargar datos del archivo
  const { data: archivo } = await sb
    .from('asistencia_archivo')
    .select('member_id, date')
    .eq('ejercicio_id', ejercicioId);

  // Cargar miembros del grupo
  let membQuery = sb.from('members').select('member_id, full_name, shirt_size').eq('is_active', true);
  membQuery = applyGroupFilter(membQuery);
  const { data: members } = await membQuery;

  // Cargar cooperaciones
  const { data: coops } = await sb.from('cooperaciones').select('member_id, anticipo, liquidado');

  if (!members?.length) { showToast('No hay miembros para el reporte.'); return; }

  // Calcular asistencia por miembro
  const reportData = members.map(m => {
    const diasAsistidos = archivo?.filter(a => a.member_id === m.member_id).length || 0;
    const porcentaje    = Math.round((diasAsistidos / ej.total_dias) * 100);
    const coop          = coops?.find(c => c.member_id === m.member_id);
    const estadoPago    = coop?.liquidado ? 'Liquidado' : coop?.anticipo > 0 ? 'Anticipo' : 'Pendiente';

    return {
      nombre:       m.full_name,
      diasAsistidos,
      totalDias:    ej.total_dias,
      porcentaje,
      cumple:       porcentaje >= ej.porcentaje_minimo,
      talla:        m.shirt_size || '—',
      estadoPago,
    };
  }).sort((a, b) => b.porcentaje - a.porcentaje);

  generarPDF(ej, reportData);
}

// ─── Generar PDF
function generarPDF(ej, data) {
  const inicio = fmtDate(ej.fecha_inicio);
  const fin    = ej.fecha_fin ? fmtDate(ej.fecha_fin) : '—';
  const grupo  = currentGroup?.name || 'General';
  const cumplieron = data.filter(d => d.cumple).length;

  const filas = data.map((d, i) => `
    <tr style="background:${i % 2 === 0 ? '#FAF6EE' : '#fff'};">
      <td style="padding:6px 10px;border-bottom:1px solid #e8dcc8;">${d.nombre}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e8dcc8;text-align:center;font-family:monospace;">${d.diasAsistidos}/${d.totalDias}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e8dcc8;text-align:center;">
        <span style="font-weight:bold;color:${d.porcentaje >= 75 ? '#1a7a44' : d.porcentaje >= 50 ? '#c0621a' : '#c0392b'};">
          ${d.porcentaje}%
        </span>
      </td>
      <td style="padding:6px 10px;border-bottom:1px solid #e8dcc8;text-align:center;">${d.talla}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e8dcc8;text-align:center;">
        <span style="color:${d.estadoPago === 'Liquidado' ? '#1a7a44' : d.estadoPago === 'Anticipo' ? '#c0621a' : '#c0392b'};">
          ${d.estadoPago}
        </span>
      </td>
      <td style="padding:6px 10px;border-bottom:1px solid #e8dcc8;text-align:center;">
        ${d.cumple ? '✓' : '✗'}
      </td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Reporte — ${ej.title}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Georgia, serif; color: #3D2B1F; background: #fff; }
    .header { background: #3D2B1F; color: #C9A84C; padding: 24px 32px; }
    .header h1 { font-size: 1.4rem; letter-spacing: 0.1em; }
    .header p  { font-size: 0.85rem; opacity: 0.8; margin-top: 4px; }
    .meta { display: flex; gap: 32px; padding: 16px 32px; background: #FAF6EE; border-bottom: 1px solid #e8dcc8; }
    .meta-item { display: flex; flex-direction: column; gap: 2px; }
    .meta-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: #8B6914; }
    .meta-value { font-size: 0.95rem; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin-top: 0; }
    th { background: #3D2B1F; color: #C9A84C; padding: 8px 10px; font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; text-align: left; }
    .footer { padding: 16px 32px; font-size: 0.75rem; color: #8B6914; text-align: right; border-top: 1px solid #e8dcc8; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${ej.title}</h1>
    <p>${grupo}</p>
  </div>
  <div class="meta">
    <div class="meta-item"><span class="meta-label">Período</span><span class="meta-value">${inicio} — ${fin}</span></div>
    <div class="meta-item"><span class="meta-label">Días totales</span><span class="meta-value">${ej.total_dias}</span></div>
    <div class="meta-item"><span class="meta-label">Mínimo requerido</span><span class="meta-value">${ej.porcentaje_minimo}%</span></div>
    <div class="meta-item"><span class="meta-label">Total miembros</span><span class="meta-value">${data.length}</span></div>
    <div class="meta-item"><span class="meta-label">Cumplen mínimo</span><span class="meta-value" style="color:#1a7a44;">${cumplieron} (${Math.round(cumplieron/data.length*100)}%)</span></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Nombre</th>
        <th style="text-align:center;">Asistencias</th>
        <th style="text-align:center;">Porcentaje</th>
        <th style="text-align:center;">Talla</th>
        <th style="text-align:center;">Pago</th>
        <th style="text-align:center;">Cumple</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
  </table>
  <div class="footer">
    Generado el ${new Date().toLocaleDateString('es-MX', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
    · Sistema Ejercicios Pastorales
  </div>
</body>
</html>`;

  // Abrir ventana de impresión
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.onload = () => { win.print(); };
}

// ─── Helpers
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}
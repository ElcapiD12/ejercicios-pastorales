// ═══════════════════════════════════════════
//  COOPERACION.JS — Control de pagos
// ═══════════════════════════════════════════

let coopMontoBase = 500;
let coopData      = [];

// ─── Inicializar
async function initCooperacion() {
  await loadMontoBase();
  await loadCooperaciones();
  renderCooperaciones();
  renderResumen();
  await initReportePlayeras();
}

// ─── Cargar monto base
async function loadMontoBase() {
  const groupId  = currentUser?.group_id || 'general';
  const configKey = `monto_base_${groupId}`;
  const { data } = await sb.from('config').select('value').eq('key', configKey).single();
  if (data) {
    coopMontoBase = parseFloat(data.value);
    document.getElementById('coopMontoBaseDisplay').textContent = formatMoney(coopMontoBase);
  }
}

// ─── Cargar cooperaciones con datos de miembros
async function loadCooperaciones() {
  let membQuery = sb.from('members').select('member_id, full_name').eq('is_active', true).order('full_name');
  membQuery = applyGroupFilter(membQuery);
  const { data: members } = await membQuery;

  if (!members) return;

  const { data: coops } = await sb
    .from('cooperaciones')
    .select('*');

  // Combinar — cada miembro tiene su cooperación o se crea una vacía
  coopData = members.map(m => {
    const coop = coops?.find(c => c.member_id === m.member_id);
    return {
      member_id:  m.member_id,
      full_name:  m.full_name,
      coop_id:    coop?.id || null,
      monto:      coop?.monto ?? coopMontoBase,
      anticipo:   coop?.anticipo ?? 0,
      liquidado:  coop?.liquidado ?? false,
      notas:      coop?.notas || '',
    };
  });
}

// ─── Renderizar tabla
function renderCooperaciones(filter = 'todos') {
  const tbody      = document.getElementById('coopTable');
  const searchVal  = document.getElementById('coopSearch')?.value.toLowerCase() || '';

  if (!tbody) return;

  let data = coopData;

  // Filtro por estado
  if (filter === 'pendientes') data = data.filter(c => !c.liquidado && c.anticipo === 0);
  if (filter === 'anticipo')   data = data.filter(c => !c.liquidado && c.anticipo > 0);
  if (filter === 'liquidados') data = data.filter(c => c.liquidado);

  // Filtro por búsqueda
  if (searchVal) data = data.filter(c => c.full_name.toLowerCase().includes(searchVal));

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Sin resultados</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(c => {
    const pendiente = c.monto - c.anticipo;
    const status    = getCoopStatus(c);

    return `
      <tr>
        <td>${c.full_name}</td>
        <td style="font-family:'Cinzel',serif;font-size:0.75rem;color:var(--gold-dark);">${c.member_id}</td>
        <td>${formatMoney(c.monto)}</td>
        <td>${formatMoney(c.anticipo)}</td>
        <td>${formatMoney(c.liquidado ? 0 : pendiente)}</td>
        <td>
          <span class="coop-status ${status.class}">${status.label}</span>
        </td>
        <td>
          <button class="btn-edit" onclick="openEditCoop('${c.member_id}')">Editar</button>
        </td>
      </tr>
    `;
  }).join('');
}

// ─── Resumen financiero
function renderResumen() {
  const total      = coopData.length;
  const liquidados = coopData.filter(c => c.liquidado).length;
  const conAnticipo = coopData.filter(c => !c.liquidado && c.anticipo > 0).length;
  const pendientes  = coopData.filter(c => !c.liquidado && c.anticipo === 0).length;

  const montoTotal     = coopData.reduce((s, c) => s + c.monto, 0);
  const totalRecibido  = coopData.reduce((s, c) => s + (c.liquidado ? c.monto : c.anticipo), 0);
  const totalPendiente = montoTotal - totalRecibido;

  document.getElementById('coopResTotal').textContent      = total;
  document.getElementById('coopResLiquidados').textContent = liquidados;
  document.getElementById('coopResAnticipo').textContent   = conAnticipo;
  document.getElementById('coopResPendientes').textContent = pendientes;

  document.getElementById('coopResMontoTotal').textContent    = formatMoney(montoTotal);
  document.getElementById('coopResRecibido').textContent      = formatMoney(totalRecibido);
  document.getElementById('coopResTotalPend').textContent     = formatMoney(totalPendiente);
}

// ─── Status de cooperación
function getCoopStatus(c) {
  if (c.liquidado)               return { label: 'Liquidado',  class: 'status-liquidado' };
  if (c.anticipo > 0)            return { label: 'Anticipo',   class: 'status-anticipo' };
  return                                { label: 'Pendiente',  class: 'status-pendiente' };
}

// ─── Abrir modal editar cooperación
function openEditCoop(memberId) {
  const c = coopData.find(x => x.member_id === memberId);
  if (!c) return;

  document.getElementById('coopModalName').textContent   = c.full_name;
  document.getElementById('coopModalId').textContent     = c.member_id;
  document.getElementById('coopEditMemberId').value      = c.member_id;
  document.getElementById('coopEditCoopId').value        = c.coop_id || '';
  document.getElementById('coopEditMonto').value         = c.monto;
  document.getElementById('coopEditAnticipo').value      = c.anticipo;
  document.getElementById('coopEditLiquidado').checked   = c.liquidado;
  document.getElementById('coopEditNotas').value         = c.notas;
  document.getElementById('coopEditError').textContent   = '';

  // Mostrar monto base como placeholder
  document.getElementById('coopEditMonto').placeholder = `Base: ${formatMoney(coopMontoBase)}`;

  openModal('modalCoopEdit');
}

// ─── Guardar cooperación
async function saveCoopEdit() {
  const memberId  = document.getElementById('coopEditMemberId').value;
  const coopId    = document.getElementById('coopEditCoopId').value;
  const monto     = parseFloat(document.getElementById('coopEditMonto').value);
  const anticipo  = parseFloat(document.getElementById('coopEditAnticipo').value) || 0;
  const liquidado = document.getElementById('coopEditLiquidado').checked;
  const notas     = document.getElementById('coopEditNotas').value.trim();
  const errEl     = document.getElementById('coopEditError');

  errEl.textContent = '';

  if (isNaN(monto) || monto <= 0) { errEl.textContent = 'El monto debe ser mayor a 0.'; return; }
  if (anticipo > monto)            { errEl.textContent = 'El anticipo no puede ser mayor al monto.'; return; }

  const payload = { member_id: memberId, monto, anticipo, liquidado, notas, updated_at: new Date().toISOString() };

  if (coopId) {
    const { error } = await sb.from('cooperaciones').update(payload).eq('id', coopId);
    if (error) { errEl.textContent = 'Error al actualizar.'; return; }
  } else {
    const { error } = await sb.from('cooperaciones').insert(payload);
    if (error) { errEl.textContent = 'Error al guardar.'; return; }
  }

  closeModal('modalCoopEdit');
  showToast('Cooperación actualizada.');
  await loadCooperaciones();
  renderCooperaciones(document.querySelector('.coop-filter-btn.active')?.dataset.filter || 'todos');
  renderResumen();
}

// ─── Cambiar monto base global
async function saveMontoBase() {
  const val   = parseFloat(document.getElementById('coopNuevoMonto').value);
  const errEl = document.getElementById('coopMontoError');

  errEl.textContent = '';
  if (isNaN(val) || val <= 0) { errEl.textContent = 'Ingresa un monto válido.'; return; }

  const groupId2  = currentUser?.group_id || 'general';
  const saveKey   = `monto_base_${groupId2}`;
  const { error } = await sb.from('config').upsert({ key: saveKey, value: String(val), updated_at: new Date().toISOString() });

  if (error) { errEl.textContent = 'Error al guardar.'; return; }

  coopMontoBase = val;
  document.getElementById('coopMontoBaseDisplay').textContent = formatMoney(val);
  document.getElementById('coopNuevoMonto').value = '';
  closeModal('modalMontoBase');
  showToast('Monto base actualizado.');
}

// ─── Filtros
function setCoopFilter(filter) {
  document.querySelectorAll('.coop-filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === filter);
  });
  renderCooperaciones(filter);
}

// ─── Búsqueda
function coopSearch() {
  const filter = document.querySelector('.coop-filter-btn.active')?.dataset.filter || 'todos';
  renderCooperaciones(filter);
}

// ─── Helpers
function formatMoney(amount) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount || 0);
}

// ═══════════════════════════════════════════
//  REPORTE DE PLAYERAS
// ═══════════════════════════════════════════

async function initReportePlayeras() {
  const groupId   = currentUser?.group_id || 'general';
  const configKey = `monto_playera_${groupId}`;

  const { data: cfg } = await sb.from('config').select('value').eq('key', configKey).single();
  const montoPlayera  = cfg ? parseFloat(cfg.value) : 200;

  document.getElementById('playeraMontoDisplay').textContent = formatMoney(montoPlayera);

  let query = sb.from('members').select('member_id, full_name, shirt_size, member_type').eq('is_active', true);
  query     = applyGroupFilter(query);
  const { data: members } = await query;

  const { data: coops } = await sb.from('cooperaciones').select('member_id, liquidado, anticipo');

  if (!members?.length) {
    document.getElementById('playeraTableBody').innerHTML =
      `<tr><td colspan="5" class="empty-state">No hay miembros registrados.</td></tr>`;
    return;
  }

  // Conteo por talla
  const tallasCount = {};
  const TALLAS = ['XS','S','M','L','XL','XXL'];
  TALLAS.forEach(t => tallasCount[t] = { total:0, liquidado:0, anticipo:0, pendiente:0 });

  const rows = members.map(m => {
    const coop      = coops?.find(c => c.member_id === m.member_id);
    const liquidado = coop?.liquidado || false;
    const anticipo  = (coop?.anticipo || 0) > 0 && !liquidado;
    const pendiente = !liquidado && !anticipo;
    const talla     = m.shirt_size || '?';

    if (tallasCount[talla]) {
      tallasCount[talla].total++;
      if (liquidado)  tallasCount[talla].liquidado++;
      if (anticipo)   tallasCount[talla].anticipo++;
      if (pendiente)  tallasCount[talla].pendiente++;
    }

    const status = liquidado ? 'status-liquidado' : anticipo ? 'status-anticipo' : 'status-pendiente';
    const label  = liquidado ? 'Liquidado' : anticipo ? 'Anticipo' : 'Pendiente';

    return `
      <tr>
        <td>${m.full_name}</td>
        <td style="font-family:'Cinzel',serif;font-size:0.72rem;color:var(--gold-dark);">${m.member_id}</td>
        <td><strong style="font-family:'Cinzel',serif;">${talla}</strong></td>
        <td><span style="font-size:0.82rem;color:var(--brown-light);font-style:italic;">
          ${m.member_type === 'equipo' ? 'Equipo Base' : 'Participante'}
        </span></td>
        <td><span class="coop-status ${status}">${label}</span></td>
      </tr>
    `;
  }).join('');

  document.getElementById('playeraTableBody').innerHTML = rows;

  // Resumen por talla
  let resumenHtml = '';
  TALLAS.forEach(t => {
    if (tallasCount[t].total === 0) return;
    resumenHtml += `
      <div class="playera-talla-card">
        <span class="playera-talla-size">${t}</span>
        <span class="playera-talla-total">${tallasCount[t].total} total</span>
        <div class="playera-talla-breakdown">
          <span class="pt-liq">✓ ${tallasCount[t].liquidado}</span>
          <span class="pt-ant">◑ ${tallasCount[t].anticipo}</span>
          <span class="pt-pen">○ ${tallasCount[t].pendiente}</span>
        </div>
      </div>
    `;
  });
  document.getElementById('playeraTallasResumen').innerHTML = resumenHtml || '<p style="font-style:italic;color:var(--brown-light);">Sin datos</p>';
}

async function saveMontoPlayera() {
  const val     = parseFloat(document.getElementById('playeraNuevoMonto').value);
  const errEl   = document.getElementById('playeraMontoError');
  errEl.textContent = '';

  if (isNaN(val) || val <= 0) { errEl.textContent = 'Ingresa un monto válido.'; return; }

  const groupId   = currentUser?.group_id || 'general';
  const configKey = `monto_playera_${groupId}`;

  await sb.from('config').upsert({ key: configKey, value: String(val), updated_at: new Date().toISOString() });

  document.getElementById('playeraMontoDisplay').textContent = formatMoney(val);
  document.getElementById('playeraNuevoMonto').value = '';
  closeModal('modalMontoPlayera');
  showToast('Monto de playera actualizado.');
  initReportePlayeras();
}
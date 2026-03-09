// ═══════════════════════════════════════════
//  ASISTENCIA.JS — Pase de lista facial
// ═══════════════════════════════════════════

let asistStream        = null;
let asistDetectionLoop = null;
let asistMatcher       = null;
let asistProcessing    = false;
let asistCooldown      = false;
let allMembers         = [];
let asistTorchEnabled  = false;
let pendingMatch       = null; // miembro pendiente de confirmación

async function initAsistencia() {
  showAsistPanel('panel-scanner');
  loadTodayAttendance();
  await initAsistCamera();
}

async function initAsistCamera() {
  setAsistStatus('Cargando modelos...', 'loading');
  try {
    if (!faceApiLoaded) await loadFaceApi();
    await loadMemberDescriptors();

    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    try {
      asistStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: isMobile ? { ideal: 'environment' } : 'user' },
        audio: false,
      });
    } catch {
      asistStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }

    const video = document.getElementById('asistVideo');
    video.srcObject = asistStream;
    await video.play();

    const canvas = document.getElementById('asistCanvas');
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;

    setAsistStatus('Listo — coloca tu rostro frente a la cámara', 'info');
    startAsistLoop();
  } catch (err) {
    setAsistStatus('Error al iniciar la cámara. Verifica permisos.', 'error');
    console.error(err);
  }
}

async function toggleLinternaAsist() {
  try {
    const track = asistStream?.getVideoTracks()[0];
    if (!track) { showToast('No hay cámara activa.'); return; }
    asistTorchEnabled = !asistTorchEnabled;
    await track.applyConstraints({ advanced: [{ torch: asistTorchEnabled }] });
    const btn = document.getElementById('btnLinternaAsist');
    if (btn) {
      btn.textContent      = asistTorchEnabled ? '🔦 Apagar' : '🔦 Linterna';
      btn.style.background = asistTorchEnabled ? 'rgba(201,168,76,0.3)' : '';
    }
  } catch (err) {
    showToast('Linterna no disponible en este dispositivo.');
    asistTorchEnabled = false;
  }
}

async function loadMemberDescriptors() {
  let query = sb.from('members')
    .select('member_id, full_name, face_descriptor')
    .eq('is_active', true);
  query = applyGroupFilter(query);
  const { data, error } = await query;
  if (error || !data) return;

  allMembers = data.filter(m => m.face_descriptor && m.face_descriptor.length > 0);

  if (allMembers.length > 0) {
    const labeled = allMembers.map(m =>
      new faceapi.LabeledFaceDescriptors(m.member_id, [new Float32Array(m.face_descriptor)])
    );
    asistMatcher = new faceapi.FaceMatcher(labeled, 0.45); // umbral más estricto
  }
}

// ─── Loop de reconocimiento con confirmación
function startAsistLoop() {
  const video  = document.getElementById('asistVideo');
  const canvas = document.getElementById('asistCanvas');
  const ctx    = canvas.getContext('2d');

  async function detect() {
    if (!asistStream) return;

    // Si hay una confirmación pendiente, pausar detección
    if (asistProcessing || asistCooldown || pendingMatch) {
      asistDetectionLoop = setTimeout(detect, 200);
      return;
    }

    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({
        scoreThreshold: 0.5, inputSize: 224
      }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (detection) {
      const box = detection.detection.box;

      if (asistMatcher && allMembers.length > 0) {
        const match  = asistMatcher.findBestMatch(detection.descriptor);
        const member = allMembers.find(m => m.member_id === match.label);

        if (match.label !== 'unknown' && member) {
          ctx.strokeStyle = '#C9A84C';
          ctx.lineWidth   = 3;
          ctx.strokeRect(box.x, box.y, box.width, box.height);

          // Mostrar confirmación en lugar de registrar directo
          const confianza = Math.round((1 - match.distance) * 100);
          mostrarConfirmacion(member, confianza);
        } else {
          ctx.strokeStyle = 'rgba(192,57,43,0.7)';
          ctx.lineWidth   = 2;
          ctx.strokeRect(box.x, box.y, box.width, box.height);
          setAsistStatus('Rostro no reconocido — intenta de nuevo', 'error');
        }
      } else {
        ctx.strokeStyle = 'rgba(201,168,76,0.5)';
        ctx.lineWidth   = 2;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
        setAsistStatus('No hay miembros registrados aún', 'info');
      }
    } else {
      setAsistStatus('Listo — coloca tu rostro frente a la cámara', 'info');
    }

    asistDetectionLoop = setTimeout(detect, 200);
  }
  detect();
}

// ─── Mostrar confirmación
function mostrarConfirmacion(member, confianza) {
  pendingMatch = member;

  const panel = document.getElementById('confirmPanel');
  if (!panel) return;

  document.getElementById('confirmNombre').textContent   = member.full_name;
  document.getElementById('confirmConfianza').textContent = `${confianza}% de coincidencia`;
  document.getElementById('confirmConfianza').style.color =
    confianza >= 80 ? '#1a7a44' : confianza >= 65 ? '#c0621a' : '#c0392b';

  panel.classList.add('visible');
  setAsistStatus(`¿Es ${member.full_name}? Confirma o cancela`, 'info');
}

// ─── Confirmar asistencia
async function confirmarAsistencia() {
  if (!pendingMatch) return;
  const member = pendingMatch;
  pendingMatch = null;

  document.getElementById('confirmPanel')?.classList.remove('visible');

  asistProcessing = true;
  const today = new Date().toISOString().split('T')[0];

  const { data: existing } = await sb.from('attendance').select('id')
    .eq('member_id', member.member_id).eq('date', today).single();

  if (existing) {
    showAsistResult(member, 'duplicate');
    startCooldown(3000);
    asistProcessing = false;
    return;
  }

  const { error } = await sb.from('attendance').insert({
    member_id: member.member_id, date: today, checked_in_by: currentUser?.id || null,
  });

  if (error) {
    setAsistStatus('Error al registrar asistencia.', 'error');
    startCooldown(2000);
    asistProcessing = false;
    return;
  }

  showAsistResult(member, 'success');
  loadTodayAttendance();
  startCooldown(3000);
  asistProcessing = false;
}

// ─── Cancelar confirmación
function cancelarConfirmacion() {
  pendingMatch = null;
  document.getElementById('confirmPanel')?.classList.remove('visible');
  setAsistStatus('Listo — coloca tu rostro frente a la cámara', 'info');
}

function showAsistResult(member, type) {
  const overlay = document.getElementById('asistResultOverlay');
  const icon    = document.getElementById('asistResultIcon');
  const name    = document.getElementById('asistResultName');
  const msg     = document.getElementById('asistResultMsg');

  if (type === 'success') {
    overlay.className = 'asist-result-overlay success';
    icon.textContent  = '✓';
    name.textContent  = member.full_name;
    msg.textContent   = 'Asistencia registrada';
    setAsistStatus(`✓ ${member.full_name} — asistencia registrada`, 'success');
  } else {
    overlay.className = 'asist-result-overlay duplicate';
    icon.textContent  = '↺';
    name.textContent  = member.full_name;
    msg.textContent   = 'Ya registró asistencia hoy';
    setAsistStatus(`${member.full_name} — ya pasó lista hoy`, 'info');
  }

  overlay.classList.add('visible');
  setTimeout(() => overlay.classList.remove('visible'), 3500);
}

function startCooldown(ms) {
  asistCooldown = true;
  setTimeout(() => { asistCooldown = false; }, ms);
}

function stopAsistCamera() {
  if (asistDetectionLoop) { clearTimeout(asistDetectionLoop); asistDetectionLoop = null; }
  if (asistStream) { asistStream.getTracks().forEach(t => t.stop()); asistStream = null; }
}

async function loadTodayAttendance() {
  const today = new Date().toISOString().split('T')[0];
  const list  = document.getElementById('asistTodayList');
  const count = document.getElementById('asistTodayCount');
  if (!list) return;

  let attQuery = sb.from('attendance')
    .select('*, members!inner(full_name, member_id, group_id)')
    .eq('date', today)
    .order('checked_in_at', { ascending: false });
  const { data, error } = await attQuery;

  if (error || !data) {
    list.innerHTML = `<li class="asist-empty">Sin registros hoy</li>`;
    if (count) count.textContent = '0';
    return;
  }

  if (count) count.textContent = data.length;
  if (!data.length) { list.innerHTML = `<li class="asist-empty">Sin registros aún hoy</li>`; return; }

  list.innerHTML = data.map(a => {
    const time = new Date(a.checked_in_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    return `<li class="asist-item">
      <span class="asist-item-name">${a.members?.full_name || a.member_id}</span>
      <span class="asist-item-time">${time}</span>
    </li>`;
  }).join('');
}

// ─── Búsqueda manual en tiempo real
async function buscarMiembroManual() {
  const q       = document.getElementById('asistBusqueda').value.trim();
  const results = document.getElementById('asistBusquedaResultados');
  if (q.length < 1) { results.innerHTML = ''; return; }

  let query = sb.from('members').select('member_id, full_name')
    .eq('is_active', true).ilike('full_name', `%${q}%`).limit(8);
  query = applyGroupFilter(query);
  const { data } = await query;

  if (!data?.length) {
    results.innerHTML = `<div class="asist-no-results">No se encontraron miembros</div>`;
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const { data: hoy } = await sb.from('attendance').select('member_id').eq('date', today);
  const yaAsistieron  = new Set(hoy?.map(a => a.member_id) || []);

  results.innerHTML = data.map(m => {
    const yaAsistio = yaAsistieron.has(m.member_id);
    return `
      <div class="asist-search-item ${yaAsistio ? 'ya-asistio' : ''}"
           onclick="${yaAsistio ? '' : `registrarManual('${m.member_id}', '${m.full_name.replace(/'/g, "\\'")}')`}">
        <div class="asist-search-item-info">
          <span class="asist-search-name">${m.full_name}</span>
          <span class="asist-search-id">${m.member_id}</span>
        </div>
        <span class="asist-search-status ${yaAsistio ? 'ya' : 'pendiente'}">
          ${yaAsistio ? '✓ Ya registrado' : '+ Registrar'}
        </span>
      </div>`;
  }).join('');
}

async function registrarManual(memberId, fullName) {
  const today = new Date().toISOString().split('T')[0];
  const { data: existing } = await sb.from('attendance').select('id')
    .eq('member_id', memberId).eq('date', today).single();

  if (existing) { showToast(`${fullName} ya registró asistencia hoy.`); return; }

  const { error } = await sb.from('attendance').insert({
    member_id: memberId, date: today, checked_in_by: currentUser?.id || null,
  });

  if (error) { showToast('Error al registrar.'); return; }

  document.getElementById('asistBusqueda').value = '';
  document.getElementById('asistBusquedaResultados').innerHTML = '';
  showToast(`✓ Asistencia registrada para ${fullName}`);
  loadTodayAttendance();
}

function showAsistPanel(panelId) {
  ['panel-scanner', 'panel-manual', 'panel-stats'].forEach(id => {
    document.getElementById(id)?.classList.toggle('active', id === panelId);
  });
  document.querySelectorAll('.asist-mode-tab').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(panelId));
  });

  if (panelId === 'panel-scanner') {
    initAsistCamera();
  } else if (panelId === 'panel-stats') {
    stopAsistCamera();
    loadAsistenciaStats();
  } else {
    stopAsistCamera();
    pendingMatch = null;
    document.getElementById('confirmPanel')?.classList.remove('visible');
    document.getElementById('asistBusquedaResultados').innerHTML = '';
  }
}

function setAsistStatus(msg, type) {
  const el = document.getElementById('asistStatus');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'asist-status ' + type;
}

// ═══════════════════════════════════════════
//  ESTADÍSTICAS E HISTORIAL
// ═══════════════════════════════════════════

async function loadAsistenciaStats() {
  const list = document.getElementById('asistStatslist');
  if (!list) return;

  let ejQuery = sb.from('ejercicios').select('*').eq('estado', 'activo');
  ejQuery = applyGroupFilter(ejQuery);
  const { data: ejercicios } = await ejQuery;
  const ej = ejercicios?.[0];

  if (!ej) {
    list.innerHTML = `<div class="asist-empty">No hay ejercicio activo</div>`;
    document.getElementById('asistEjercicioNombre').textContent = 'Sin ejercicio activo';
    return;
  }

  document.getElementById('asistEjercicioNombre').textContent = ej.title;

  let membQuery = sb.from('members').select('member_id, full_name').eq('is_active', true);
  membQuery = applyGroupFilter(membQuery);
  const { data: members } = await membQuery;

  if (!members?.length) { list.innerHTML = `<div class="asist-empty">No hay miembros registrados</div>`; return; }

  const { data: asistencias } = await sb.from('attendance').select('member_id, date')
    .gte('date', ej.fecha_inicio)
    .lte('date', ej.fecha_fin || new Date().toISOString().split('T')[0]);

  const stats = members.map(m => {
    const dias = asistencias?.filter(a => a.member_id === m.member_id).length || 0;
    const pct  = Math.round((dias / ej.total_dias) * 100);
    return { ...m, dias, pct, cumple: pct >= ej.porcentaje_minimo };
  }).sort((a, b) => b.pct - a.pct);

  const cumplieron = stats.filter(s => s.cumple).length;
  const countEl    = document.getElementById('asistStatsCount');
  if (countEl) countEl.textContent = `${cumplieron}/${stats.length} cumplen ${ej.porcentaje_minimo}%`;

  list.innerHTML = stats.map(s => {
    const color = s.pct >= 75 ? '#1a7a44' : s.pct >= 50 ? '#c0621a' : '#c0392b';
    return `
      <div class="asist-stat-item" onclick="verHistorialMiembro('${s.member_id}', '${s.full_name.replace(/'/g,"\\'")}')">
        <div class="asist-stat-info">
          <span class="asist-stat-name">${s.full_name}</span>
          <span class="asist-stat-dias">${s.dias}/${ej.total_dias} días</span>
        </div>
        <div class="asist-stat-bar-wrap">
          <div class="asist-stat-bar">
            <div class="asist-stat-fill" style="width:${Math.min(s.pct,100)}%;background:${color};"></div>
          </div>
          <span class="asist-stat-pct" style="color:${color};">${s.pct}%</span>
        </div>
      </div>`;
  }).join('');
}

async function verHistorialMiembro(memberId, fullName) {
  document.getElementById('historialNombre').textContent = fullName;
  document.getElementById('historialTable').innerHTML = '<tr><td colspan="2" class="empty-state">Cargando...</td></tr>';
  openModal('modalHistorial');

  let ejQuery = sb.from('ejercicios').select('*').eq('estado', 'activo');
  ejQuery = applyGroupFilter(ejQuery);
  const { data: ejercicios } = await ejQuery;
  const ej = ejercicios?.[0];

  if (!ej) {
    document.getElementById('historialTable').innerHTML =
      '<tr><td colspan="2" class="empty-state">No hay ejercicio activo</td></tr>';
    return;
  }

  const { data: asistencias } = await sb.from('attendance').select('date, checked_in_at')
    .eq('member_id', memberId).gte('date', ej.fecha_inicio).order('date', { ascending: true });

  const dias  = asistencias?.length || 0;
  const pct   = Math.round((dias / ej.total_dias) * 100);
  const color = pct >= 75 ? '#1a7a44' : pct >= 50 ? '#c0621a' : '#c0392b';

  document.getElementById('historialResumen').innerHTML = `
    <div style="display:flex;gap:1.5rem;flex-wrap:wrap;padding:0.8rem;background:rgba(201,168,76,0.06);border:1px solid rgba(201,168,76,0.2);margin-bottom:1rem;">
      <div><span style="font-family:'Cinzel',serif;font-size:0.65rem;color:var(--gold-dark);text-transform:uppercase;letter-spacing:0.1em;display:block;">Ejercicio</span>
        <span style="font-size:0.9rem;color:var(--brown);">${ej.title}</span></div>
      <div><span style="font-family:'Cinzel',serif;font-size:0.65rem;color:var(--gold-dark);text-transform:uppercase;letter-spacing:0.1em;display:block;">Asistencias</span>
        <span style="font-size:0.9rem;color:var(--brown);">${dias} / ${ej.total_dias}</span></div>
      <div><span style="font-family:'Cinzel',serif;font-size:0.65rem;color:var(--gold-dark);text-transform:uppercase;letter-spacing:0.1em;display:block;">Porcentaje</span>
        <span style="font-size:0.9rem;font-weight:bold;color:${color};">${pct}%</span></div>
    </div>`;

  if (!asistencias?.length) {
    document.getElementById('historialTable').innerHTML =
      '<tr><td colspan="2" class="empty-state">Sin asistencias registradas</td></tr>';
    return;
  }

  document.getElementById('historialTable').innerHTML = asistencias.map((a, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${new Date(a.date + 'T12:00:00').toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' })}</td>
    </tr>`).join('');
}
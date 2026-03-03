// ═══════════════════════════════════════════
//  ASISTENCIA.JS — Pase de lista facial
// ═══════════════════════════════════════════

let asistStream       = null;
let asistDetectionLoop = null;
let asistMatcher      = null;
let asistProcessing   = false;
let asistCooldown     = false;
let allMembers        = [];

// ─── Inicializar vista de asistencia
async function initAsistencia() {
  showAsistPanel('panel-scanner');
  loadTodayAttendance();
  await initAsistCamera();
}

// ─── Cargar cámara y modelos
async function initAsistCamera() {
  setAsistStatus('Cargando modelos...', 'loading');

  try {
    if (!faceApiLoaded) await loadFaceApi();

    // Cargar todos los miembros con sus descriptores
    await loadMemberDescriptors();

    // Iniciar cámara
    asistStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: /Android|iPhone|iPad/i.test(navigator.userAgent) ? { ideal: 'environment' } : 'user' },
      audio: false,
    });

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

// ─── Cargar descriptores de miembros
async function loadMemberDescriptors() {
  let query = sb
    .from('members')
    .select('member_id, full_name, face_descriptor')
    .eq('is_active', true);
  query = applyGroupFilter(query);
  const { data, error } = await query;

  if (error || !data) return;

  allMembers = data.filter(m => m.face_descriptor && m.face_descriptor.length > 0);

  // Construir matcher con LabeledFaceDescriptors
  if (allMembers.length > 0) {
    const labeled = allMembers.map(m =>
      new faceapi.LabeledFaceDescriptors(
        m.member_id,
        [new Float32Array(m.face_descriptor)]
      )
    );
    asistMatcher = new faceapi.FaceMatcher(labeled, 0.5);
  }
}

// ─── Loop de reconocimiento
function startAsistLoop() {
  const video  = document.getElementById('asistVideo');
  const canvas = document.getElementById('asistCanvas');
  const ctx    = canvas.getContext('2d');

  async function detect() {
    if (asistProcessing || asistCooldown) {
      asistDetectionLoop = requestAnimationFrame(detect);
      return;
    }

    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (detection) {
      const box = detection.detection.box;

      if (asistMatcher && allMembers.length > 0) {
        const match = asistMatcher.findBestMatch(detection.descriptor);

        if (match.label !== 'unknown') {
          // ¡Rostro reconocido!
          ctx.strokeStyle = '#C9A84C';
          ctx.lineWidth   = 2;
          ctx.strokeRect(box.x, box.y, box.width, box.height);

          asistProcessing = true;
          await registrarAsistencia(match.label);
          asistProcessing = false;

        } else {
          // Rostro no reconocido
          ctx.strokeStyle = 'rgba(192,57,43,0.7)';
          ctx.lineWidth   = 2;
          ctx.strokeRect(box.x, box.y, box.width, box.height);
          setAsistStatus('Rostro no reconocido — intenta de nuevo', 'error');
        }

      } else {
        // No hay miembros registrados aún
        ctx.strokeStyle = 'rgba(201,168,76,0.5)';
        ctx.lineWidth   = 2;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
        setAsistStatus('No hay miembros registrados aún', 'info');
      }
    } else {
      setAsistStatus('Listo — coloca tu rostro frente a la cámara', 'info');
    }

    asistDetectionLoop = requestAnimationFrame(detect);
  }

  detect();
}

// ─── Registrar asistencia
async function registrarAsistencia(memberId) {
  const member = allMembers.find(m => m.member_id === memberId);
  if (!member) return;

  const today = new Date().toISOString().split('T')[0];

  // Verificar si ya pasó lista hoy
  const { data: existing } = await sb
    .from('attendance')
    .select('id')
    .eq('member_id', memberId)
    .eq('date', today)
    .single();

  if (existing) {
    showAsistResult(member, 'duplicate');
    startCooldown(3000);
    return;
  }

  // Registrar asistencia
  const { error } = await sb.from('attendance').insert({
    member_id:      memberId,
    date:           today,
    checked_in_by:  currentUser?.id || null,
  });

  if (error) {
    setAsistStatus('Error al registrar asistencia.', 'error');
    startCooldown(2000);
    return;
  }

  showAsistResult(member, 'success');
  loadTodayAttendance();
  startCooldown(4000);
}

// ─── Mostrar resultado del reconocimiento
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

// ─── Cooldown entre reconocimientos
function startCooldown(ms) {
  asistCooldown = true;
  setTimeout(() => { asistCooldown = false; }, ms);
}

// ─── Detener cámara de asistencia
function stopAsistCamera() {
  if (asistStream) {
    asistStream.getTracks().forEach(t => t.stop());
    asistStream = null;
  }
  if (asistDetectionLoop) {
    cancelAnimationFrame(asistDetectionLoop);
    asistDetectionLoop = null;
  }
}

// ─── Cargar asistencia del día
async function loadTodayAttendance() {
  const today = new Date().toISOString().split('T')[0];
  const list  = document.getElementById('asistTodayList');
  const count = document.getElementById('asistTodayCount');

  if (!list) return;

  let attQuery = sb
    .from('attendance')
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

  if (!data.length) {
    list.innerHTML = `<li class="asist-empty">Sin registros aún hoy</li>`;
    return;
  }

  list.innerHTML = data.map(a => {
    const time = new Date(a.checked_in_at).toLocaleTimeString('es-MX', {
      hour: '2-digit', minute: '2-digit'
    });
    return `
      <li class="asist-item">
        <span class="asist-item-name">${a.members?.full_name || a.member_id}</span>
        <span class="asist-item-time">${time}</span>
      </li>
    `;
  }).join('');
}

// ─── Búsqueda manual por nombre
async function buscarMiembroManual() {
  const query = document.getElementById('asistBusqueda').value.trim();
  if (!query) return;

  const { data, error } = await sb
    .from('members')
    .select('member_id, full_name')
    .ilike('full_name', `%${query}%`)
    .eq('is_active', true)
    .limit(5);

  const results = document.getElementById('asistBusquedaResultados');

  if (error || !data?.length) {
    results.innerHTML = `<div class="search-empty">No se encontraron resultados</div>`;
    return;
  }

  results.innerHTML = data.map(m => `
    <div class="search-result-item" onclick="registrarManual('${m.member_id}', '${m.full_name.replace(/'/g, "\\'")}')">
      <span class="search-result-name">${m.full_name}</span>
      <span class="search-result-id">${m.member_id}</span>
    </div>
  `).join('');
}

// ─── Registrar asistencia manual
async function registrarManual(memberId, fullName) {
  const today = new Date().toISOString().split('T')[0];

  const { data: existing } = await sb
    .from('attendance')
    .select('id')
    .eq('member_id', memberId)
    .eq('date', today)
    .single();

  if (existing) {
    showToast(`${fullName} ya registró asistencia hoy.`);
    return;
  }

  const { error } = await sb.from('attendance').insert({
    member_id:      memberId,
    date:           today,
    checked_in_by:  currentUser?.id || null,
  });

  if (error) { showToast('Error al registrar.'); return; }

  document.getElementById('asistBusqueda').value = '';
  document.getElementById('asistBusquedaResultados').innerHTML = '';
  showToast(`✓ Asistencia registrada para ${fullName}`);
  loadTodayAttendance();
}

// ─── Cambiar panel
function showAsistPanel(panelId) {
  ['panel-scanner', 'panel-manual'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', id === panelId);
  });

  if (panelId === 'panel-scanner') {
    initAsistCamera();
  } else {
    stopAsistCamera();
    document.getElementById('asistBusquedaResultados').innerHTML = '';
  }
}

// ─── Helpers
function setAsistStatus(msg, type) {
  const el = document.getElementById('asistStatus');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'asist-status ' + type;
}

// ═══════════════════════════════════════════
//  HISTORIAL Y PORCENTAJES
// ═══════════════════════════════════════════

async function loadAsistenciaStats() {
  const list = document.getElementById('asistStatslist');
  if (!list) return;

  // Cargar ejercicio activo
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

  // Cargar miembros
  let membQuery = sb.from('members').select('member_id, full_name').eq('is_active', true);
  membQuery = applyGroupFilter(membQuery);
  const { data: members } = await membQuery;

  if (!members?.length) {
    list.innerHTML = `<div class="asist-empty">No hay miembros registrados</div>`;
    return;
  }

  // Cargar asistencia del ejercicio
  const { data: asistencias } = await sb
    .from('attendance')
    .select('member_id, date')
    .gte('date', ej.fecha_inicio)
    .lte('date', ej.fecha_fin || new Date().toISOString().split('T')[0]);

  // Calcular stats por miembro
  const stats = members.map(m => {
    const dias = asistencias?.filter(a => a.member_id === m.member_id).length || 0;
    const pct  = Math.round((dias / ej.total_dias) * 100);
    return { ...m, dias, pct, cumple: pct >= ej.porcentaje_minimo };
  }).sort((a, b) => b.pct - a.pct);

  const cumplieron = stats.filter(s => s.cumple).length;
  const countEl = document.getElementById('asistStatsCount');
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
      </div>
    `;
  }).join('');
}

async function verHistorialMiembro(memberId, fullName) {
  document.getElementById('historialNombre').textContent = fullName;
  document.getElementById('historialTable').innerHTML = '<tr><td colspan="2" class="empty-state">Cargando...</td></tr>';
  openModal('modalHistorial');

  // Ejercicio activo
  let ejQuery = sb.from('ejercicios').select('*').eq('estado', 'activo');
  ejQuery = applyGroupFilter(ejQuery);
  const { data: ejercicios } = await ejQuery;
  const ej = ejercicios?.[0];

  if (!ej) {
    document.getElementById('historialTable').innerHTML =
      '<tr><td colspan="2" class="empty-state">No hay ejercicio activo</td></tr>';
    return;
  }

  const { data: asistencias } = await sb
    .from('attendance')
    .select('date, checked_in_at')
    .eq('member_id', memberId)
    .gte('date', ej.fecha_inicio)
    .order('date', { ascending: true });

  const dias = asistencias?.length || 0;
  const pct  = Math.round((dias / ej.total_dias) * 100);
  const color = pct >= 75 ? '#1a7a44' : pct >= 50 ? '#c0621a' : '#c0392b';

  document.getElementById('historialResumen').innerHTML = `
    <div style="display:flex;gap:1.5rem;padding:0.8rem;background:rgba(201,168,76,0.06);border:1px solid rgba(201,168,76,0.2);margin-bottom:1rem;">
      <div><span style="font-family:'Cinzel',serif;font-size:0.65rem;color:var(--gold-dark);text-transform:uppercase;letter-spacing:0.1em;display:block;">Ejercicio</span>
        <span style="font-size:0.9rem;color:var(--brown);">${ej.title}</span></div>
      <div><span style="font-family:'Cinzel',serif;font-size:0.65rem;color:var(--gold-dark);text-transform:uppercase;letter-spacing:0.1em;display:block;">Asistencias</span>
        <span style="font-size:0.9rem;color:var(--brown);">${dias} / ${ej.total_dias}</span></div>
      <div><span style="font-family:'Cinzel',serif;font-size:0.65rem;color:var(--gold-dark);text-transform:uppercase;letter-spacing:0.1em;display:block;">Porcentaje</span>
        <span style="font-size:0.9rem;font-weight:bold;color:${color};">${pct}%</span></div>
    </div>
  `;

  if (!asistencias?.length) {
    document.getElementById('historialTable').innerHTML =
      '<tr><td colspan="2" class="empty-state">Sin asistencias registradas</td></tr>';
    return;
  }

  document.getElementById('historialTable').innerHTML = asistencias.map((a, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${new Date(a.date + 'T12:00:00').toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' })}</td>
    </tr>
  `).join('');
}

function showAsistPanel(panelId) {
  ['panel-scanner','panel-manual','panel-stats'].forEach(id => {
    document.getElementById(id)?.classList.toggle('active', id === panelId);
  });

  if (panelId === 'panel-scanner') {
    initAsistCamera();
  } else if (panelId === 'panel-stats') {
    stopAsistCamera();
    loadAsistenciaStats();
  } else {
    stopAsistCamera();
    document.getElementById('asistBusquedaResultados').innerHTML = '';
  }
}
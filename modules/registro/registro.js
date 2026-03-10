// ═══════════════════════════════════════════
//  REGISTRO.JS — Registro, edición y lista
// ═══════════════════════════════════════════

let regStream        = null;
let regDescriptor    = null;
let regFaceDetected  = false;
let faceApiLoaded    = false;
let detectionLoop    = null;
let regMemberType    = 'participante';
let regLinkedUserId  = null;  // Para vincular con user_profiles

// ─── Inicializar vista
async function initRegistro() {
  showRegistroTab('tab-lista');
  loadMembersList();
}

// ─── Tabs del módulo
function showRegistroTab(tabId) {
  ['tab-lista','tab-nuevo'].forEach(id => {
    document.getElementById(id)?.classList.toggle('active', id === tabId);
  });
  document.querySelectorAll('.reg-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  if (tabId === 'tab-nuevo') {
    resetRegistroForm();
    loadFaceApiAndCamera();
  } else {
    stopCamera();
    loadMembersList();
  }
}

// ─── Iniciar nuevo registro desde usuarios (equipo base)
function iniciarRegistroEquipo(userId, userName) {
  regLinkedUserId = userId;
  regMemberType   = 'equipo';
  showView('registro');
  setTimeout(() => {
    showRegistroTab('tab-nuevo');
    document.getElementById('regNombre').value = userName;
    document.getElementById('regTipoMiembro').value = 'equipo';
  }, 300);
}

// ─── Cargar lista de miembros
async function loadMembersList(search = '') {
  const tbody = document.getElementById('membersTable');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Cargando...</td></tr>`;

  let query = sb.from('members').select('*').order('full_name');
  if (search) query = query.ilike('full_name', `%${search}%`);

  const { data, error } = await query;

  if (error || !data?.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No hay miembros registrados.</td></tr>`;
    document.getElementById('membersCount').textContent = '0 miembros';
    return;
  }

  document.getElementById('membersCount').textContent =
    `${data.length} miembro${data.length !== 1 ? 's' : ''}`;

  tbody.innerHTML = data.map(m => {
    const tipo = m.member_type === 'equipo'
      ? '<span class="role-tag" style="color:#8B6914;">Equipo</span>'
      : '<span style="color:var(--brown-light);font-size:0.85rem;font-style:italic;">Participante</span>';

    const birth = m.birth_date
      ? new Date(m.birth_date + 'T12:00:00').toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'numeric' })
      : '—';

    return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:0.6rem;">
            <div class="member-avatar" style="background:var(--brown);color:var(--gold-light);width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Cinzel',serif;font-size:0.7rem;flex-shrink:0;">
              ${m.full_name.charAt(0).toUpperCase()}
            </div>
            <span>${m.full_name}</span>
          </div>
        </td>
        <td style="font-family:'Cinzel',serif;font-size:0.72rem;color:var(--gold-dark);">${m.member_id}</td>
        <td>${tipo}</td>
        <td>${m.phone || '—'}</td>
        <td>${m.shirt_size || '—'}</td>
        <td class="td-actions">
          <button class="btn-edit" onclick="openEditMember('${m.id}')">Editar</button>
          <button class="btn-danger" onclick="confirmDeleteMember('${m.id}','${m.full_name.replace(/'/g,"\\'")}','${m.member_id}')">Eliminar</button>
        </td>
      </tr>
    `;
  }).join('');
}

// ─── Buscar miembros
function searchMembers() {
  const q = document.getElementById('membersSearch').value.trim();
  loadMembersList(q);
}

// ─── Abrir edición de miembro
async function openEditMember(memberId) {
  const { data: m, error } = await sb.from('members').select('*').eq('id', memberId).single();
  if (error || !m) return;

  document.getElementById('editMemberId').value        = m.id;
  document.getElementById('editMemberNombre').value    = m.full_name;
  document.getElementById('editMemberTelefono').value  = m.phone || '';
  document.getElementById('editMemberEmerg').value     = m.emergency_phone || '';
  document.getElementById('editMemberFecha').value     = m.birth_date || '';
  document.getElementById('editMemberTalla').value     = m.shirt_size || '';
  document.getElementById('editMemberDomicilio').value = m.address || '';
  document.getElementById('editMemberTipo').value      = m.member_type || 'participante';
  document.getElementById('editMemberMemberId').textContent = m.member_id;
  document.getElementById('editMemberError').textContent    = '';

  openModal('modalEditMember');
}

// ─── Guardar edición de miembro
async function saveEditMember() {
  const id       = document.getElementById('editMemberId').value;
  const nombre   = document.getElementById('editMemberNombre').value.trim();
  const telefono = document.getElementById('editMemberTelefono').value.trim();
  const emerg    = document.getElementById('editMemberEmerg').value.trim();
  const fecha    = document.getElementById('editMemberFecha').value;
  const talla    = document.getElementById('editMemberTalla').value;
  const domicilio= document.getElementById('editMemberDomicilio').value.trim();
  const tipo     = document.getElementById('editMemberTipo').value;
  const errEl    = document.getElementById('editMemberError');

  errEl.textContent = '';
  if (!nombre) { errEl.textContent = 'El nombre es obligatorio.'; return; }

  const { error } = await sb.from('members').update({
    full_name:       nombre,
    phone:           telefono,
    emergency_phone: emerg,
    birth_date:      fecha || null,
    shirt_size:      talla,
    address:         domicilio,
    member_type:     tipo,
  }).eq('id', id);

  if (error) { errEl.textContent = 'Error al actualizar.'; return; }

  closeModal('modalEditMember');
  showToast('Miembro actualizado correctamente.');
  loadMembersList();
}

// ─── Confirmar eliminación
function confirmDeleteMember(memberId, fullName, memberCode) {
  document.getElementById('deleteMemberName').textContent = fullName;
  document.getElementById('deleteMemberCode').textContent = memberCode;
  document.getElementById('deleteMemberId').value         = memberId;
  document.getElementById('deleteMemberCode2').value      = memberCode;
  openModal('modalDeleteMember');
}

// ─── Ejecutar eliminación
async function executeDeleteMember() {
  const id         = document.getElementById('deleteMemberId').value;
  const memberCode = document.getElementById('deleteMemberCode2').value;
  const errEl      = document.getElementById('deleteMemberError');

  errEl.textContent = '';

  // Borrar en cascada: cooperaciones, asistencia, luego miembro
  await sb.from('cooperaciones').delete().eq('member_id', memberCode);
  await sb.from('attendance').delete().eq('member_id', memberCode);

  const { error } = await sb.from('members').delete().eq('id', id);
  if (error) { errEl.textContent = 'Error al eliminar.'; return; }

  // Desvincular de user_profiles si aplica
  await sb.from('user_profiles').update({ member_id: null }).eq('member_id', memberCode);

  closeModal('modalDeleteMember');
  showToast('Miembro eliminado correctamente.');
  loadMembersList();
}

// ─── FLUJO DE REGISTRO NUEVO ────────────────

async function loadFaceApiAndCamera() {
  if (!faceApiLoaded) {
    setRegistroStatus('Cargando modelos de reconocimiento facial...', 'loading');
    await loadFaceApi();
  } else {
    startCamera();
  }
}

async function loadFaceApi() {
  try {
    await loadScript('https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js');
    const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    faceApiLoaded = true;
    startCamera();
  } catch (err) {
    setRegistroStatus('Error al cargar modelos. Verifica tu conexión.', 'error');
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function startCamera() {
  const video  = document.getElementById('regVideo');
  const canvas = document.getElementById('regCanvas');
  setRegistroStatus('Iniciando cámara...', 'loading');
  try {
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    const constraints = {
      video: {
        width: 640, height: 480,
        facingMode: isMobile ? { ideal: 'environment' } : 'user'
      },
      audio: false
    };

    try {
      regStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      regStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }

    video.srcObject = regStream;
    await video.play();
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;

    showRegistroStep('step-camera');
    setRegistroStatus('Coloca tu rostro en el encuadre', 'info');
    startDetectionLoop();
  } catch (err) {
    setRegistroStatus('No se pudo acceder a la cámara.', 'error');
  }
}
function startDetectionLoop() {
  const video  = document.getElementById('regVideo');
  const canvas = document.getElementById('regCanvas');
  const ctx    = canvas.getContext('2d');
  const btn    = document.getElementById('btnCapturar');
  let consecutive = 0;

  async function detect() {
    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (detection) {
      const box = detection.detection.box;

      // ─── Verificar tamaño mínimo (50% del ancho del canvas)
      const faceRatio = box.width / canvas.width;
      const tooFar    = faceRatio < 0.50;

      if (tooFar) {
        consecutive = 0;
        regFaceDetected = false;
        ctx.strokeStyle = 'rgba(255,100,100,0.8)';
        ctx.lineWidth   = 2;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
        setRegistroStatus('⚠ Acércate más a la cámara', 'error');
        btn.disabled = true;
        btn.classList.remove('ready');
        detectionLoop = requestAnimationFrame(detect);
        return;
      }

      consecutive++;
      const stabilized = consecutive >= 3;

      ctx.strokeStyle = stabilized ? '#C9A84C' : 'rgba(201,168,76,0.5)';
      ctx.lineWidth   = 2;
      ctx.strokeRect(box.x, box.y, box.width, box.height);

      ctx.fillStyle = stabilized ? 'rgba(201,168,76,0.8)' : 'rgba(201,168,76,0.3)';
      detection.landmarks.positions.forEach(pt => {
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 1.5, 0, Math.PI * 2); ctx.fill();
      });

      if (stabilized) {
        regFaceDetected = true;
        if (!regDescriptor) regDescriptor = detection.descriptor;
        setRegistroStatus('✓ Rostro detectado — presiona Capturar', 'success');
        btn.disabled = false;
        btn.classList.add('ready');
      }
    } else {
      consecutive = 0;
      if (!regDescriptor) {
        setRegistroStatus('Coloca tu rostro en el encuadre', 'info');
        btn.disabled = true;
        btn.classList.remove('ready');
      }
    }

    detectionLoop = requestAnimationFrame(detect);
  }
  detect();
}

// ─── Linterna
let torchEnabled = false;
async function toggleLinterna() {
  try {
    const track = regStream?.getVideoTracks()[0];
    if (!track) { showToast('No hay cámara activa.'); return; }

    torchEnabled = !torchEnabled;
    await track.applyConstraints({ advanced: [{ torch: torchEnabled }] });

    const btn = document.getElementById('btnLinterna');
    if (btn) {
      btn.textContent = torchEnabled ? '🔦 Apagar linterna' : '🔦 Linterna';
      btn.style.background = torchEnabled ? 'rgba(201,168,76,0.3)' : '';
    }
  } catch (err) {
    showToast('Linterna no disponible en este dispositivo.');
    torchEnabled = false;
  }
}

function capturarRostro() {
  if (!regFaceDetected || !regDescriptor) return;

  cancelAnimationFrame(detectionLoop);
  stopCamera();

  const video = document.getElementById('regVideo');
  const snap  = document.createElement('canvas');
  snap.width  = video.videoWidth;
  snap.height = video.videoHeight;
  snap.getContext('2d').drawImage(video, 0, 0);

  const photoDataUrl = snap.toDataURL('image/jpeg', 0.8);
  document.getElementById('regPhotoPreview').src = photoDataUrl;
  document.getElementById('regPhotoData').value  = photoDataUrl;

  showRegistroStep('step-form');
}

function stopCamera() {
  if (regStream) { regStream.getTracks().forEach(t => t.stop()); regStream = null; }
  if (detectionLoop) { cancelAnimationFrame(detectionLoop); detectionLoop = null; }
}

function volverCamara() {
  regDescriptor = null; regFaceDetected = false;
  showRegistroStep('step-camera');
  startCamera();
}

async function guardarMiembro() {
  const errEl     = document.getElementById('regFormError');
  errEl.textContent = '';

  const fullName   = document.getElementById('regNombre').value.trim();
  const phone      = document.getElementById('regTelefono').value.trim();
  const emergPhone = document.getElementById('regTelefonoEmerg').value.trim();
  const birthDate  = document.getElementById('regFechaNac').value;
  const shirtSize  = document.getElementById('regTalla').value;
  const address    = document.getElementById('regDomicilio').value.trim();
  const memberType = document.getElementById('regTipoMiembro').value;

  if (!currentUser?.group_id) { errEl.textContent = 'Error: tu usuario no tiene grupo asignado. Contacta al administrador.'; return; }
  if (!fullName)    { errEl.textContent = 'El nombre es obligatorio.'; return; }
  if (!phone)       { errEl.textContent = 'El teléfono es obligatorio.'; return; }
  if (!birthDate)   { errEl.textContent = 'La fecha de nacimiento es obligatoria.'; return; }
  if (!shirtSize)   { errEl.textContent = 'Selecciona una talla.'; return; }
  if (!regDescriptor) { errEl.textContent = 'No hay datos faciales. Vuelve a capturar.'; return; }

  const btn = document.getElementById('btnGuardarMiembro');
  btn.disabled = true; btn.textContent = 'Guardando...';

  try {
    const memberId       = await generateMemberId();
    const descriptorArray = Array.from(regDescriptor);

    const { error } = await sb.from('members').insert({
      member_id:       memberId,
      full_name:       fullName,
      phone,
      emergency_phone: emergPhone,
      birth_date:      birthDate,
      shirt_size:      shirtSize,
      address,
      face_descriptor: descriptorArray,
      member_type:     memberType,
      group_id:        currentUser?.group_id,
    });

    if (error) throw error;

    // Vincular con user_profiles si viene del equipo
    if (regLinkedUserId) {
      await sb.from('user_profiles').update({ member_id: memberId }).eq('id', regLinkedUserId);
      regLinkedUserId = null;
    }

    document.getElementById('regConfirmName').textContent = fullName;
    document.getElementById('regConfirmId').textContent   = memberId;
    document.getElementById('regConfirmPhoto').src        = document.getElementById('regPhotoPreview').src;

    showRegistroStep('step-confirm');
  } catch (err) {
    errEl.textContent = 'Error al guardar. Intenta de nuevo.';
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar Registro';
  }
}

async function generateMemberId() {
  const year   = new Date().getFullYear();
  const prefix = `EJ-${year}-`;
  const { data } = await sb.from('members').select('member_id')
    .like('member_id', `${prefix}%`).order('member_id', { ascending: false }).limit(1);
  let nextNum = 1;
  if (data?.length) nextNum = parseInt(data[0].member_id.split('-')[2]) + 1;
  return `${prefix}${String(nextNum).padStart(4,'0')}`;
}

function nuevoRegistro() {
  resetRegistroForm();
  showRegistroStep('step-camera');
  startCamera();
}

function resetRegistroForm() {
  stopCamera();
  regDescriptor = null; regFaceDetected = false; regMemberType = 'participante';
  ['regNombre','regTelefono','regTelefonoEmerg','regFechaNac','regDomicilio','regFormError']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value ? el.value='' : el.textContent=''; });
  const talla = document.getElementById('regTalla');
  if (talla) talla.value = '';
  const tipo = document.getElementById('regTipoMiembro');
  if (tipo) tipo.value = 'participante';
  const btn = document.getElementById('btnCapturar');
  if (btn) { btn.disabled = true; btn.classList.remove('ready'); }

  showRegistroStep('step-camera');
}

function showRegistroStep(stepId) {
  ['step-camera','step-form','step-confirm'].forEach(id => {
    document.getElementById(id)?.classList.toggle('active', id === stepId);
  });
}

function setRegistroStatus(msg, type) {
  const el = document.getElementById('regStatus');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'reg-status ' + type;
}
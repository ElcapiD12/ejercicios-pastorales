// ═══════════════════════════════════════════
//  USUARIOS.JS — Con soporte de grupos
// ═══════════════════════════════════════════

const ROLE_LABELS_U = {
  superadmin:'Superadmin', administrador:'Administrador',
  secretario:'Secretario', contador:'Contador',
  registrador:'Registrador', equipo:'Equipo Base',
};

const GROUP_NAMES = {
  kairos:    'Jóvenes Kairós',
  nazarenos: 'Adolescentes Nazarenos',
};

async function loadUsers() {
  const tbody = document.getElementById('usersTable');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Cargando...</td></tr>`;

  let query = sb.from('user_profiles').select('*').order('group_id').order('full_name');

  // Si no es superadmin, solo ve su grupo
  if (currentUser.role !== 'superadmin') {
    query = query.eq('group_id', currentUser.group_id);
  }

  const { data, error } = await query;

  if (error || !data?.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No hay usuarios registrados.</td></tr>`;
    return;
  }

  document.getElementById('usersCount').textContent =
    `${data.length} usuario${data.length !== 1 ? 's' : ''}`;

  // Agrupar por group_id para mostrar separados
  const grouped = {};
  data.forEach(u => {
    const key = u.group_id || 'superadmin';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(u);
  });

  let html = '';

  Object.entries(grouped).forEach(([groupKey, users]) => {
    const groupName = groupKey === 'superadmin' ? 'Superadmins' : (GROUP_NAMES[groupKey] || groupKey);

    if (currentUser.role === 'superadmin') {
      html += `<tr class="group-row-separator">
        <td colspan="7" class="group-separator-label">${groupName}</td>
      </tr>`;
    }

    html += users.map(u => {
      const tienePerfil = !!u.member_id;
      const perfilBadge = tienePerfil
        ? `<span class="status-badge status-active" title="${u.member_id}">✓ ${u.member_id}</span>`
        : (u.role !== 'superadmin'
          ? `<button class="btn-edit" onclick="registrarPerfilEquipo('${u.id}','${(u.full_name||'').replace(/'/g,"\\'")}')">+ Registrar</button>`
          : '—');

      const canEdit = currentUser.role === 'superadmin' ||
        (u.group_id === currentUser.group_id && u.role !== 'superadmin');

      return `
        <tr>
          <td>${u.full_name || '—'}</td>
          <td style="font-size:0.85rem;">${u.email || '—'}</td>
          <td><span class="role-tag">${ROLE_LABELS_U[u.role] || u.role}</span></td>
          <td>${currentUser.role === 'superadmin' && u.group_id
            ? `<span style="font-size:0.82rem;color:var(--brown-light);">${GROUP_NAMES[u.group_id]||u.group_id}</span>`
            : '—'}</td>
          <td>${perfilBadge}</td>
          <td><span class="status-badge ${u.is_active ? 'status-active' : 'status-inactive'}">
            ${u.is_active ? 'Activo' : 'Inactivo'}
          </span></td>
          <td class="td-actions">
            ${canEdit ? `<button class="btn-edit" onclick="openEditUser('${u.id}')">Editar</button>` : ''}
            ${canEdit && u.id !== currentUser.id ? `
              <button class="btn-danger" onclick="toggleUserStatus('${u.id}', ${u.is_active})">
                ${u.is_active ? 'Desactivar' : 'Activar'}
              </button>` : ''}
          </td>
        </tr>
      `;
    }).join('');
  });

  tbody.innerHTML = html;
}

function registrarPerfilEquipo(userId, userName) {
  if (typeof iniciarRegistroEquipo === 'function') {
    iniciarRegistroEquipo(userId, userName);
  } else {
    showToast('Error: módulo de registro no cargado.');
  }
}

function openCreateUser() {
  document.getElementById('modalUserTitle').textContent   = 'Nuevo Usuario';
  document.getElementById('modalUserId').value            = '';
  document.getElementById('modalUserName').value          = '';
  document.getElementById('modalUserEmail').value         = '';
  document.getElementById('modalUserEmail').disabled      = false;
  document.getElementById('modalUserPassword').value      = '';
  document.getElementById('modalUserPassword').value = 'Pascua!2026';  document.getElementById('modalUserError').textContent   = '';
  document.getElementById('passwordGroup').style.display  = 'block';

  // Grupo: si es superadmin puede elegir, si no se fija al suyo
  const groupSelect = document.getElementById('modalUserGroup');
  if (currentUser.role === 'superadmin') {
    groupSelect.disabled = false;
    groupSelect.value    = '';
  } else {
    groupSelect.disabled = true;
    groupSelect.value    = currentUser.group_id;
  }

  // Roles disponibles según quien crea
  updateRoleOptions();
  openModal('modalUser');
}

function updateRoleOptions() {
  const roleSelect = document.getElementById('modalUserRole');
  const isSuperadmin = currentUser.role === 'superadmin';

  roleSelect.innerHTML = `
    <option value="registrador">Registrador</option>
    <option value="secretario">Secretario</option>
    <option value="administrador">Administrador</option>
    <option value="contador">Contador</option>
    <option value="equipo">Equipo Base</option>
    ${isSuperadmin ? '<option value="superadmin">Superadmin</option>' : ''}
  `;
}

async function openEditUser(userId) {
  const { data: u } = await sb.from('user_profiles').select('*').eq('id', userId).single();
  if (!u) return;

  document.getElementById('modalUserTitle').textContent   = 'Editar Usuario';
  document.getElementById('modalUserId').value            = u.id;
  document.getElementById('modalUserName').value          = u.full_name || '';
  document.getElementById('modalUserEmail').value         = u.email || '';
  document.getElementById('modalUserEmail').disabled      = true;
  document.getElementById('modalUserPassword').value      = '';
  document.getElementById('modalUserError').textContent   = '';
  document.getElementById('passwordGroup').style.display  = 'none';

  updateRoleOptions();
  document.getElementById('modalUserRole').value  = u.role;

  const groupSelect = document.getElementById('modalUserGroup');
  groupSelect.value    = u.group_id || '';
  groupSelect.disabled = currentUser.role !== 'superadmin';

  openModal('modalUser');
}
async function saveUser() {
  const id       = document.getElementById('modalUserId').value;
  const name     = document.getElementById('modalUserName').value.trim();
  const email    = document.getElementById('modalUserEmail').value.trim();
  const password = document.getElementById('modalUserPassword').value;
  const role     = document.getElementById('modalUserRole').value;
  const groupId  = document.getElementById('modalUserGroup').value || null;
  const errEl    = document.getElementById('modalUserError');

  errEl.textContent = '';
  if (!name) { errEl.textContent = 'El nombre es obligatorio.'; return; }
  if (!id && role !== 'superadmin' && !groupId) {
    errEl.textContent = 'Selecciona un grupo.'; return;
  }

  if (!id) {
    // Crear nuevo usuario
    if (!email || !password) { errEl.textContent = 'Correo y contraseña son obligatorios.'; return; }
    if (password.length < 8) { errEl.textContent = 'Mínimo 8 caracteres.'; return; }

    const btn = document.querySelector('#modalUser .btn-action');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    // 1. Guardar sesión actual antes de que signUp la cambie
    const { data: { session: currentSession } } = await sb.auth.getSession();

    // 2. Crear el usuario en Auth
    const { data, error } = await sb.auth.signUp({ email, password });

    if (error) {
      errEl.textContent = error.message;
      if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
      return;
    }

    // 3. Insertar perfil directamente con el ID del nuevo usuario
    const { error: profileError } = await sb.from('user_profiles').insert({
      id:        data.user.id,
      full_name: name,
      email,
      role,
      is_active: true,
      group_id:  groupId,
    });

    if (profileError) {
      // Si ya existe, actualizar
      await sb.from('user_profiles').update({
        full_name: name, role, is_active: true, group_id: groupId
      }).eq('id', data.user.id);
    }

    // 4. Restaurar sesión del admin actual
    if (currentSession) {
      await sb.auth.setSession({
        access_token:  currentSession.access_token,
        refresh_token: currentSession.refresh_token,
      });
    }

    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
    closeModal('modalUser');
    showToast(`Usuario ${name} creado correctamente.`);
    loadUsers();

  } else {
    // Editar usuario existente
    const updates = { full_name: name, role };
    if (currentUser.role === 'superadmin') updates.group_id = groupId;

    const { error } = await sb.from('user_profiles').update(updates).eq('id', id);
    if (error) { errEl.textContent = 'Error al actualizar.'; return; }
    closeModal('modalUser');
    showToast('Usuario actualizado.');
    loadUsers();
  }
}

async function toggleUserStatus(userId, current) {
  await sb.from('user_profiles').update({ is_active: !current }).eq('id', userId);
  showToast(current ? 'Usuario desactivado.' : 'Usuario activado.');
  loadUsers();
}
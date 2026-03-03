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
              </button>
              <button class="btn-danger" onclick="deleteUser('${u.id}')">Eliminar</button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');
  });

  tbody.innerHTML = html;
}

// ─── Eliminar usuario
async function deleteUser(userId) {
  if (!confirm('¿Eliminar este usuario permanentemente? Esta acción no se puede deshacer.')) return;
  const { error } = await sb.from('user_profiles').delete().eq('id', userId);
  if (error) { showToast('Error al eliminar usuario.'); return; }
  showToast('Usuario eliminado.');
  loadUsers();
}

function registrarPerfilEquipo(userId, userName) {
  if (typeof iniciarRegistroEquipo === 'function') {
    iniciarRegistroEquipo(userId, userName);
  } else {
    showToast('Error: módulo de registro no cargado.');
  }
}

function openCreateUser() {
  const get = id => document.getElementById(id);
  if (!get('modalUserTitle')) { showToast('Error: recarga la página.'); return; }

  get('modalUserTitle').textContent  = 'Nuevo Usuario';
  get('modalUserId').value           = '';
  get('modalUserName').value         = '';
  get('modalUserEmail').value        = '';
  get('modalUserEmail').disabled     = false;
  get('modalUserPassword').value     = 'Pascua!2026';
  get('modalUserError').textContent  = '';
  get('passwordGroup').style.display = 'block';

  const groupSelect = get('modalUserGroup');
  if (groupSelect) {
    if (currentUser.role === 'superadmin') {
      groupSelect.disabled = false;
      groupSelect.value    = '';
    } else {
      groupSelect.disabled = true;
      groupSelect.value    = currentUser.group_id || '';
    }
  }

  updateRoleOptions();
  get('modalUserRole').value = 'registrador';
  openModal('modalUser');
}

function updateRoleOptions() {
  const roleSelect   = document.getElementById('modalUserRole');
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
  document.getElementById('modalUserRole').value = u.role;

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
    if (!email || !password) { errEl.textContent = 'Correo y contraseña son obligatorios.'; return; }
    if (password.length < 8) { errEl.textContent = 'Mínimo 8 caracteres.'; return; }

    const btn = document.querySelector('#modalUser .btn-action');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    const { data: { session: currentSession } } = await sb.auth.getSession();
    const { data, error } = await sb.auth.signUp({ email, password });

    console.log('signUp data:', data);
    console.log('signUp error:', error);

    if (error) {
      errEl.textContent = error.message;
      if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
      return;
    }

    const { error: insertError } = await sb.from('user_profiles').insert({
      id: data.user.id, full_name: name, email,
      role, is_active: true, group_id: groupId
    });

    console.log('insertError:', insertError);

    if (insertError) {
      const { error: updateError } = await sb.from('user_profiles').update({
        full_name: name, role, is_active: true, group_id: groupId
      }).eq('id', data.user.id);
      console.log('updateError:', updateError);
    }

    if (currentSession) {
      await sb.auth.setSession({
        access_token:  currentSession.access_token,
        refresh_token: currentSession.refresh_token,
      });
    }

    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
    closeModal('modalUser');
    showToast(`Usuario ${name} creado correctamente.`);

    const groupName = groupId ? (GROUP_NAMES[groupId] || groupId) : 'Sistema General';
    enviarCorreoBienvenida(name, email, password, groupName, role);

    loadUsers();

  } else {
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
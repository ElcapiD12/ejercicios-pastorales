// ═══════════════════════════════════════════
//  APP.JS — Core con soporte de grupos
// ═══════════════════════════════════════════

const { createClient } = supabase;
const sb = createClient(
  'https://pspzwvakiogyebtnebik.supabase.co',
  'sb_publishable_WU2ECqgZgNy3WEUK7sG3Yw_H1Cv7ytW'
);

// ─── STATE
let currentUser  = null;
let currentGroup = null; // { id, name }
let currentView  = 'welcome';

// --- CONSTANTE PARA ENVIAR CORREO ELECTRÓNICO
window.RESEND_API_KEY = 're_6mG3Rz1h_HXxbycVarNCc7AgSSUTbSkEE';

// ─── GRUPOS
const GROUPS = {
  kairos:    { id: 'kairos',    name: 'Jóvenes Kairós' },
  nazarenos: { id: 'nazarenos', name: 'Adolescentes Nazarenos' },
};

// ─── ROLES
const ROLE_LABELS = {
  superadmin:    'Superadmin',
  administrador: 'Administrador',
  secretario:    'Secretario',
  contador:      'Contador',
  registrador:   'Registrador', 
  equipo:        'Equipo Base',
};

// Tabs disponibles por rol
const ROLE_TABS = {
  superadmin:    ['usuarios', 'registro', 'asistencia', 'calendario', 'cooperacion'],
  administrador: ['usuarios', 'registro', 'asistencia', 'calendario', 'cooperacion'],
  secretario:    ['registro', 'asistencia', 'calendario'],
  contador:      ['cooperacion'],
  registrador:   ['registro', 'asistencia'],
  equipo:        ['asistencia'],
};

const TAB_CONFIG = {
  usuarios:    { icon: '👥', label: 'Usuarios' },
  registro:    { icon: '📷', label: 'Registro' },
  asistencia:  { icon: '📋', label: 'Asistencia' },
  calendario:  { icon: '📅', label: 'Calendario' },
  cooperacion: { icon: '💰', label: 'Cooperación' },
};

const loadedModules = {};

// ─── DOM READY
window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);
  document.getElementById('loginPassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });

  const { data: { session } } = await sb.auth.getSession();
  if (session) await bootApp();
});

// ─── LOGIN
async function handleLogin() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl  = document.getElementById('loginError');
  const btn      = document.getElementById('loginBtn');

  errorEl.textContent = '';

  if (!email || !password) {
    errorEl.textContent = 'Ingresa correo y contraseña.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Ingresando...';

  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });

    console.log("LOGIN RESPONSE:", data, error); // 👈 IMPORTANTE

    if (error) {
      errorEl.textContent = error.message;
      return;
    }

    console.log("Usuario autenticado:", data.user);

    await bootApp();

  } catch (err) {
    console.error("Error real:", err);
    errorEl.textContent = "Error de conexión con el servidor.";
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
}

// ─── BOOT APP
async function bootApp() {
   // Esperar un momento para que saveUser termine si está corriendo
  await new Promise(resolve => setTimeout(resolve, 500));

  const { data, error: userError } = await sb.auth.getUser();

  if (userError || !data.user) {
    console.error("No hay usuario activo");
    return;
  }

  const user = data.user;

  const { data: profile, error } = await sb
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Error al buscar perfil:", error);
    return;
  }

  if (!profile) {
    const { count } = await sb
      .from('user_profiles')
      .select('*', { count: 'exact', head: true });

    const role = (count === 0) ? 'superadmin' : 'registrador';

    await sb.from('user_profiles').insert({
  id: user.id, full_name: user.email, email: user.email, role: role, is_active: true
});

    return bootApp();
  }

  if (!profile.is_active) {
    await sb.auth.signOut();
    document.getElementById('loginError').textContent =
      'Tu cuenta está desactivada.';
    return;
  }

  currentUser  = { ...user, ...profile };
  currentGroup = profile.group_id ? GROUPS[profile.group_id] : null;

  document.getElementById('navUserName').textContent =
    profile.full_name || user.email;

  document.getElementById('navUserRole').textContent =
    ROLE_LABELS[profile.role] || profile.role;

  buildNav(profile.role);
  showPage('appPage');
  showView('welcome');
}
// ─── LOGOUT
async function handleLogout() {
  stopAsistCamera?.();
  stopCamera?.();
  await sb.auth.signOut();
  currentUser  = null;
  currentGroup = null;
  document.getElementById('loginEmail').value       = '';
  document.getElementById('loginPassword').value    = '';
  document.getElementById('loginError').textContent = '';
  showPage('loginPage');
}

// ─── BUILD NAV
function buildNav(role) {
  const tabs        = ROLE_TABS[role] || ['asistencia'];
  const navTabs     = document.getElementById('navTabs');
  const welcomeGrid = document.getElementById('welcomeGrid');

  navTabs.innerHTML     = '';
  welcomeGrid.innerHTML = '';

  // Tab Inicio
  const homeTab = document.createElement('button');
  homeTab.className    = 'nav-tab active';
  homeTab.textContent  = '✝️ Inicio';
  homeTab.dataset.view = 'welcome';
  homeTab.onclick      = () => showView('welcome');
  navTabs.appendChild(homeTab);

  tabs.forEach(t => {
    const cfg = TAB_CONFIG[t];
    const btn = document.createElement('button');
    btn.className    = 'nav-tab';
    btn.textContent  = `${cfg.icon} ${cfg.label}`;
    btn.dataset.view = t;
    btn.onclick      = () => showView(t);
    navTabs.appendChild(btn);

    const card = document.createElement('div');
    card.className = 'welcome-card';
    card.innerHTML = `<div class="card-icon">${cfg.icon}</div><h3>${cfg.label}</h3>`;
    card.onclick   = () => showView(t);
    welcomeGrid.appendChild(card);
  });
}

// ─── SHOW VIEW
async function showView(name) {
  if (currentView === 'asistencia' && name !== 'asistencia') stopAsistCamera?.();
  if (currentView === 'registro'   && name !== 'registro')   stopCamera?.();
  currentView = name;

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.view === name);
  });

  if (name === 'welcome') {
    document.getElementById('viewWelcome').classList.add('active');
    // Mostrar nombre del grupo en bienvenida
    const grpEl = document.getElementById('welcomeGroupName');
    if (grpEl) grpEl.textContent = currentGroup ? currentGroup.name : 'Sistema General';
    return;
  }

  const container = document.getElementById(`view-${name}`);
  if (!container) return;

  if (!loadedModules[name]) {
    try {
      const res  = await fetch(`modules/${name}/${name}.html`);
      const html = await res.text();
      container.innerHTML = html;

      // Inyectar modales
      
      container.querySelectorAll('.modal-overlay').forEach(el => el.remove());

      loadedModules[name] = true;
      // Verificar que los modales estén en el DOM siempre
  const modalsContainer = document.getElementById('modals-container');
  try {
    const res2  = await fetch(`modules/${name}/${name}.html`);
    const html2 = await res2.text();
    const temp  = document.createElement('div');
    temp.innerHTML = html2;
    temp.querySelectorAll('.modal-overlay').forEach(modal => {
      if (!document.getElementById(modal.id)) {
        modalsContainer.appendChild(modal.cloneNode(true));
      }
    });
  } catch(e) {}
    } catch (err) {
      container.innerHTML = `<div class="coming-soon">
        <div class="big-icon">🔧</div>
        <h3>Módulo no encontrado</h3>
        <p>modules/${name}/${name}.html</p>
      </div>`;
      container.classList.add('active');
      return;
    }
  }

  container.classList.add('active');

  if (name === 'usuarios')    loadUsers?.();
  if (name === 'registro')    initRegistro?.();
  if (name === 'asistencia')  initAsistencia?.();
  if (name === 'calendario')  initCalendario?.();
  if (name === 'cooperacion') initCooperacion?.();
}

// ─── HELPERS
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });

  const page = document.getElementById(pageId);
  if (page) {
    page.classList.add('active');
  }
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;

  modal.classList.add('active');

  // Evitar cierre inmediato por propagación
  setTimeout(() => {
    modal.dataset.ready = "true";
  }, 50);
}
function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;

  modal.classList.remove('active');
  modal.dataset.ready = "false";
}
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ─── HELPER: filtro de grupo para queries
// Retorna el group_id del usuario actual o null si es superadmin
function getGroupFilter() {
  return currentUser?.group_id || null;
}

// ─── HELPER: aplicar filtro de grupo a query de supabase
function applyGroupFilter(query, column = 'group_id') {
  const groupId = getGroupFilter();
  if (groupId) return query.eq(column, groupId);
  return query; // superadmin ve todo
}
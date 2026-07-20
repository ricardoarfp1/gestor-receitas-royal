/* ============================================================
   GESTOR DE RECEITAS — Core JS
   Supabase · Auth · Router · Toast · Utils
   ============================================================ */

// ── Supabase ──────────────────────────────────────────────────
const SUPABASE_URL  = window.SUPABASE_URL  || '';
const SUPABASE_ANON = window.SUPABASE_ANON_KEY || '';
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ── Estado Global ─────────────────────────────────────────────
window.App = {
  user:        null,
  perfil:      null,
  route:       null,
  params:      {},
  navigating:  false,   // trava anti-loop
};

// ── Toast ──────────────────────────────────────────────────────
function toast(msg, tipo = 'ok', dur = 3500) {
  let c = document.getElementById('toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toast-container';
    c.className = 'toast-container';
    document.body.appendChild(c);
  }
  const icons = { ok:'✓', danger:'✕', amber:'⚠', info:'ℹ' };
  const t = document.createElement('div');
  t.className = `toast ${tipo}`;
  t.innerHTML = `<span>${icons[tipo]||'•'}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => t.remove(), dur);
}

// ── Router SPA — com proteção anti-loop ──────────────────────
const routes = {};

function registerRoute(name, fn) { routes[name] = fn; }

function navigate(name, params = {}) {
  // Proteção: ignora navegação repetida para a mesma rota
  if (App.navigating) return;
  // Reset cache se mudar de rota
  if (name !== App.route) { _authChecked = false; _authResult = null; }
  if (App.route === name && JSON.stringify(App.params) === JSON.stringify(params)) return;

  App.navigating = true;
  App.route  = name;
  App.params = params;

  const fn = routes[name];
  if (!fn) {
    console.warn('Rota não encontrada:', name);
    App.navigating = false;
    return;
  }

  // Atualizar hash
  try {
    const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
    history.replaceState(null, '', '#' + name + qs);
  } catch(e) {}

  // Executar rota
  Promise.resolve(fn(params)).finally(() => {
    App.navigating = false;
  });
}

// ── Auth ──────────────────────────────────────────────────────
let _authChecked = false;
let _authResult  = null;

async function checkAuth() {
  // Retorna resultado em cache para evitar múltiplas chamadas
  if (_authChecked && _authResult !== null) return _authResult;

  try {
    const { data: { session } } = await _sb.auth.getSession();
    if (!session) {
      _authChecked = true;
      _authResult  = false;
      if (App.route !== 'login') navigate('login');
      return false;
    }
    App.user = session.user;

    const { data: perfil } = await _sb.from('usuarios')
      .select('*').eq('id', session.user.id).single();

    if (!perfil) {
      _authChecked = true;
      _authResult  = false;
      if (App.route !== 'login') navigate('login');
      return false;
    }

    App.perfil   = perfil;
    _authChecked = true;
    _authResult  = true;
    return true;

  } catch(e) {
    console.error('Erro de autenticação:', e);
    _authChecked = true;
    _authResult  = false;
    if (App.route !== 'login') navigate('login');
    return false;
  }
}

async function login(email, senha) {
  const { error } = await _sb.auth.signInWithPassword({ email, password: senha });
  if (!error) {
    // Reset cache de auth ao fazer login
    _authChecked = false;
    _authResult  = null;
    App.user     = null;
    App.perfil   = null;
  }
  return error;
}

async function logout() {
  await _sb.auth.signOut();
  App.user     = null;
  App.perfil   = null;
  _authChecked = false;
  _authResult  = null;
  App.route    = null;
  navigate('login');
}

// ── DB helpers ────────────────────────────────────────────────
const db = {
  from: (t) => _sb.from(t),
  auth: _sb.auth,
};

// ── Online / Offline ──────────────────────────────────────────
let isOnline = navigator.onLine;
window.addEventListener('online',  () => { isOnline = true;  updateSyncBadge(); });
window.addEventListener('offline', () => { isOnline = false; updateSyncBadge(); });

function updateSyncBadge() {
  document.querySelectorAll('.sync-badge').forEach(el => {
    el.className = `sync-badge ${isOnline ? 'sync-online' : 'sync-offline'}`;
    el.innerHTML = `<span class="sync-dot"></span>${isOnline ? 'Online' : 'Offline'}`;
  });
}

// ── Utils ─────────────────────────────────────────────────────
function fmt(d) {
  if (!d) return '—';
  return new Date(typeof d === 'string' && !d.includes('T') ? d + 'T12:00:00' : d)
    .toLocaleDateString('pt-BR');
}

function fmtDatetime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', {
    day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit'
  });
}

function addDias(d, n) {
  const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt;
}

// ── Ícones SVG ────────────────────────────────────────────────
const ICONS = {
  home:       '<rect x="3" y="9" width="18" height="13" rx="2"/><path d="M3 9l9-7 9 7"/>',
  book:       '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>',
  clipboard:  '<path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
  package:    '<path d="M12 2l10 6.5v7L12 22 2 15.5v-7L12 2z"/><path d="M12 22V9M2 8.5l10 6.5 10-6.5"/>',
  check_sq:   '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>',
  users:      '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>',
  settings:   '<circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>',
  logout:     '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>',
  plus:       '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  edit:       '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  trash:      '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/>',
  eye:        '<path d="M1 12S5 5 12 5s11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  archive:    '<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>',
  arrow_left: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  arrow_right:'<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  save:       '<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  user_x:     '<path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/>',
  user_check: '<path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>',
  search:     '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  alert:      '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  chevron_r:  '<polyline points="9 18 15 12 9 6"/>',
  chevron_d:  '<polyline points="6 9 12 15 18 9"/>',
  mail:       '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  lock:       '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>',
  refresh:    '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>',
  check_circ: '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  x_circ:     '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  x:          '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  scale:      '<line x1="12" y1="20" x2="12" y2="4"/><line x1="2" y1="20" x2="22" y2="20"/><path d="M2 12l10-8 10 8"/><path d="M4 20v-8l8-6 8 6v8"/>',
  printer:    '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  chef:       '<path d="M18 6a4 4 0 00-4-4 4 4 0 00-8 0 4 4 0 00-4 4 3 3 0 000 6h16a3 3 0 000-6z"/><line x1="6" y1="12" x2="6" y2="21"/><line x1="18" y1="12" x2="18" y2="21"/><line x1="12" y1="12" x2="12" y2="21"/>',
};

function icon(name, size = 18) {
  const inner = ICONS[name] || '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

function perfil_badge(p) {
  const cls = { padeiro:'badge-padeiro', nutri:'badge-nutri', gestor:'badge-gestor', admin:'badge-admin' };
  const lab = { padeiro:'Padeiro', nutri:'Nutricionista', gestor:'Gestor', admin:'Admin' };
  return `<span class="badge ${cls[p]||''}">${lab[p]||p}</span>`;
}

function status_badge(s) {
  const cls = { rascunho:'badge-rascunho', validada:'badge-validada', ativa:'badge-ativa', arquivada:'badge-arquivada' };
  const lab = { rascunho:'Rascunho', validada:'Validada', ativa:'Ativa', arquivada:'Arquivada' };
  return `<span class="badge ${cls[s]||''}">${lab[s]||s}</span>`;
}

// ── Render helpers ────────────────────────────────────────────
function renderApp(html) {
  const el = document.getElementById('app');
  if (el) el.innerHTML = html;
}

function setMain(html) {
  const el = document.getElementById('main-content');
  if (el) el.innerHTML = html;
}

function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
function confirmDialog(msg) { return confirm(msg); }

// ── Init — sem loop ───────────────────────────────────────────
window.addEventListener('load', async () => {
  // Pequeno delay para garantir que o DOM está pronto
  await new Promise(r => setTimeout(r, 100));

  const hash = window.location.hash.replace('#', '').split('?')[0];
  const qs   = window.location.hash.includes('?')
    ? Object.fromEntries(new URLSearchParams(window.location.hash.split('?')[1]))
    : {};

  if (hash && hash !== 'login' && routes[hash]) {
    const ok = await checkAuth();
    if (ok) {
      navigate(hash, qs);
    }
    // se não ok, checkAuth já navegou para login
  } else {
    navigate('login');
  }
});

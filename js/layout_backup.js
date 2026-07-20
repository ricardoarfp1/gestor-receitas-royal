/* ============================================================
   GESTOR DE RECEITAS — Layout / Sidebar + Sino + Alertas
   ============================================================ */

const NAV_ITEMS = [
  { id:'dashboard',    label:'Painel',       icon:'home',     perfis:['gestor','admin','nutri'] },
  { id:'receitas',     label:'Receitas',     icon:'book',     perfis:['gestor','admin','nutri'] },
  { id:'auditoria',    label:'Validações',   icon:'clipboard',perfis:['nutri','admin','gestor'] },
  { id:'producao',     label:'Produção',     icon:'package',  perfis:['gestor','admin'] },
  { id:'conformidade', label:'Conformidade', icon:'check_sq', perfis:['gestor','admin','nutri'] },
  { id:'usuarios',     label:'Usuários',     icon:'users',    perfis:['admin'] },
  { id:'setup_sku',    label:'Setup SKU',    icon:'settings', perfis:['admin'] },
];

function renderLayout(pageHtml, activeRoute) {
  const p = App.perfil;
  const items = NAV_ITEMS.filter(n => n.perfis.includes(p?.perfil || 'gestor'));

  const nav = items.map(item => `
    <button class="nav-item ${activeRoute === item.id ? 'active' : ''}"
      onclick="navigate('${item.id}')">
      ${icon(item.icon)} <span>${item.label}</span>
    </button>
  `).join('');

  renderApp(`
    <div class="app-layout">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div class="brand-icon">🍞</div>
          <div class="brand-text">
            <h1>Gestor de Receitas</h1>
            <p>Supermercado Royal</p>
          </div>
        </div>
        <nav class="sidebar-nav">${nav}</nav>
        <div class="sidebar-footer">
          <div class="sidebar-user">
            <div class="u-name">${p?.nome || '—'}</div>
            <div class="u-role">${p?.perfil || ''}</div>
          </div>
          <button class="nav-item" onclick="logout()">
            ${icon('logout')} <span>Sair</span>
          </button>
        </div>
      </aside>
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden">

        <!-- BARRA SUPERIOR -->
        <div style="background:#fff;border-bottom:2px solid #E5E7EB;padding:10px 28px;
          display:flex;justify-content:flex-end;align-items:center;gap:12px;
          min-height:52px;flex-shrink:0">

          <!-- Alerta conformidade -->
          <div id="alerta-conf-bar">
            <span style="font-size:11px;color:#9CA3AF">Verificando conformidade...</span>
          </div>

          <!-- Sino -->
          <div style="position:relative">
            <button id="btn-sino" onclick="toggleSino()"
              style="background:#F5F7FA;border:1.5px solid #E5E7EB;border-radius:10px;
                     cursor:pointer;padding:8px 10px;display:flex;align-items:center;
                     gap:6px;color:#1B2A4A;font-size:12px;font-weight:600;
                     position:relative">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 01-3.46 0"/>
              </svg>
              <span id="sino-label">Notificações</span>
              <span id="sino-badge" style="display:none;background:#C0392B;color:#fff;
                border-radius:99px;padding:1px 6px;font-size:10px;font-weight:700">0</span>
            </button>

            <!-- Dropdown -->
            <div id="sino-dropdown" style="display:none;position:absolute;right:0;top:48px;
              width:340px;background:#fff;border-radius:14px;
              box-shadow:0 8px 32px rgba(0,0,0,0.15);z-index:9999;
              border:1px solid #E5E7EB;overflow:hidden">
              <div style="background:#1B2A4A;padding:14px 16px;display:flex;
                justify-content:space-between;align-items:center">
                <span style="color:#fff;font-weight:700;font-size:13px">Notificações</span>
                <button onclick="marcarTodasLidas()"
                  style="background:none;border:none;color:rgba(255,255,255,0.5);
                         font-size:11px;cursor:pointer;font-weight:600">
                  Marcar todas como lidas
                </button>
              </div>
              <div id="sino-lista" style="max-height:360px;overflow-y:auto">
                <div style="text-align:center;padding:24px;color:#9CA3AF;font-size:13px">
                  Carregando...
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- CONTEÚDO -->
        <div class="page-body" id="main-content" style="flex:1;overflow-y:auto">
          ${pageHtml}
        </div>
      </div>
    </div>
  `);

  // Carregar dados após render
  setTimeout(verificarConformidade, 300);
  setTimeout(carregarNotificacoes, 500);
}

// ── Conformidade ──────────────────────────────────────────────
async function verificarConformidade() {
  const el = document.getElementById('alerta-conf-bar');
  if (!el) return;

  const hoje = new Date().toISOString().split('T')[0];
  const { data } = await db.from('checklists_conformidade')
    .select('percentual,itens_ok,itens_total')
    .eq('data_checklist', hoje)
    .maybeSingle();

  if (!data) {
    const hora = new Date().getHours();
    if (hora >= 9) {
      el.innerHTML = `
        <div onclick="navigate('conformidade')"
          style="display:flex;align-items:center;gap:8px;background:#FEF2F2;
            border:1.5px solid #FECACA;border-radius:8px;padding:6px 14px;cursor:pointer">
          <span>⚠</span>
          <span style="font-size:12px;font-weight:700;color:#C0392B">
            Checklist não preenchido hoje
          </span>
          <span style="font-size:11px;color:#EF4444;text-decoration:underline">Preencher →</span>
        </div>`;
    } else {
      el.innerHTML = `<span style="font-size:11px;color:#9CA3AF">Checklist pendente</span>`;
    }
  } else if (data.percentual < 75) {
    el.innerHTML = `
      <div onclick="navigate('conformidade')"
        style="display:flex;align-items:center;gap:8px;background:#FFFBEB;
          border:1.5px solid #FDE68A;border-radius:8px;padding:6px 14px;cursor:pointer">
        <span>⚠</span>
        <span style="font-size:12px;font-weight:700;color:#B45309">
          Conformidade ${data.percentual}% — ${data.itens_ok}/${data.itens_total} itens
        </span>
        <span style="font-size:11px;color:#D97706;text-decoration:underline">Ver →</span>
      </div>`;
  } else {
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;background:#F0FDF4;
        border:1.5px solid #BBF7D0;border-radius:8px;padding:6px 14px">
        <span>✅</span>
        <span style="font-size:12px;font-weight:700;color:#15803D">
          Conformidade ${data.percentual}% hoje
        </span>
      </div>`;
  }
}

// ── Sino de Notificações ──────────────────────────────────────
async function carregarNotificacoes() {
  const badge  = document.getElementById('sino-badge');
  const lista  = document.getElementById('sino-lista');
  if (!lista) return;

  const { data: notifs } = await db.from('notificacoes')
    .select('*').order('criado_em', { ascending: false }).limit(15);

  const naoLidas = (notifs||[]).filter(n => !n.lida).length;

  if (badge) {
    if (naoLidas > 0) {
      badge.style.display = 'inline';
      badge.textContent   = naoLidas;
    } else {
      badge.style.display = 'none';
    }
  }

  if (!(notifs||[]).length) {
    lista.innerHTML = `
      <div style="text-align:center;padding:28px;color:#9CA3AF;font-size:13px">
        Nenhuma notificação
      </div>`;
    return;
  }

  lista.innerHTML = (notifs||[]).map(n => `
    <div onclick="marcarLida('${n.id}')"
      style="padding:14px 16px;border-bottom:1px solid #F3F4F6;cursor:pointer;
        background:${n.lida ? '#fff' : '#F0F9FF'};
        transition:background 0.15s">
      <div style="display:flex;align-items:flex-start;gap:10px">
        <span style="font-size:18px;flex-shrink:0">
          ${n.tipo === 'nova_receita' ? '🍞' : n.tipo === 'conformidade_baixa' ? '⚠️' : '✅'}
        </span>
        <div style="flex:1;min-width:0">
          <p style="margin:0;font-size:12px;font-weight:700;color:#1B2A4A">${n.titulo}</p>
          <p style="margin:3px 0 0;font-size:11px;color:#6B7280;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${n.descricao||''}</p>
          <p style="margin:4px 0 0;font-size:10px;color:#9CA3AF">
            ${new Date(n.criado_em).toLocaleString('pt-BR')}
          </p>
        </div>
        ${!n.lida ? '<span style="width:8px;height:8px;background:#3B82F6;border-radius:50%;flex-shrink:0;margin-top:4px"></span>' : ''}
      </div>
    </div>`).join('');
}

function toggleSino() {
  const d = document.getElementById('sino-dropdown');
  if (!d) return;
  const aberto = d.style.display === 'block';
  d.style.display = aberto ? 'none' : 'block';
  if (!aberto) carregarNotificacoes();

  if (!aberto) {
    setTimeout(() => {
      function fecharFora(e) {
        const btn = document.getElementById('btn-sino');
        const drop= document.getElementById('sino-dropdown');
        if (!btn?.contains(e.target) && !drop?.contains(e.target)) {
          if (drop) drop.style.display = 'none';
          document.removeEventListener('click', fecharFora);
        }
      }
      document.addEventListener('click', fecharFora);
    }, 100);
  }
}

async function marcarLida(id) {
  await db.from('notificacoes').update({ lida: true }).eq('id', id);
  carregarNotificacoes();
}

async function marcarTodasLidas() {
  await db.from('notificacoes').update({ lida: true }).eq('lida', false);
  carregarNotificacoes();
}

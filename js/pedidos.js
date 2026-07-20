/* ============================================================
   GESTOR DE RECEITAS — Módulo Pedidos Filial
   Filial pede → Sistema separa por setor → Padeiro executa
   ============================================================ */

// ── Mapeamento setor → perfil responsável ────────────────────
const SETOR_RESPONSAVEL = {
  'BISCOITOS':                         'VANDERLEI',
  'BOLOS SIMPLES':                     'KEILIZ',
  'DOCES DIVERSOS / CONF. SECA':       'FRANCIELE',
  'PÃES DOCES ESPECIAIS':              'EVERTON',
  'FOLHADOS ESPECIAIS':                'EVERTON',
  'PÃES EMBALADOS':                    'PADEIROS',
  'PÃES RÚSTICOS FERMENTAÇÃO NATURAL': 'PADARIA',
  'CUCAS':                             'PADARIA',
};

// ── PEDIDOS — LISTA ──────────────────────────────────────────
registerRoute('pedidos', async () => {
  if (!await checkAuth()) return;
  renderLayout('', 'pedidos');

  const { data: pedidos } = await db.from('pedidos_filial')
    .select('*, usuarios(nome)')
    .order('data_pedido', { ascending: false })
    .limit(30);

  const hoje = new Date().toISOString().split('T')[0];

  const rows = (pedidos || []).map(p => {
    const corStatus = { aberto: 'badge-rascunho', enviado: 'badge-validada', concluido: 'badge-ativa' };
    const labStatus = { aberto: 'Aberto', enviado: 'Enviado', concluido: 'Concluído' };
    return `
      <tr>
        <td><strong>${fmt(p.data_pedido)}</strong></td>
        <td>${p.unidade_orig}</td>
        <td><span style="font-size:0.8rem;background:#EFF6FF;color:#1D4ED8;padding:3px 10px;border-radius:99px;font-weight:700">${p.cronograma}</span></td>
        <td>${p.usuarios?.nome || '—'}</td>
        <td><span class="badge ${corStatus[p.status]}">${labStatus[p.status]}</span></td>
        <td>
          <div class="flex gap-8">
            <button class="btn btn-ghost btn-icon" onclick="navigate('pedido_ver',{id:'${p.id}'})">${icon('eye')}</button>
            ${p.status === 'aberto' ? `<button class="btn btn-ghost btn-icon" onclick="navigate('pedido_form',{id:'${p.id}'})">${icon('edit')}</button>` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');

  setMain(`
    <div class="page-header">
      <div class="ph-left">
        <h1>Pedidos da Filial</h1>
        <p>Universitário → Matriz · Ordens de produção por setor</p>
      </div>
      <div class="ph-right">
        <button class="btn btn-primary" onclick="navigate('pedido_form',{id:'novo'})">
          ${icon('plus')} Novo Pedido
        </button>
      </div>
    </div>

    <div class="card no-pad">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Data</th><th>Unidade</th><th>Cronograma</th><th>Criado por</th><th>Status</th><th>Ações</th></tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">Nenhum pedido ainda</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `);
});

// ── PEDIDO FORM — Preenchimento por setor ────────────────────
let _pedidoItens = {};

registerRoute('pedido_form', async ({ id = 'novo' } = {}) => {
  if (!await checkAuth()) return;
  const isNovo = id === 'novo';
  renderLayout('', 'pedidos');

  // Carregar setores e produtos
  const [{ data: setores }, { data: produtos }] = await Promise.all([
    db.from('setores_producao').select('*').order('ordem'),
    db.from('produtos_pedido').select('*, setores_producao(nome)').eq('ativo', true).order('ordem'),
  ]);

  // Inicializar itens
  _pedidoItens = {};
  (produtos || []).forEach(p => { _pedidoItens[p.id] = ''; });

  let pedido = { data_pedido: new Date().toISOString().split('T')[0], cronograma: '18h→15h', unidade_orig: 'UNIVERSITÁRIO' };

  if (!isNovo) {
    const [{ data: p }, { data: itens }] = await Promise.all([
      db.from('pedidos_filial').select('*').eq('id', id).single(),
      db.from('itens_pedido').select('*').eq('pedido_id', id),
    ]);
    if (p) pedido = { ...pedido, ...p };
    if (itens) itens.forEach(i => {
      const prod = (produtos || []).find(pr => pr.codigo === i.codigo && pr.nome === i.produto);
      if (prod) _pedidoItens[prod.id] = i.quantidade || '';
    });
  }

  // Agrupar produtos por setor
  const prodPorSetor = {};
  (setores || []).forEach(s => { prodPorSetor[s.id] = []; });
  (produtos || []).forEach(p => {
    if (p.setor_id && prodPorSetor[p.setor_id]) prodPorSetor[p.setor_id].push(p);
  });

  const setoresHtml = (setores || []).map(s => {
    const prods = prodPorSetor[s.id] || [];
    const itensHtml = prods.map(p => `
      <div class="flex items-center gap-12" style="padding:8px 0;border-bottom:1px solid var(--mid)">
        <span style="font-size:0.72rem;font-family:var(--font-mono);color:var(--gray);width:60px;flex-shrink:0">${p.codigo || '—'}</span>
        <span style="flex:1;font-size:0.875rem;color:var(--navy)">${p.nome}</span>
        <input type="number" min="0" placeholder="—"
          id="qty-${p.id}"
          value="${_pedidoItens[p.id] || ''}"
          onchange="_pedidoItens['${p.id}']=this.value"
          style="width:80px;text-align:center;font-family:var(--font-mono);font-weight:700;
            font-size:1rem;border:1.5px solid var(--mid);border-radius:8px;padding:6px 8px;
            background:${_pedidoItens[p.id] ? '#F0FDF4' : '#fff'}"
          oninput="this.style.background=this.value?'#F0FDF4':'#fff'" />
      </div>`).join('');

    return `
      <div class="card mb-16" id="setor-${s.id}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid var(--navy)">
          <div>
            <h3 style="color:var(--navy);margin:0">${s.nome}</h3>
            <span style="font-size:0.75rem;font-weight:700;color:var(--gold)">Responsável: ${s.responsavel}</span>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="limparSetor('${s.id}')">Limpar</button>
        </div>
        <div style="display:grid;grid-template-columns:60px 1fr 80px;gap:0;padding:0 0 4px">
          <span style="font-size:0.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase">Cód</span>
          <span style="font-size:0.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase">Produto</span>
          <span style="font-size:0.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;text-align:center">Qtd</span>
        </div>
        ${itensHtml}
      </div>`;
  }).join('');

  setMain(`
    <div style="max-width:860px">
      <div class="flex items-center gap-12 mb-24">
        <button class="btn btn-ghost btn-icon" onclick="navigate('pedidos')">${icon('arrow_left', 22)}</button>
        <div>
          <h1>${isNovo ? 'Novo Pedido' : 'Editar Pedido'}</h1>
          <p class="text-sm text-muted">Preencha as quantidades — apenas os itens com quantidade serão enviados</p>
        </div>
      </div>

      <!-- Cabeçalho -->
      <div class="card mb-16">
        <div class="field-row col-3">
          <div>
            <label class="lbl">Data do Pedido</label>
            <input type="date" id="ped-data" value="${pedido.data_pedido}" />
          </div>
          <div>
            <label class="lbl">Cronograma</label>
            <select id="ped-crono">
              <option value="18h→15h"  ${pedido.cronograma === '18h→15h' ? 'selected' : ''}>Recebe 18h → Entrega 15h</option>
              <option value="14h→10h"  ${pedido.cronograma === '14h→10h' ? 'selected' : ''}>Recebe 14h → Entrega 10h</option>
            </select>
          </div>
          <div>
            <label class="lbl">Unidade Solicitante</label>
            <input type="text" id="ped-unidade" value="${pedido.unidade_orig}" />
          </div>
        </div>
      </div>

      <!-- Setores -->
      ${setoresHtml}

      <div id="form-erro" class="alert alert-danger hidden mb-16"></div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="salvarPedido('${id}')" id="btn-salvar-ped">
          ${icon('save')} Salvar e Enviar Ordens
        </button>
        <button class="btn btn-outline" onclick="navigate('pedidos')">Cancelar</button>
      </div>
    </div>
  `);
});

function limparSetor(setorId) {
  const inputs = document.querySelectorAll(`#setor-${setorId} input[type="number"]`);
  inputs.forEach(inp => {
    const prodId = inp.id.replace('qty-', '');
    _pedidoItens[prodId] = '';
    inp.value = '';
    inp.style.background = '#fff';
  });
}

async function salvarPedido(id) {
  const isNovo = id === 'novo';
  const btn  = document.getElementById('btn-salvar-ped');
  const erro = document.getElementById('form-erro');
  erro.classList.add('hidden');

  const data    = document.getElementById('ped-data').value;
  const crono   = document.getElementById('ped-crono').value;
  const unidade = document.getElementById('ped-unidade').value;

  // Coletar valores do DOM
  Object.keys(_pedidoItens).forEach(id => {
    const el = document.getElementById(`qty-${id}`);
    if (el) _pedidoItens[id] = el.value;
  });

  // Filtrar apenas itens com quantidade
  const { data: produtos } = await db.from('produtos_pedido')
    .select('*, setores_producao(id,nome,responsavel)').eq('ativo', true);

  const itensPedido = Object.entries(_pedidoItens)
    .filter(([, qtd]) => qtd && parseFloat(qtd) > 0)
    .map(([prodId, qtd]) => {
      const prod = (produtos || []).find(p => p.id === prodId);
      return prod ? { prod, qtd } : null;
    }).filter(Boolean);

  if (!itensPedido.length) {
    erro.textContent = 'Informe pelo menos uma quantidade.';
    erro.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = icon('refresh') + ' Salvando...';

  // Salvar cabeçalho
  let pedidoId = id;
  if (isNovo) {
    const { data: p, error } = await db.from('pedidos_filial').insert({
      data_pedido: data, cronograma: crono,
      unidade_orig: unidade, criado_por: App.perfil?.id,
      status: 'enviado',
    }).select().single();
    if (error) { erro.textContent = error.message; erro.classList.remove('hidden'); btn.disabled = false; btn.innerHTML = icon('save') + ' Salvar e Enviar Ordens'; return; }
    pedidoId = p.id;
  } else {
    await db.from('pedidos_filial').update({ data_pedido: data, cronograma: crono, unidade_orig: unidade, status: 'enviado' }).eq('id', id);
    await db.from('itens_pedido').delete().eq('pedido_id', id);
  }

  // Salvar itens
  const itensPayload = itensPedido.map(({ prod, qtd }) => ({
    pedido_id:       pedidoId,
    codigo:          prod.codigo || null,
    produto:         prod.nome,
    setor_id:        prod.setor_id,
    quantidade:      qtd,
    status_producao: 'pendente',
  }));

  await db.from('itens_pedido').insert(itensPayload);

  // Notificação
  await salvarNotificacaoBanco(
    'pedido_filial',
    `Pedido da filial — ${new Date(data).toLocaleDateString('pt-BR')}`,
    `${itensPedido.length} itens · Cronograma ${crono}`
  );

  toast('Ordens de produção enviadas!', 'ok');
  navigate('pedido_ver', { id: pedidoId });
}

// ── PEDIDO VER — Dashboard por setor ─────────────────────────
registerRoute('pedido_ver', async ({ id } = {}) => {
  if (!await checkAuth()) return;
  renderLayout('', 'pedidos');

  const [{ data: p }, { data: itens }, { data: setores }] = await Promise.all([
    db.from('pedidos_filial').select('*, usuarios(nome)').eq('id', id).single(),
    db.from('itens_pedido').select('*, setores_producao(nome,responsavel)').eq('pedido_id', id).order('setor_id'),
    db.from('setores_producao').select('*').order('ordem'),
  ]);

  // Agrupar por setor
  const porSetor = {};
  (setores || []).forEach(s => { porSetor[s.id] = { setor: s, itens: [] }; });
  (itens || []).forEach(i => { if (i.setor_id && porSetor[i.setor_id]) porSetor[i.setor_id].itens.push(i); });

  const total   = itens?.length || 0;
  const concl   = itens?.filter(i => i.status_producao === 'concluido').length || 0;
  const pct     = total ? Math.round(concl / total * 100) : 0;
  const corPct  = pct === 100 ? 'var(--ok)' : pct >= 50 ? 'var(--gold)' : 'var(--danger)';

  const setoresHtml = Object.values(porSetor)
    .filter(g => g.itens.length > 0)
    .map(g => {
      const concSetor = g.itens.filter(i => i.status_producao === 'concluido').length;
      const corS = concSetor === g.itens.length ? 'var(--ok)' : concSetor > 0 ? 'var(--gold)' : 'var(--gray)';

      const itensHtml = g.itens.map(i => `
        <div class="flex items-center gap-12" style="padding:8px 0;border-bottom:1px solid var(--mid)">
          <span style="font-size:0.72rem;font-family:var(--font-mono);color:var(--gray);width:60px;flex-shrink:0">${i.codigo || '—'}</span>
          <span style="flex:1;font-size:0.875rem;color:${i.status_producao === 'concluido' ? 'var(--ok)' : 'var(--navy)'}">
            ${i.status_producao === 'concluido' ? '✓ ' : ''}${i.produto}
          </span>
          <span style="font-family:var(--font-mono);font-weight:700;font-size:1.1rem;color:var(--navy);width:80px;text-align:center">
            ${i.quantidade}
          </span>
          <span class="badge ${i.status_producao === 'concluido' ? 'badge-ativa' : i.status_producao === 'produzindo' ? 'badge-validada' : 'badge-rascunho'}">
            ${i.status_producao === 'concluido' ? 'Concluído' : i.status_producao === 'produzindo' ? 'Produzindo' : 'Pendente'}
          </span>
        </div>`).join('');

      return `
        <div class="card mb-16">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:12px;border-bottom:2px solid var(--navy)">
            <div>
              <h3 style="color:var(--navy);margin:0">${g.setor.nome}</h3>
              <span style="font-size:0.75rem;font-weight:700;color:var(--gold)">Responsável: ${g.setor.responsavel}</span>
            </div>
            <div class="flex items-center gap-12">
              <span style="font-size:0.8rem;font-weight:700;color:${corS}">${concSetor}/${g.itens.length} concluídos</span>
              <button class="btn btn-outline btn-sm" onclick="imprimirOrdem('${id}','${g.setor.id}')">
                ${icon('printer', 14)} Imprimir
              </button>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:60px 1fr 80px 100px;padding:0 0 6px">
            <span style="font-size:0.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase">Cód</span>
            <span style="font-size:0.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase">Produto</span>
            <span style="font-size:0.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;text-align:center">Qtd</span>
            <span style="font-size:0.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;text-align:center">Status</span>
          </div>
          ${itensHtml}
        </div>`;
    }).join('');

  setMain(`
    <div style="max-width:860px">
      <div class="flex items-center gap-12 mb-16">
        <button class="btn btn-ghost btn-icon" onclick="navigate('pedidos')">${icon('arrow_left', 22)}</button>
        <div style="flex:1">
          <h1>Pedido — ${fmt(p?.data_pedido)}</h1>
          <p class="text-sm text-muted">${p?.unidade_orig} · Cronograma: ${p?.cronograma} · Criado por: ${p?.usuarios?.nome || '—'}</p>
        </div>
        <button class="btn btn-outline btn-sm" onclick="imprimirTodas('${id}')">
          ${icon('printer')} Imprimir Todas
        </button>
      </div>

      <!-- Progresso geral -->
      <div class="meta-bar-wrap mb-24">
        <div class="meta-bar-head">
          <div><div class="mh-title">Progresso das Ordens</div><div class="mh-label">${concl} de ${total} itens concluídos</div></div>
          <div class="mh-val" style="color:${corPct}">${pct}%</div>
        </div>
        <div class="progress-bar mb-8">
          <div class="progress-fill ${pct === 100 ? 'pf-ok' : pct >= 50 ? 'pf-gold' : 'pf-danger'}" style="width:${pct}%"></div>
        </div>
      </div>

      ${setoresHtml || '<p class="text-muted text-sm">Nenhum item neste pedido.</p>'}
    </div>
  `);
});

// ── IMPRESSÃO DE ORDENS ──────────────────────────────────────
async function imprimirOrdem(pedidoId, setorId) {
  const [{ data: p }, { data: itens }, { data: setor }] = await Promise.all([
    db.from('pedidos_filial').select('*').eq('id', pedidoId).single(),
    db.from('itens_pedido').select('*').eq('pedido_id', pedidoId).eq('setor_id', setorId),
    db.from('setores_producao').select('*').eq('id', setorId).single(),
  ]);
  abrirJanelaPrint([{ setor, itens, pedido: p }]);
}

async function imprimirTodas(pedidoId) {
  const [{ data: p }, { data: itens }, { data: setores }] = await Promise.all([
    db.from('pedidos_filial').select('*').eq('id', pedidoId).single(),
    db.from('itens_pedido').select('*, setores_producao(nome,responsavel)').eq('pedido_id', pedidoId),
    db.from('setores_producao').select('*').order('ordem'),
  ]);
  const grupos = setores
    .map(s => ({ setor: s, itens: (itens || []).filter(i => i.setor_id === s.id), pedido: p }))
    .filter(g => g.itens.length > 0);
  abrirJanelaPrint(grupos);
}

function abrirJanelaPrint(grupos) {
  const w = window.open('', '_blank');
  const hoje = new Date().toLocaleDateString('pt-BR');
  const paginasHtml = grupos.map(({ setor, itens, pedido }) => `
    <div class="pagina">
      <div class="header">
        <div>
          <h1>ORDEM DE PRODUÇÃO</h1>
          <p class="sub">Supermercado Royal · Matriz</p>
        </div>
        <div class="info-box">
          <p><strong>Data:</strong> ${fmt(pedido?.data_pedido)}</p>
          <p><strong>Cronograma:</strong> ${pedido?.cronograma}</p>
          <p><strong>Origem:</strong> ${pedido?.unidade_orig}</p>
        </div>
      </div>
      <div class="setor-header">
        <span class="setor-nome">${setor.nome}</span>
        <span class="setor-resp">Responsável: <strong>${setor.responsavel}</strong></span>
      </div>
      <table>
        <thead><tr><th>Cód</th><th>Produto</th><th>Qtd Solicitada</th><th>Qtd Produzida</th><th>✓</th></tr></thead>
        <tbody>
          ${itens.map(i => `
            <tr>
              <td class="mono">${i.codigo || '—'}</td>
              <td>${i.produto}</td>
              <td class="mono center">${i.quantidade}</td>
              <td class="mono center">_______</td>
              <td class="center">☐</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="assinaturas">
        <div class="assinatura-box"><p class="assinatura-label">Responsável pela Execução</p><div class="assinatura-linha"></div></div>
        <div class="assinatura-box"><p class="assinatura-label">Conferido (Supervisão)</p><div class="assinatura-linha"></div></div>
        <div class="assinatura-box"><p class="assinatura-label">Visto Gerência</p><div class="assinatura-linha"></div></div>
      </div>
      <p class="rodape">Gestor de Receitas · Supermercado Royal · Emitido em ${hoje}</p>
    </div>`).join('<div class="quebra-pagina"></div>');

  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
  <title>Ordens de Produção</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; }
    .pagina { padding: 20px 24px; max-width: 740px; margin: 0 auto; }
    .quebra-pagina { page-break-after: always; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
    h1 { font-size: 18px; color: #1B2A4A; }
    .sub { font-size: 11px; color: #666; margin-top: 3px; }
    .info-box { text-align: right; font-size: 11px; line-height: 1.7; }
    .setor-header { background: #1B2A4A; color: #fff; padding: 10px 14px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .setor-nome { font-size: 14px; font-weight: bold; }
    .setor-resp { font-size: 11px; opacity: 0.8; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead th { background: #F5F7FA; padding: 7px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 2px solid #E5E7EB; }
    tbody td { padding: 7px 10px; border-bottom: 1px solid #E5E7EB; }
    tbody tr:nth-child(even) { background: #FAFAFA; }
    .mono { font-family: monospace; }
    .center { text-align: center; }
    .assinaturas { display: flex; gap: 20px; margin-top: 28px; }
    .assinatura-box { flex: 1; }
    .assinatura-label { font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 28px; }
    .assinatura-linha { border-bottom: 1px solid #111; }
    .rodape { text-align: center; color: #999; font-size: 9px; margin-top: 16px; }
    @media print { .quebra-pagina { page-break-after: always; } }
  </style></head><body>${paginasHtml}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

// ── TABLET — MINHA ORDEM (por responsável) ───────────────────
registerRoute('tablet_ordem', async () => {
  if (!await checkAuth()) return;
  const p = App.perfil;
  const nomeUsuario = p?.nome?.toUpperCase() || '';

  // Descobrir qual setor pertence a este usuário pelo nome
  const { data: setores } = await db.from('setores_producao').select('*');
  const meuSetores = (setores || []).filter(s => {
    const resp = s.responsavel.toUpperCase();
    return nomeUsuario.includes(resp) || resp.includes(nomeUsuario.split(' ')[0]);
  });

  // Buscar pedido do dia com itens do setor do usuário
  const hoje = new Date().toISOString().split('T')[0];
  const { data: pedido } = await db.from('pedidos_filial')
    .select('*').eq('data_pedido', hoje).neq('status', 'aberto')
    .order('criado_em', { ascending: false }).limit(1).single().catch(() => ({ data: null }));

  if (!pedido) {
    renderApp(`
      <div class="tablet-screen">
        <header class="tablet-header">
          <div class="th-brand"><span class="th-icon">📋</span><div><h1>Minha Ordem</h1><p>${p?.nome}</p></div></div>
          <button class="btn btn-ghost btn-icon" onclick="navigate('tablet_home')" style="color:rgba(255,255,255,0.6)">${icon('arrow_left')}</button>
        </header>
        <div class="tablet-body" style="display:flex;align-items:center;justify-content:center;min-height:60vh">
          <div style="text-align:center;color:var(--text-muted)">
            <p style="font-size:2rem;margin-bottom:12px">📋</p>
            <p style="font-weight:700;color:var(--navy)">Nenhum pedido para hoje</p>
            <p style="font-size:0.875rem;margin-top:6px">A filial ainda não enviou o pedido de hoje.</p>
          </div>
        </div>
      </div>`);
    return;
  }

  const setorIds = meuSetores.map(s => s.id);
  let itens = [];
  if (setorIds.length) {
    for (const sid of setorIds) {
      const { data } = await db.from('itens_pedido')
        .select('*, setores_producao(nome,responsavel)')
        .eq('pedido_id', pedido.id).eq('setor_id', sid);
      if (data) itens.push(...data);
    }
  }

  if (!itens.length) {
    renderApp(`
      <div class="tablet-screen">
        <header class="tablet-header">
          <div class="th-brand"><span class="th-icon">📋</span><div><h1>Minha Ordem</h1><p>${p?.nome}</p></div></div>
          <button class="btn btn-ghost btn-icon" onclick="navigate('tablet_home')" style="color:rgba(255,255,255,0.6)">${icon('arrow_left')}</button>
        </header>
        <div class="tablet-body" style="display:flex;align-items:center;justify-content:center;min-height:60vh">
          <div style="text-align:center;color:var(--text-muted)">
            <p style="font-size:2rem;margin-bottom:12px">✅</p>
            <p style="font-weight:700;color:var(--navy)">Sem itens para você hoje</p>
            <p style="font-size:0.875rem;margin-top:6px">Nenhum item do seu setor foi solicitado.</p>
          </div>
        </div>
      </div>`);
    return;
  }

  const concluidos = itens.filter(i => i.status_producao === 'concluido').length;
  const pct = Math.round(concluidos / itens.length * 100);

  renderApp(`
    <div class="tablet-screen">
      <header class="tablet-header">
        <div class="th-brand">
          <span class="th-icon">📋</span>
          <div><h1>Minha Ordem</h1><p>${p?.nome} · ${fmt(hoje)}</p></div>
        </div>
        <button class="btn btn-ghost btn-icon" onclick="navigate('tablet_home')" style="color:rgba(255,255,255,0.6)">${icon('arrow_left')}</button>
      </header>

      <div style="background:#fff;padding:14px 20px;border-bottom:1px solid var(--mid)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-size:0.8rem;font-weight:700;color:var(--navy)">Progresso — ${concluidos}/${itens.length} itens</span>
          <span style="font-size:1.1rem;font-weight:800;color:${pct===100?'var(--ok)':'var(--navy)'};">${pct}%</span>
        </div>
        <div class="progress-bar"><div class="progress-fill ${pct===100?'pf-ok':'pf-gold'}" style="width:${pct}%"></div></div>
        <p style="font-size:0.75rem;color:var(--text-muted);margin-top:6px">Cronograma: ${pedido.cronograma}</p>
      </div>

      <div class="tablet-body">
        ${meuSetores.filter(s => itens.some(i => i.setor_id === s.id)).map(s => {
          const itensSetor = itens.filter(i => i.setor_id === s.id);
          return `
            <div style="margin-bottom:16px">
              <div style="background:var(--navy);padding:10px 16px;border-radius:var(--radius-md);margin-bottom:10px">
                <p style="color:#fff;font-weight:700;font-size:0.9rem">${s.nome}</p>
              </div>
              ${itensSetor.map(i => `
                <div id="item-${i.id}"
                  onclick="toggleItemOrdem('${i.id}','${i.status_producao}')"
                  style="display:flex;align-items:center;gap:14px;padding:14px 16px;
                    background:${i.status_producao==='concluido'?'var(--ok-bg)':'#fff'};
                    border:1.5px solid ${i.status_producao==='concluido'?'var(--ok)':'var(--mid)'};
                    border-radius:var(--radius-md);margin-bottom:8px;cursor:pointer;
                    transition:all 0.15s">
                  <span style="font-size:1.6rem">${i.status_producao==='concluido'?'✅':'⬜'}</span>
                  <div style="flex:1">
                    <p style="font-weight:700;color:${i.status_producao==='concluido'?'var(--ok)':'var(--navy)'};
                      font-size:1rem;${i.status_producao==='concluido'?'text-decoration:line-through':''}">${i.produto}</p>
                    <p style="font-size:0.75rem;font-family:var(--font-mono);color:var(--gray);margin-top:2px">${i.codigo||'—'}</p>
                  </div>
                  <span style="font-family:var(--font-mono);font-size:1.4rem;font-weight:800;
                    color:${i.status_producao==='concluido'?'var(--ok)':'var(--navy)'}">${i.quantidade}</span>
                </div>`).join('')}
            </div>`;
        }).join('')}
      </div>
    </div>
  `);
});

async function toggleItemOrdem(itemId, statusAtual) {
  const novoStatus = statusAtual === 'concluido' ? 'pendente' : 'concluido';
  await db.from('itens_pedido').update({
    status_producao: novoStatus,
    produzido_por:   novoStatus === 'concluido' ? App.perfil?.id : null,
    atualizado_em:   new Date().toISOString(),
  }).eq('id', itemId);
  // Re-render
  navigate('tablet_ordem');
}

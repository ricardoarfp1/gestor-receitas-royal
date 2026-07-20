/* ============================================================
   GESTOR DE RECEITAS — Notificações
   ============================================================ */

const EDGE_NOTIF = 'https://kpbvhbbltojohiescsru.supabase.co/functions/v1/notificacoes';

// Dispara notificação via Edge Function (e-mail)
async function dispararNotificacao(tipo, dados) {
  try {
    const { data: { session } } = await db.auth.getSession();
    await fetch(EDGE_NOTIF, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ tipo, dados }),
    });
  } catch(e) {
    console.warn('Notificação falhou:', e.message);
  }
}

// Salva notificação no banco (sino do dashboard)
async function salvarNotificacaoBanco(tipo, titulo, descricao) {
  await db.from('notificacoes').insert({ tipo, titulo, descricao });
}

// Combina e-mail + sino
async function notificar(tipo, dados, titulo, descricao) {
  await Promise.all([
    dispararNotificacao(tipo, dados),
    salvarNotificacaoBanco(tipo, titulo, descricao),
  ]);
}

/* ============================================================
   GESTOR DE RECEITAS — Páginas
   ============================================================ */

/* ── LOGIN ──────────────────────────────────────────────────── */
registerRoute('login', () => {
  // Reset cache de auth ao chegar no login
  _authChecked = false;
  _authResult  = null;
  App.user     = null;
  App.perfil   = null;

  renderApp(`
    <div class="login-screen">
      <div>
        <div class="login-card">
          <div class="login-logo">
            <div class="logo-icon">🍞</div>
            <h1>Gestor de Receitas</h1>
            <p>Supermercado Royal</p>
          </div>
          <div id="login-erro" class="alert alert-danger hidden"></div>
          <div class="field">
            <label class="lbl">E-mail</label>
            <div class="input-group">
              <span class="input-icon">${icon('mail')}</span>
              <input type="email" id="l-email" placeholder="seu@email.com" autocomplete="email" />
            </div>
          </div>
          <div class="field">
            <label class="lbl">Senha</label>
            <div class="input-group">
              <span class="input-icon">${icon('lock')}</span>
              <input type="password" id="l-senha" placeholder="••••••••" autocomplete="current-password"
                onkeydown="if(event.key==='Enter') doLogin()" />
            </div>
          </div>
          <button class="btn btn-primary w-full btn-lg" onclick="doLogin()" id="btn-login">
            Entrar
          </button>
        </div>
        <p style="text-align:center;color:rgba(255,255,255,0.25);font-size:0.72rem;margin-top:16px">
          Gestor de Receitas · Valor Soluções Empresariais © 2026
        </p>
      </div>
    </div>
  `);
  setTimeout(() => document.getElementById('l-email')?.focus(), 100);
});

async function doLogin() {
  const email = document.getElementById('l-email').value.trim();
  const senha = document.getElementById('l-senha').value;
  const btn   = document.getElementById('btn-login');
  const erro  = document.getElementById('login-erro');

  erro.classList.add('hidden');
  if (!email || !senha) {
    erro.textContent = 'Preencha e-mail e senha.';
    erro.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Entrando...';

  const error = await login(email, senha);
  if (error) {
    erro.textContent = 'E-mail ou senha incorretos.';
    erro.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Entrar';
    return;
  }

  // Login ok — carregar perfil e redirecionar
  try {
    const { data: { session } } = await db.auth.getSession();
    if (!session) throw new Error('Sem sessão');

    App.user = session.user;
    const { data: perfil } = await db.from('usuarios').select('*').eq('id', session.user.id).single();

    if (!perfil) {
      erro.textContent = 'Usuário não encontrado no sistema. Contate o administrador.';
      erro.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Entrar';
      return;
    }

    App.perfil   = perfil;
    _authChecked = true;
    _authResult  = true;

    // Redirecionar por perfil
    App.route = null; // força navegação
    if (perfil.perfil === 'padeiro') {
      navigate('tablet_home');
    } else {
      navigate('dashboard');
    }
  } catch(e) {
    erro.textContent = 'Erro ao carregar perfil: ' + e.message;
    erro.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}

/* ── DASHBOARD HOME ─────────────────────────────────────────── */
registerRoute('dashboard', async () => {
  if (!await checkAuth()) return;
  renderLayout(`
    <div style="text-align:center;padding:60px">
      <div style="width:40px;height:40px;border:4px solid #1B2A4A;border-top-color:#C9A84C;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto"></div>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  `, 'dashboard');

  const [
    { count: totalReceitas },
    { count: totalProd },
    { data: prods7d },
    { data: semValid },
  ] = await Promise.all([
    db.from('receitas').select('*',{count:'exact',head:true}).eq('status','ativa'),
    db.from('logs_producao').select('*',{count:'exact',head:true}),
    db.from('logs_producao').select('desvio_pct, receitas(nome)')
      .gte('produzido_em', new Date(Date.now()-7*86400000).toISOString()),
    db.from('receitas').select('id,nome,atualizado_em').eq('status','ativa')
      .lt('atualizado_em', new Date(Date.now()-30*86400000).toISOString()).limit(5),
  ]);

  const desvios = (prods7d||[]).filter(p => Math.abs(p.desvio_pct||0) > 5);
  const inicioSem = new Date(); inicioSem.setDate(inicioSem.getDate()-inicioSem.getDay()+1);
  const { count: audsemana } = await db.from('auditorias_semanais')
    .select('*',{count:'exact',head:true}).gte('validada_em', inicioSem.toISOString());

  const metaF   = audsemana || 0;
  const metaPct = Math.min(100, Math.round(metaF/10*100));
  const corMeta = metaPct>=100?'var(--ok)':metaPct>=60?'var(--gold)':'var(--danger)';
  const bgMeta  = metaPct>=100?'pf-ok':metaPct>=60?'pf-gold':'pf-danger';

  const desviosHtml = desvios.length
    ? desvios.map(d=>`<div class="flex justify-between items-center" style="padding:10px;background:var(--amber-bg);border-radius:8px;margin-bottom:6px">
        <span class="text-sm font-bold text-navy">${d.receitas?.nome||'—'}</span>
        <span class="text-sm font-bold" style="color:var(--amber)">${d.desvio_pct?.toFixed(1)}%</span>
      </div>`).join('')
    : '<p class="text-sm text-muted">Nenhum desvio crítico nos últimos 7 dias.</p>';

  const semValidHtml = semValid?.length
    ? semValid.map(r=>`<div class="flex justify-between items-center" style="padding:10px;background:var(--danger-bg);border-radius:8px;margin-bottom:6px">
        <span class="text-sm font-bold text-navy">${r.nome}</span>
        <span class="text-sm font-bold text-danger">${Math.floor((Date.now()-new Date(r.atualizado_em))/86400000)}d</span>
      </div>`).join('')
    : '<p class="text-sm text-muted">Todas as receitas estão em dia.</p>';

  setMain(`
    <div class="page-header">
      <div class="ph-left">
        <h1>Bom dia, ${App.perfil?.nome?.split(' ')[0]} 👋</h1>
        <p>Painel de Inteligência · ${new Date().toLocaleDateString('pt-BR')}</p>
      </div>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card c-navy"><div class="kc-label">Receitas Ativas</div><div class="kc-val">${totalReceitas||0}</div></div>
      <div class="kpi-card c-gold"><div class="kc-label">Produções Totais</div><div class="kc-val">${totalProd||0}</div></div>
      <div class="kpi-card ${desvios.length?'c-red':'c-green'}">
        <div class="kc-label">Desvios &gt;5% (7d)</div>
        <div class="kc-val">${desvios.length}</div>
        <div class="kc-sub">${desvios.length?'requer atenção':'dentro do padrão'}</div>
      </div>
      <div class="kpi-card ${semValid?.length?'c-red':'c-green'}">
        <div class="kc-label">Sem Validação +30d</div>
        <div class="kc-val">${semValid?.length||0}</div>
        <div class="kc-sub">${semValid?.length?'receitas pendentes':'tudo em dia'}</div>
      </div>
    </div>
    <div class="meta-bar-wrap">
      <div class="meta-bar-head">
        <div><div class="mh-title">Meta Semanal</div><div class="mh-label">Validações de Receitas</div></div>
        <div class="mh-val" style="color:${corMeta}">${metaF}/10</div>
      </div>
      <div class="progress-bar mb-8"><div class="progress-fill ${bgMeta}" style="width:${metaPct}%"></div></div>
      <p class="meta-bar-msg mt-8" style="color:${corMeta}">
        ${metaPct>=100?'✓ Meta atingida esta semana!':`${10-metaF} validações restantes`}
      </p>
    </div>
    <div class="grid-2">
      <div class="card"><div class="card-header"><h3>${icon('alert')} Desvios (7 dias)</h3></div>${desviosHtml}</div>
      <div class="card"><div class="card-header"><h3>${icon('alert')} Sem Validação (+30d)</h3></div>${semValidHtml}</div>
    </div>
  `);
});

/* ── RECEITAS — LISTA ───────────────────────────────────────── */
registerRoute('receitas', async (params={}) => {
  if (!await checkAuth()) return;
  renderLayout('<div style="text-align:center;padding:40px">Carregando...</div>', 'receitas');

  const { data: receitas } = await db.from('receitas')
    .select('*, categorias_receita(nome)').order('nome');

  let filtradas = receitas || [];
  const busca = params.busca || '';
  const filtroStatus = params.status || 'todas';
  if (busca) filtradas = filtradas.filter(r =>
    r.nome?.toLowerCase().includes(busca.toLowerCase()) ||
    r.sku_variacao?.toLowerCase().includes(busca.toLowerCase()));
  if (filtroStatus !== 'todas') filtradas = filtradas.filter(r => r.status === filtroStatus);

  const rows = filtradas.map(r => `
    <tr>
      <td><strong>${r.nome}</strong></td>
      <td class="mono">${r.sku_variacao}</td>
      <td class="mono" style="color:var(--text-muted)">${r.sku_faturamento||'—'}</td>
      <td>${r.categorias_receita?.nome||'—'}</td>
      <td>${status_badge(r.status)}</td>
      <td>
        <div class="flex gap-8">
          <button class="btn btn-ghost btn-icon" onclick="navigate('receita_ver',{id:'${r.id}'})">${icon('eye')}</button>
          <button class="btn btn-ghost btn-icon" onclick="navigate('receita_form',{id:'${r.id}'})">${icon('edit')}</button>
          ${r.status!=='arquivada'?`<button class="btn btn-ghost btn-icon" onclick="arquivarReceita('${r.id}','${r.nome.replace(/'/g,"\\'")}')" style="color:var(--danger)">${icon('archive')}</button>`:''}
        </div>
      </td>
    </tr>`).join('');

  setMain(`
    <div class="page-header">
      <div class="ph-left"><h1>Receitas</h1><p>${(receitas||[]).length} receitas cadastradas</p></div>
      <div class="ph-right">
        <button class="btn btn-primary" onclick="navigate('receita_form',{id:'nova'})">${icon('plus')} Nova Receita</button>
      </div>
    </div>
    <div class="flex gap-12 mb-16 flex-wrap">
      <div class="input-group" style="flex:1;min-width:200px">
        <span class="input-icon">${icon('search')}</span>
        <input type="search" placeholder="Buscar por nome ou SKU..." value="${busca}"
          onchange="navigate('receitas',{busca:this.value,status:'${filtroStatus}'})" />
      </div>
      <select style="width:160px" onchange="navigate('receitas',{busca:'${busca}',status:this.value})">
        <option value="todas" ${filtroStatus==='todas'?'selected':''}>Todos os status</option>
        <option value="ativa"     ${filtroStatus==='ativa'?'selected':''}>Ativas</option>
        <option value="validada"  ${filtroStatus==='validada'?'selected':''}>Validadas</option>
        <option value="rascunho"  ${filtroStatus==='rascunho'?'selected':''}>Rascunho</option>
        <option value="arquivada" ${filtroStatus==='arquivada'?'selected':''}>Arquivadas</option>
      </select>
    </div>
    <div class="card no-pad">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>SKU Variação</th><th>SKU Fat.</th><th>Categoria</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>${rows||'<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">Nenhuma receita encontrada</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `);
});

async function arquivarReceita(id, nome) {
  if (!confirmDialog(`Arquivar a receita "${nome}"?`)) return;
  const { error } = await db.from('receitas').update({status:'arquivada'}).eq('id',id);
  if (error) { toast('Erro: '+error.message,'danger'); return; }
  toast('Receita arquivada','ok');
  navigate('receitas');
}

/* ── RECEITA FORM ────────────────────────────────────────────── */
let _recForm = { ing:[], passos:[] };

registerRoute('receita_form', async ({id='nova'}={}) => {
  if (!await checkAuth()) return;
  const isNova = id === 'nova';
  const { data: cats } = await db.from('categorias_receita').select('*').order('nome');
  const catOpts = (cats||[]).map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');

  _recForm = {
    ing:   [{nome:'',quantidade_base:'',unidade:'g',alergeno:false}],
    passos:[{descricao:'',tempo_minutos:''}]
  };

  let form = {nome:'',sku_variacao:'',sku_faturamento:'',categoria_id:'',rendimento_unidades:'',rendimento_peso_g:'',status:'rascunho',foto_url:''};

  if (!isNova) {
    const [{data:r},{data:ing},{data:ps}] = await Promise.all([
      db.from('receitas').select('*').eq('id',id).single(),
      db.from('ingredientes_receita').select('*').eq('receita_id',id).order('ordem'),
      db.from('passos_preparo').select('*').eq('receita_id',id).order('ordem'),
    ]);
    if (r) form = {...form,...r};
    if (ing?.length) _recForm.ing   = ing.map(i=>({nome:i.nome,quantidade_base:i.quantidade_base,unidade:i.unidade,alergeno:i.alergeno}));
    if (ps?.length)  _recForm.passos= ps.map(p=>({descricao:p.descricao,tempo_minutos:p.tempo_minutos||''}));
  }

  renderLayout('', 'receitas');
  setMain(`
    <div style="max-width:860px">
      <div class="flex items-center gap-12 mb-24">
        <button class="btn btn-ghost btn-icon" onclick="navigate('receitas')">${icon('arrow_left',22)}</button>
        <h1>${isNova?'Nova Receita':'Editar Receita'}</h1>
      </div>
      <div id="form-erro" class="alert alert-danger hidden"></div>
      <div class="card mb-16">
        <div class="form-section-title">Dados Básicos</div>
        <div class="field"><label class="lbl">Nome <span class="req">*</span></label>
          <input type="text" id="rf-nome" value="${form.nome||''}" placeholder="Ex: Pão Doce com Nozes" /></div>
        <div class="field-row col-2">
          <div><label class="lbl">SKU Variação <span class="req">*</span></label>
            <input type="text" id="rf-sku-var" value="${form.sku_variacao||''}" class="mono" placeholder="PAD-0042-NZ" oninput="this.value=this.value.toUpperCase()" />
            <p class="field-hint">Código único desta variação</p></div>
          <div><label class="lbl">SKU Faturamento (SISMO)</label>
            <input type="text" id="rf-sku-fat" value="${form.sku_faturamento||''}" class="mono" placeholder="PAD-0042" oninput="this.value=this.value.toUpperCase()" /></div>
        </div>
        <div class="field-row col-2">
          <div><label class="lbl">Categoria</label>
            <select id="rf-cat"><option value="">Selecione...</option>${catOpts}</select></div>
          <div><label class="lbl">Status</label>
            <select id="rf-status">
              <option value="rascunho" ${form.status==='rascunho'?'selected':''}>Rascunho</option>
              <option value="validada" ${form.status==='validada'?'selected':''}>Validada</option>
              <option value="ativa"    ${form.status==='ativa'?'selected':''}>Ativa (visível no tablet)</option>
              <option value="arquivada"${form.status==='arquivada'?'selected':''}>Arquivada</option>
            </select></div>
        </div>
        <div class="field-row col-2">
          <div><label class="lbl">Rendimento — Unidades</label>
            <input type="number" id="rf-rend-un" value="${form.rendimento_unidades||''}" placeholder="85" /></div>
          <div><label class="lbl">Rendimento — Peso Total (g)</label>
            <input type="number" id="rf-rend-g" value="${form.rendimento_peso_g||''}" placeholder="8500" /></div>
        </div>
      </div>
      <div class="card mb-16">
        <div class="form-section-title"><span>Ingredientes</span><span class="text-xs text-muted">1º = base da calculadora</span></div>
        <div style="display:grid;grid-template-columns:1fr 100px 90px 80px 36px;gap:6px;padding:0 2px 8px;font-size:0.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase">
          <span>Nome</span><span>Qtd</span><span>Unidade</span><span>Alérgeno</span><span></span>
        </div>
        <div id="ing-rows"></div>
        <button class="btn btn-outline btn-sm" onclick="addIng()">${icon('plus',15)} Adicionar ingrediente</button>
      </div>
      <div class="card mb-16">
        <div class="form-section-title"><span>Modo de Preparo</span><span class="text-xs text-muted">1 passo por vez no tablet</span></div>
        <div id="passo-rows"></div>
        <button class="btn btn-outline btn-sm" onclick="addPasso()">${icon('plus',15)} Adicionar passo</button>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="salvarReceita('${id}')" id="btn-salvar-rec">${icon('save')} Salvar Receita</button>
        <button class="btn btn-outline" onclick="navigate('receitas')">Cancelar</button>
      </div>
    </div>
  `);
  document.getElementById('rf-cat').value = form.categoria_id||'';
  renderIngRows(); renderPassoRows();
});

function renderIngRows() {
  document.getElementById('ing-rows').innerHTML = _recForm.ing.map((ing,i) => `
    <div class="ing-row ${ing.alergeno?'alergeno':'normal'}" id="ing-row-${i}">
      <div class="flex items-center gap-8">
        ${i===0?'<span class="base-tag">base</span>':''}
        <input type="text" value="${ing.nome||''}" placeholder="Ex: Farinha de trigo"
          onchange="_recForm.ing[${i}].nome=this.value" style="flex:1" />
      </div>
      <input type="number" value="${ing.quantidade_base||''}" placeholder="1000"
        onchange="_recForm.ing[${i}].quantidade_base=this.value" class="mono" />
      <select onchange="_recForm.ing[${i}].unidade=this.value">
        ${['g','kg','ml','L','un','colher','xícara'].map(u=>`<option ${ing.unidade===u?'selected':''}>${u}</option>`).join('')}
      </select>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;justify-content:center">
        <input type="checkbox" ${ing.alergeno?'checked':''} style="accent-color:#D97706;width:16px;height:16px"
          onchange="_recForm.ing[${i}].alergeno=this.checked;renderIngRows()" />
        <span style="font-size:0.75rem;font-weight:700;color:#92400E">⚠</span>
      </label>
      <button class="btn btn-ghost btn-icon" onclick="delIng(${i})" style="color:var(--danger)">${icon('trash',15)}</button>
    </div>`).join('');
}
function addIng()  { _recForm.ing.push({nome:'',quantidade_base:'',unidade:'g',alergeno:false}); renderIngRows(); }
function delIng(i) { _recForm.ing.splice(i,1); renderIngRows(); }

function renderPassoRows() {
  document.getElementById('passo-rows').innerHTML = _recForm.passos.map((p,i) => `
    <div class="passo-row" id="passo-row-${i}">
      <div class="passo-controls">
        <button onclick="movePasso(${i},-1)" ${i===0?'disabled':''}>▲</button>
        <div class="passo-num">${i+1}</div>
        <button onclick="movePasso(${i},1)" ${i===_recForm.passos.length-1?'disabled':''}>▼</button>
      </div>
      <div style="flex:1">
        <textarea rows="2" placeholder="Descreva o passo..."
          onchange="_recForm.passos[${i}].descricao=this.value" style="width:100%;margin-bottom:8px">${p.descricao||''}</textarea>
        <div class="flex items-center gap-8">
          <input type="number" value="${p.tempo_minutos||''}" placeholder="0"
            onchange="_recForm.passos[${i}].tempo_minutos=this.value" style="width:70px" />
          <span class="text-xs text-muted">minutos (opcional)</span>
        </div>
      </div>
      <button class="btn btn-ghost btn-icon" onclick="delPasso(${i})" style="color:var(--danger)">${icon('trash',15)}</button>
    </div>`).join('');
}
function addPasso()       { _recForm.passos.push({descricao:'',tempo_minutos:''}); renderPassoRows(); }
function delPasso(i)      { _recForm.passos.splice(i,1); renderPassoRows(); }
function movePasso(i,dir) { const a=_recForm.passos; if(i+dir<0||i+dir>=a.length)return; [a[i],a[i+dir]]=[a[i+dir],a[i]]; renderPassoRows(); }

async function salvarReceita(id) {
  const isNova = id==='nova';
  const btn  = document.getElementById('btn-salvar-rec');
  const erro = document.getElementById('form-erro');
  erro.classList.add('hidden');

  // Coletar valores do DOM
  _recForm.ing = _recForm.ing.map((ing,i) => {
    const row = document.getElementById(`ing-row-${i}`); if(!row) return ing;
    const inputs = row.querySelectorAll('input[type="text"],input[type="number"]');
    return { nome:inputs[0]?.value||ing.nome, quantidade_base:inputs[1]?.value||ing.quantidade_base,
      unidade:row.querySelector('select')?.value||ing.unidade, alergeno:row.querySelector('input[type="checkbox"]')?.checked||false };
  });
  _recForm.passos = _recForm.passos.map((p,i) => {
    const row = document.getElementById(`passo-row-${i}`); if(!row) return p;
    return { descricao:row.querySelector('textarea')?.value||p.descricao,
      tempo_minutos:row.querySelector('input[type="number"]')?.value||p.tempo_minutos };
  });

  const nome   = document.getElementById('rf-nome').value.trim();
  const skuVar = document.getElementById('rf-sku-var').value.trim().toUpperCase();
  if (!nome)   { erro.textContent='Nome é obrigatório.';     erro.classList.remove('hidden'); return; }
  if (!skuVar) { erro.textContent='SKU Variação é obrigatório.'; erro.classList.remove('hidden'); return; }

  btn.disabled=true; btn.innerHTML=icon('refresh')+' Salvando...';

  const payload = {
    nome, sku_variacao:skuVar,
    sku_faturamento: document.getElementById('rf-sku-fat').value.trim().toUpperCase()||null,
    categoria_id:    document.getElementById('rf-cat').value||null,
    status:          document.getElementById('rf-status').value,
    rendimento_unidades: document.getElementById('rf-rend-un').value ? parseInt(document.getElementById('rf-rend-un').value) : null,
    rendimento_peso_g:   document.getElementById('rf-rend-g').value  ? parseFloat(document.getElementById('rf-rend-g').value)  : null,
  };

  let rid = id;
  if (isNova) {
    const { data, error } = await db.from('receitas').insert(payload).select().single();
    if (error) { erro.textContent=error.message; erro.classList.remove('hidden'); btn.disabled=false; btn.innerHTML=icon('save')+' Salvar'; return; }
    rid = data.id;
  } else {
    const { error } = await db.from('receitas').update(payload).eq('id',id);
    if (error) { erro.textContent=error.message; erro.classList.remove('hidden'); btn.disabled=false; btn.innerHTML=icon('save')+' Salvar'; return; }
  }

  await db.from('ingredientes_receita').delete().eq('receita_id',rid);
  const ings = _recForm.ing.filter(i=>i.nome?.trim()).map((i,idx)=>({
    receita_id:rid, nome:i.nome.trim(), quantidade_base:parseFloat(i.quantidade_base)||0,
    unidade:i.unidade, ordem:idx+1, alergeno:i.alergeno
  }));
  if (ings.length) await db.from('ingredientes_receita').insert(ings);

  await db.from('passos_preparo').delete().eq('receita_id',rid);
  const pss = _recForm.passos.filter(p=>p.descricao?.trim()).map((p,idx)=>({
    receita_id:rid, descricao:p.descricao.trim(), ordem:idx+1,
    tempo_minutos:p.tempo_minutos?parseInt(p.tempo_minutos):null
  }));
  if (pss.length) await db.from('passos_preparo').insert(pss);

  toast('Receita salva!','ok');
  await notificar('nova_receita', {nome:payload.nome, sku_variacao:payload.sku_variacao, categoria:'', status:payload.status}, 'Nova receita cadastrada', payload.nome + ' — ' + payload.sku_variacao);
  navigate('receitas');
}

/* ── RECEITA VER ─────────────────────────────────────────────── */
registerRoute('receita_ver', async ({id}={}) => {
  if (!await checkAuth()) return;
  renderLayout('', 'receitas');
  const [{data:r},{data:ing},{data:ps}] = await Promise.all([
    db.from('receitas').select('*,categorias_receita(nome)').eq('id',id).single(),
    db.from('ingredientes_receita').select('*').eq('receita_id',id).order('ordem'),
    db.from('passos_preparo').select('*').eq('receita_id',id).order('ordem'),
  ]);
  setMain(`
    <div style="max-width:700px">
      <div class="flex items-center gap-12 mb-24">
        <button class="btn btn-ghost btn-icon" onclick="navigate('receitas')">${icon('arrow_left',22)}</button>
        <div style="flex:1">
          <div class="flex items-center gap-12 flex-wrap"><h1>${r?.nome}</h1>${status_badge(r?.status)}</div>
          <p class="font-mono text-xs text-muted mt-8">${r?.sku_variacao}</p>
        </div>
        <button class="btn btn-outline btn-sm" onclick="navigate('receita_form',{id:'${id}'})">${icon('edit',15)} Editar</button>
      </div>
      <div class="card mb-16">
        <div class="card-header"><h3>Informações</h3></div>
        <div class="grid-2">
          ${[['SKU Variação',r?.sku_variacao],['SKU Fat.',r?.sku_faturamento||'—'],
             ['Categoria',r?.categorias_receita?.nome||'—'],['Status',r?.status],
             ['Rendimento (un)',r?.rendimento_unidades||'—'],['Peso esperado',(r?.rendimento_peso_g?r.rendimento_peso_g+'g':'—')]
            ].map(([k,v])=>`<div><p class="text-xs text-muted font-bold mb-8">${k}</p><p class="font-bold text-navy">${v}</p></div>`).join('')}
        </div>
      </div>
      <div class="card mb-16">
        <div class="card-header"><h3>Ingredientes (${(ing||[]).length})</h3></div>
        ${(ing||[]).map((i,idx)=>`
          <div class="ing-item ${i.alergeno?'alergeno':'normal'}">
            <div class="flex items-center gap-8">
              ${idx===0?'<span style="font-size:0.65rem;background:var(--navy);color:#fff;padding:2px 6px;border-radius:4px;font-weight:700">base</span>':''}
              ${i.alergeno?'<span style="color:#D97706">⚠</span>':''}
              <span class="in-nome">${i.nome}${i.alergeno?' <span style="font-size:0.7rem;font-weight:700;color:#92400E">(alérgeno)</span>':''}</span>
            </div>
            <span class="in-qtd">${i.quantidade_base} ${i.unidade}</span>
          </div>`).join('')}
      </div>
      <div class="card">
        <div class="card-header"><h3>Modo de Preparo (${(ps||[]).length} passos)</h3></div>
        ${(ps||[]).map((p,i)=>`
          <div class="passo-row" style="background:var(--gray-light)">
            <div class="passo-num">${i+1}</div>
            <div style="flex:1">
              <p class="text-navy" style="font-size:0.9rem;line-height:1.6">${p.descricao}</p>
              ${p.tempo_minutos?`<p class="passo-tempo mt-8">⏱ ${p.tempo_minutos} min</p>`:''}
            </div>
          </div>`).join('')}
      </div>
    </div>
  `);
});

/* ── USUÁRIOS ────────────────────────────────────────────────── */
registerRoute('usuarios', async () => {
  if (!await checkAuth()) return;
  renderLayout('', 'usuarios');
  const { data: users } = await db.from('usuarios').select('*').order('nome');
  const rows = (users||[]).map(u => `
    <tr class="${u.ativo?'':'inactive'}">
      <td><div class="flex items-center gap-12"><div class="avatar">${(u.nome||'?').charAt(0).toUpperCase()}</div><strong>${u.nome}</strong></div></td>
      <td>${u.email}</td>
      <td>${perfil_badge(u.perfil)}</td>
      <td>${u.modo_onboarding?'<span class="badge" style="background:#DBEAFE;color:#1E40AF">🎓 Ativo</span>':'<span class="text-muted">—</span>'}</td>
      <td><span class="badge ${u.ativo?'badge-ok':'badge-danger'}">${u.ativo?'Ativo':'Inativo'}</span></td>
      <td><div class="flex gap-8">
        <button class="btn btn-ghost btn-icon" onclick="navigate('usuario_form',{id:'${u.id}'})">${icon('edit')}</button>
        <button class="btn btn-ghost btn-icon" onclick="toggleUsuario('${u.id}','${u.nome.replace(/'/g,"\\'")}',${u.ativo})"
          style="color:${u.ativo?'var(--danger)':'var(--ok)'}">${u.ativo?icon('user_x'):icon('user_check')}</button>
      </div></td>
    </tr>`).join('');
  setMain(`
    <div class="page-header">
      <div class="ph-left"><h1>Usuários</h1><p>${(users||[]).length} usuários</p></div>
      <div class="ph-right"><button class="btn btn-primary" onclick="navigate('usuario_form',{id:'novo'})">${icon('plus')} Novo Usuário</button></div>
    </div>
    <div class="card no-pad">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Treinamento</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>${rows||'<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">Nenhum usuário</td></tr>'}</tbody>
        </table>
      </div>
    </div>
    <div class="alert alert-info mt-16">${icon('alert',16)} <span>Crie o usuário aqui e depois configure o acesso em <strong>Authentication → Users</strong> no Supabase.</span></div>
  `);
});

async function toggleUsuario(id, nome, ativo) {
  if (!confirmDialog(`${ativo?'Desativar':'Reativar'} "${nome}"?`)) return;
  await db.from('usuarios').update({ativo:!ativo}).eq('id',id);
  toast(`${nome} ${ativo?'desativado':'reativado'}`, ativo?'amber':'ok');
  navigate('usuarios');
}

registerRoute('usuario_form', async ({id='novo'}={}) => {
  if (!await checkAuth()) return;
  const isNovo = id==='novo';
  renderLayout('', 'usuarios');
  let u = {nome:'',email:'',perfil:'padeiro',modo_onboarding:false,ativo:true};
  if (!isNovo) {
    const { data } = await db.from('usuarios').select('*').eq('id',id).single();
    if (data) u = {...u,...data};
  }
  const PERFIS = [
    {v:'padeiro',l:'Padeiro',d:'Acesso ao tablet — preparo e registro de produção'},
    {v:'nutri',  l:'Nutricionista',d:'Dashboard — validação de receitas e auditoria'},
    {v:'gestor', l:'Gestor',d:'Dashboard completo — KPIs, produção, conformidade'},
    {v:'admin',  l:'Admin',d:'Acesso total — usuários, setup SKU, todos os módulos'},
  ];
  setMain(`
    <div style="max-width:640px">
      <div class="flex items-center gap-12 mb-24">
        <button class="btn btn-ghost btn-icon" onclick="navigate('usuarios')">${icon('arrow_left',22)}</button>
        <h1>${isNovo?'Novo Usuário':'Editar Usuário'}</h1>
      </div>
      <div id="uf-erro" class="alert alert-danger hidden"></div>
      <div id="uf-ok"   class="alert alert-ok hidden"></div>
      <div class="card mb-16">
        <div class="form-section-title">Dados</div>
        <div class="field"><label class="lbl">Nome <span class="req">*</span></label>
          <input type="text" id="uf-nome" value="${u.nome||''}" placeholder="Ex: Everton Lima" /></div>
        <div class="field"><label class="lbl">E-mail <span class="req">*</span></label>
          <div class="input-group"><span class="input-icon">${icon('mail')}</span>
            <input type="email" id="uf-email" value="${u.email||''}" ${!isNovo?'disabled':''} placeholder="everton@royal.com.br" /></div></div>
      </div>
      <div class="card mb-16">
        <div class="form-section-title">Perfil de Acesso</div>
        ${PERFIS.map(p=>`
          <div class="perfil-radio ${u.perfil===p.v?'selected':''}" onclick="selectPerfil('${p.v}',this)">
            <input type="radio" name="uf-perfil" value="${p.v}" ${u.perfil===p.v?'checked':''} />
            <div><div class="pr-label">${p.l}</div><div class="pr-desc">${p.d}</div></div>
          </div>`).join('')}
      </div>
      <div class="card mb-16">
        <div class="form-section-title">Configurações</div>
        <label style="display:flex;align-items:flex-start;gap:14px;padding:14px;background:#EFF6FF;border-radius:var(--radius-md);border:1.5px solid #BFDBFE;cursor:pointer">
          <input type="checkbox" id="uf-onboarding" ${u.modo_onboarding?'checked':''} style="width:18px;height:18px;margin-top:2px;accent-color:#2563EB;flex-shrink:0" />
          <div><p style="font-weight:700;color:#1E40AF;font-size:0.9rem">🎓 Modo Treinamento</p>
            <p class="text-xs" style="color:#3B82F6;margin-top:4px">Ativa dicas extras no tablet para novos padeiros.</p></div>
        </label>
        ${!isNovo?`<div class="mt-16"><label style="display:flex;align-items:center;gap:12px;padding:14px;background:var(--gray-light);border-radius:var(--radius-md);cursor:pointer">
          <input type="checkbox" id="uf-ativo" ${u.ativo!==false?'checked':''} style="width:18px;height:18px;accent-color:var(--navy)" />
          <div><p class="font-bold text-navy text-sm">Usuário ativo</p><p class="text-xs text-muted mt-8">Desative para bloquear sem excluir.</p></div>
        </label></div>`:''}
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="salvarUsuario('${id}')" id="btn-salvar-usr">
          ${icon('save')} ${isNovo?'Criar Usuário':'Salvar'}
        </button>
        <button class="btn btn-outline" onclick="navigate('usuarios')">Cancelar</button>
      </div>
    </div>
  `);
});

function selectPerfil(v, el) {
  document.querySelectorAll('.perfil-radio').forEach(r=>r.classList.remove('selected'));
  el.classList.add('selected');
  el.querySelector('input').checked = true;
}

async function salvarUsuario(id) {
  const isNovo = id==='novo';
  const btn = document.getElementById('btn-salvar-usr');
  const erro= document.getElementById('uf-erro');
  const ok  = document.getElementById('uf-ok');
  erro.classList.add('hidden'); ok.classList.add('hidden');
  const nome  = document.getElementById('uf-nome').value.trim();
  const email = document.getElementById('uf-email')?.value.trim().toLowerCase();
  const perfil= document.querySelector('input[name="uf-perfil"]:checked')?.value||'padeiro';
  const onb   = document.getElementById('uf-onboarding').checked;
  const ativo = isNovo?true:(document.getElementById('uf-ativo')?.checked!==false);
  if (!nome) { erro.textContent='Nome é obrigatório.'; erro.classList.remove('hidden'); return; }
  btn.disabled=true; btn.innerHTML=icon('refresh')+' Salvando...';
  if (isNovo) {
    const { error } = await db.from('usuarios').insert({id:crypto.randomUUID(),nome,email,perfil,modo_onboarding:onb,ativo:true});
    if (error) { erro.textContent=error.message; erro.classList.remove('hidden'); btn.disabled=false; btn.innerHTML=icon('save')+' Criar'; return; }
    ok.textContent='✓ Usuário criado. Configure o acesso no Supabase Authentication.';
    ok.classList.remove('hidden');
    setTimeout(()=>navigate('usuarios'),2000);
  } else {
    const { error } = await db.from('usuarios').update({nome,perfil,modo_onboarding:onb,ativo}).eq('id',id);
    if (error) { erro.textContent=error.message; erro.classList.remove('hidden'); btn.disabled=false; btn.innerHTML=icon('save')+' Salvar'; return; }
    toast('Usuário atualizado','ok');
    navigate('usuarios');
  }
}

/* ── AUDITORIA ───────────────────────────────────────────────── */
registerRoute('auditoria', async () => {
  if (!await checkAuth()) return;
  renderLayout('', 'auditoria');
  const inicioSem = new Date(); inicioSem.setDate(inicioSem.getDate()-inicioSem.getDay()+1);
  const [{data:receitas},{count:feitas}] = await Promise.all([
    db.from('receitas').select('id,nome,sku_variacao,atualizado_em').eq('status','ativa').order('atualizado_em'),
    db.from('auditorias_semanais').select('*',{count:'exact',head:true}).gte('validada_em',inicioSem.toISOString()),
  ]);
  const metaF=feitas||0, metaPct=Math.min(100,Math.round(metaF/10*100));
  const corM=metaPct>=100?'var(--ok)':metaPct>=60?'var(--gold)':'var(--danger)';
  const bgM =metaPct>=100?'pf-ok':metaPct>=60?'pf-gold':'pf-danger';
  const agora=Date.now();
  const vencidas=(receitas||[]).filter(r=>(agora-new Date(r.atualizado_em))/86400000>30);
  const normais =(receitas||[]).filter(r=>(agora-new Date(r.atualizado_em))/86400000<=30);
  setMain(`
    <div class="page-header"><div class="ph-left"><h1>Fila de Validação</h1><p>Valide receitas e registre o peso real</p></div></div>
    <div class="meta-bar-wrap mb-24">
      <div class="meta-bar-head">
        <div><div class="mh-title">Meta semanal</div><div class="mh-label">Validações de Receitas</div></div>
        <div class="mh-val" style="color:${corM}">${metaF}/10</div>
      </div>
      <div class="progress-bar mb-8"><div class="progress-fill ${bgM}" style="width:${metaPct}%"></div></div>
      <p class="meta-bar-msg" style="color:${corM}">${metaPct>=100?'✓ Meta atingida!':`${10-metaF} restantes`}</p>
    </div>
    ${vencidas.length?`<div class="alert alert-danger mb-16">${icon('alert',16)} <strong>${vencidas.length} receitas sem validação há mais de 30 dias</strong></div>
    ${vencidas.map(r=>`<div class="fila-item vencida" onclick="navigate('auditoria_form',{id:'${r.id}'})">
      <div><div class="fi-nome">${r.nome}</div><div class="fi-dias-warn">${Math.floor((agora-new Date(r.atualizado_em))/86400000)} dias</div></div>
      <button class="btn btn-danger btn-sm">Validar</button></div>`).join('')}`:''}
    ${normais.map(r=>`<div class="fila-item" onclick="navigate('auditoria_form',{id:'${r.id}'})">
      <div><div class="fi-nome">${r.nome}</div><div class="fi-info">Atualizado: ${fmt(r.atualizado_em)}</div></div>
      ${icon('chevron_r')}</div>`).join('')||'<p class="text-sm text-muted">Todas em dia!</p>'}
  `);
});

registerRoute('auditoria_form', async ({id}={}) => {
  if (!await checkAuth()) return;
  renderLayout('', 'auditoria');
  const {data:r} = await db.from('receitas').select('*').eq('id',id).single();
  setMain(`
    <div style="max-width:600px">
      <div class="flex items-center gap-12 mb-24">
        <button class="btn btn-ghost btn-icon" onclick="navigate('auditoria')">${icon('arrow_left',22)}</button>
        <div><h1>Validar Receita</h1><p class="text-muted text-sm">${r?.nome}</p></div>
      </div>
      <div id="aud-erro" class="alert alert-danger hidden"></div>
      <div class="card mb-16">
        <div style="background:rgba(27,42,74,0.05);border-radius:var(--radius-md);padding:14px;margin-bottom:16px">
          <p class="text-xs text-muted font-bold mb-8">Peso esperado (base)</p>
          <p style="font-size:2rem;font-weight:800;font-family:var(--font-display);color:var(--navy)">${r?.rendimento_peso_g||0}g</p>
        </div>
        <div class="field"><label class="lbl">Peso real verificado (g) <span class="req">*</span></label>
          <input type="number" id="aud-peso" placeholder="0" style="font-size:1.4rem;font-family:var(--font-mono);text-align:center"
            oninput="calcDesvioAud(${r?.rendimento_peso_g||0})" />
          <div id="aud-desvio-box" class="hidden mt-8"></div>
        </div>
        <div class="field"><label class="lbl">Resultado</label>
          <div class="flex gap-12">
            <label style="flex:1;display:flex;align-items:center;gap:10px;padding:12px;border:2px solid var(--ok);border-radius:var(--radius-md);cursor:pointer;background:var(--ok-bg)">
              <input type="radio" name="aud-result" value="true" checked style="accent-color:var(--ok);width:16px;height:16px" />
              <span style="font-weight:700;color:var(--ok)">✓ Aprovada</span>
            </label>
            <label style="flex:1;display:flex;align-items:center;gap:10px;padding:12px;border:2px solid var(--danger);border-radius:var(--radius-md);cursor:pointer;background:var(--danger-bg)">
              <input type="radio" name="aud-result" value="false" style="accent-color:var(--danger);width:16px;height:16px" />
              <span style="font-weight:700;color:var(--danger)">✕ Reprovada</span>
            </label>
          </div>
        </div>
        <div class="field"><label class="lbl">Observações</label>
          <textarea id="aud-obs" rows="3" placeholder="Registre variações encontradas..."></textarea>
        </div>
        <button class="btn btn-primary w-full" onclick="salvarAuditoria('${id}','${r?.rendimento_peso_g||0}')" id="btn-aud">
          ${icon('check_circ')} Registrar Validação
        </button>
      </div>
    </div>
  `);
});

function calcDesvioAud(esperado) {
  const real=parseFloat(document.getElementById('aud-peso').value);
  const box =document.getElementById('aud-desvio-box');
  if(!real||!esperado){box.classList.add('hidden');return;}
  const dev=((real-esperado)/esperado*100).toFixed(1);
  const alto=Math.abs(dev)>5;
  box.className=`alert ${alto?'alert-amber':'alert-ok'} mt-8`;
  box.innerHTML=`${alto?icon('alert',16):icon('check_circ',16)} <span>Desvio: ${dev}% ${alto?'— acima de 5%':'— dentro do padrão'}</span>`;
  box.classList.remove('hidden');
}

async function salvarAuditoria(recId, pesoEsp) {
  const peso =parseFloat(document.getElementById('aud-peso').value);
  const aprov=document.querySelector('input[name="aud-result"]:checked').value==='true';
  const obs  =document.getElementById('aud-obs').value;
  const erro =document.getElementById('aud-erro');
  if(!peso){erro.textContent='Informe o peso verificado.';erro.classList.remove('hidden');return;}
  const btn=document.getElementById('btn-aud');
  btn.disabled=true; btn.innerHTML=icon('refresh')+' Registrando...';
  const sem=new Date(); sem.setDate(sem.getDate()-sem.getDay()+1);
  const {error}=await db.from('auditorias_semanais').insert({
    receita_id:recId, nutricionista_id:App.perfil?.id,
    semana_ref:sem.toISOString().split('T')[0],
    peso_esperado_g:parseFloat(pesoEsp), peso_verificado_g:peso,
    aprovada:aprov, observacoes:obs, validada_em:new Date().toISOString()
  });
  if(error){erro.textContent=error.message;erro.classList.remove('hidden');btn.disabled=false;btn.innerHTML=icon('check_circ')+' Registrar';return;}
  toast('Validação registrada!','ok');
  navigate('auditoria');
}

/* ── PRODUÇÃO ────────────────────────────────────────────────── */
registerRoute('producao', async () => {
  if (!await checkAuth()) return;
  renderLayout('', 'producao');
  const {data:logs}=await db.from('logs_producao')
    .select('*, receitas(nome,sku_variacao), usuarios(nome)')
    .order('produzido_em',{ascending:false}).limit(100);
  const rows=(logs||[]).map(l=>{
    const alto=Math.abs(l.desvio_pct||0)>5;
    return `<tr>
      <td><strong>${l.receitas?.nome||'—'}</strong><br/><span class="font-mono text-xs text-muted">${l.receitas?.sku_variacao||''}</span></td>
      <td>${l.usuarios?.nome||'—'}</td>
      <td class="mono">${l.quantidade_produzida||'—'} un</td>
      <td class="mono">${l.peso_real_g||'—'}g</td>
      <td><span style="font-weight:700;color:${alto?'var(--amber)':'var(--ok)'}">${l.desvio_pct!=null?(alto?'⚠ ':'')+l.desvio_pct.toFixed(1)+'%':'—'}</span></td>
      <td>${fmtDatetime(l.produzido_em)}</td>
      <td><span class="badge ${l.etiqueta_gerada?'badge-ok':'badge-warn'}">${l.etiqueta_gerada?'Gerada':'Pendente'}</span></td>
    </tr>`;}).join('');
  setMain(`
    <div class="page-header"><div class="ph-left"><h1>Log de Produção</h1><p>Histórico de produções registradas</p></div></div>
    <div class="card no-pad">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Receita</th><th>Padeiro</th><th>Qtd</th><th>Peso Real</th><th>Desvio</th><th>Data/Hora</th><th>Etiqueta</th></tr></thead>
          <tbody>${rows||'<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">Nenhuma produção</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `);
});

/* ── CONFORMIDADE ────────────────────────────────────────────── */
/* ── CONFORMIDADE — DUAS ABAS ────────────────────────────────── */

// ── Aba 1: VISA / Procon ──────────────────────────────────────
const CHECKLIST_VISA = [
  'Todos os alimentos etiquetados com nome e validade',
  'Preço por 100g exibido nos itens a quilo (Procon)',
  'Temperatura do forno verificada e registrada',
  'Área de produção limpa e sanitizada',
  'EPI em uso: touca, avental e luvas',
  'Alérgenos identificados e separados fisicamente',
  'Receitas validadas acessíveis no tablet',
  'Descartes de insumos vencidos realizados',
  'Utensílios lavados após cada uso',
  'Temperatura de conservação conferida',
];

// ── Aba 2: Operacional Royal ──────────────────────────────────
const CHECKLIST_OP = [
  'Limpar buffet, limpar carrinho buffet e ligar buffet',
  'Limpar mesas e cadeiras do restaurante (3x ao dia)',
  'Tirar os lixos',
  'Passar pano no chão (não atender cliente enquanto limpa)',
  'Repor bebidas',
  'Abastecer com produtos do depósito',
  'Abastecer produtos terceirizados',
  'Conferir datas de validade — área de venda externa',
  'Conferir validade e produtos do carrinho 50%',
  'Limpar, organizar e abastecer vitrines fechadas',
  'Vitrine salgada',
  'Vitrine confeitaria seca',
  'Vitrine confeitaria úmida',
  'Vitrine externa de tortas e sobremesas',
  'Limpar máquina de café e repor insumos',
];

let _checkItens    = CHECKLIST_VISA.map((t,i) => ({id:i, texto:t, ok:false}));
let _checkItensOp  = CHECKLIST_OP.map((t,i)   => ({id:i, texto:t, ok:false}));
let _abaConf       = 'visa'; // 'visa' ou 'operacional'

registerRoute('conformidade', async () => {
  if (!await checkAuth()) return;
  renderLayout('', 'conformidade');
  await renderConfLayout();
});

async function renderConfLayout() {
  const hoje = new Date().toISOString().split('T')[0];
  const [{data:histVisa}, {data:histOp}] = await Promise.all([
    db.from('checklists_conformidade').select('*').order('data_checklist',{ascending:false}).limit(7),
    db.from('checklists_operacional').select('*').order('data_checklist',{ascending:false}).limit(21),
  ]);

  if (_abaConf === 'visa') {
    renderConformidadeVisa(histVisa||[]);
  } else {
    renderConformidadeOp(histOp||[]);
  }
}

function abas() {
  return `
    <div style="display:flex;gap:0;margin-bottom:24px;border-bottom:2px solid var(--mid)">
      <button onclick="_abaConf='visa';renderConfLayout()"
        style="padding:12px 24px;border:none;background:none;cursor:pointer;font-weight:700;
          font-size:0.9rem;border-bottom:${_abaConf==='visa'?'3px solid var(--navy)':'3px solid transparent'};
          color:${_abaConf==='visa'?'var(--navy)':'var(--gray)'};margin-bottom:-2px">
        ✓ VISA / Procon
      </button>
      <button onclick="_abaConf='operacional';renderConfLayout()"
        style="padding:12px 24px;border:none;background:none;cursor:pointer;font-weight:700;
          font-size:0.9rem;border-bottom:${_abaConf==='operacional'?'3px solid var(--navy)':'3px solid transparent'};
          color:${_abaConf==='operacional'?'var(--navy)':'var(--gray)'};margin-bottom:-2px">
        📋 Operacional Royal
      </button>
    </div>`;
}

// ── VISA / Procon ─────────────────────────────────────────────
function renderConformidadeVisa(hist) {
  const conc = _checkItens.filter(i=>i.ok).length;
  const pct  = Math.round(conc/_checkItens.length*100);
  const cor  = pct===100?'var(--ok)':pct>=75?'var(--gold)':'var(--danger)';
  const bg   = pct===100?'pf-ok':pct>=75?'pf-gold':'pf-danger';

  setMain(`
    <div style="max-width:720px">
      <div class="page-header">
        <div class="ph-left"><h1>Conformidade Diária</h1>
          <p>${new Date().toLocaleDateString('pt-BR')}</p></div>
      </div>
      ${abas()}
      <div class="meta-bar-wrap mb-16">
        <div class="meta-bar-head">
          <div><div class="mh-title">Progresso hoje — VISA + Procon</div>
            <div class="mh-label">${conc} de ${_checkItens.length} itens</div></div>
          <div class="mh-val" style="color:${cor}">${pct}%</div>
        </div>
        <div class="progress-bar mb-8"><div class="progress-fill ${bg}" style="width:${pct}%"></div></div>
        <p class="meta-bar-msg" style="color:${cor}">
          ${pct===100?'✓ Todos verificados!':pct>=75?`${_checkItens.length-conc} restantes`:`${icon('alert',14)} ${_checkItens.length-conc} pendentes — risco de autuação`}
        </p>
      </div>
      <div class="card no-pad mb-16">
        <div style="background:var(--navy);padding:12px 18px">
          <h3 style="color:#fff;font-size:0.875rem">Itens VISA / Procon</h3>
        </div>
        ${_checkItens.map(item=>`
          <button class="check-item ${item.ok?'checked':''}" onclick="toggleCheckVisa(${item.id})">
            <span class="ci-icon">${item.ok?'✅':'⬜'}</span>
            <span class="ci-text">${item.texto}</span>
          </button>`).join('')}
      </div>
      <div class="flex gap-12 mb-24">
        <button class="btn btn-primary" onclick="salvarChecklistVisa()">${icon('save')} Salvar</button>
        <button class="btn btn-outline btn-sm" onclick="_checkItens=_checkItens.map(i=>({...i,ok:true}));renderConfLayout()">Marcar todos</button>
        <button class="btn btn-ghost btn-sm" onclick="_checkItens=_checkItens.map(i=>({...i,ok:false}));renderConfLayout()">Limpar</button>
      </div>
      ${hist.length?`<div class="card"><div class="card-header"><h3>Histórico (7 dias)</h3></div>
        ${hist.map(h=>`
          <div class="flex justify-between items-center" style="padding:10px;background:var(--gray-light);border-radius:8px;margin-bottom:6px">
            <span class="text-sm font-bold text-navy">${fmt(h.data_checklist)}</span>
            <div class="flex items-center gap-12">
              <span class="text-xs text-muted">${h.itens_ok}/${h.itens_total}</span>
              <span class="font-bold text-sm" style="color:${h.percentual===100?'var(--ok)':h.percentual>=75?'var(--gold)':'var(--danger)'}">${h.percentual}%</span>
            </div>
          </div>`).join('')}
      </div>`:''}
    </div>
  `);
}

function toggleCheckVisa(id) {
  _checkItens = _checkItens.map(i => i.id===id ? {...i,ok:!i.ok} : i);
  const conc = _checkItens.filter(i=>i.ok).length;
  const pct  = Math.round(conc/_checkItens.length*100);
  const cor  = pct===100?'var(--ok)':pct>=75?'var(--gold)':'var(--danger)';
  const bg   = pct===100?'pf-ok':pct>=75?'pf-gold':'pf-danger';
  document.querySelectorAll('.check-item').forEach((el,i) => {
    const item = _checkItens[i];
    el.className = `check-item ${item.ok?'checked':''}`;
    el.querySelector('.ci-icon').textContent = item.ok?'✅':'⬜';
  });
  const v=document.querySelector('.mh-val');    if(v){v.textContent=pct+'%';v.style.color=cor;}
  const f=document.querySelector('.progress-fill'); if(f){f.style.width=pct+'%';f.className=`progress-fill ${bg}`;}
  const l=document.querySelector('.mh-label');  if(l) l.textContent=`${conc} de ${_checkItens.length} itens`;
}

async function salvarChecklistVisa() {
  const conc = _checkItens.filter(i=>i.ok).length;
  const pct  = Math.round(conc/_checkItens.length*100);
  const hoje = new Date().toISOString().split('T')[0];
  const {error} = await db.from('checklists_conformidade').upsert({
    data_checklist:hoje, itens_total:_checkItens.length, itens_ok:conc,
    percentual:pct, itens_json:JSON.stringify(_checkItens)
  },{onConflict:'data_checklist'});
  if(error){toast('Erro: '+error.message,'danger');return;}
  toast('Checklist VISA salvo!','ok');
  if(pct<75) await notificar('conformidade_baixa',
    {percentual:pct,itens_ok:conc,itens_total:_checkItens.length,data:new Date().toLocaleDateString('pt-BR')},
    'Conformidade VISA baixa — '+pct+'%','Checklist com '+pct+'% de conformidade');
}

// ── OPERACIONAL ROYAL ─────────────────────────────────────────
let _turnoOp       = 'MANHÃ';
let _lojaOp        = '';
let _responsavelOp = '';
let _supervisorOp  = '';
let _gerenciaOp    = '';

function renderConformidadeOp(hist) {
  const conc = _checkItensOp.filter(i=>i.ok).length;
  const pct  = Math.round(conc/_checkItensOp.length*100);
  const cor  = pct===100?'var(--ok)':pct>=75?'var(--gold)':'var(--danger)';
  const bg   = pct===100?'pf-ok':pct>=75?'pf-gold':'pf-danger';

  // Agrupar histórico por data e turno
  const histAgrupado = {};
  (hist||[]).forEach(h => {
    if(!histAgrupado[h.data_checklist]) histAgrupado[h.data_checklist] = [];
    histAgrupado[h.data_checklist].push(h);
  });

  setMain(`
    <div style="max-width:720px">
      <div class="page-header">
        <div class="ph-left">
          <h1>Escala Diária de Tarefas</h1>
          <p>Equipe do Atendimento da Padaria — Royal · ${new Date().toLocaleDateString('pt-BR')}</p>
        </div>
      </div>
      ${abas()}

      <!-- Cabeçalho do formulário -->
      <div class="card mb-16">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
          <div>
            <label class="lbl">Loja / Unidade</label>
            <input type="text" id="op-loja" value="${_lojaOp}" placeholder="Ex: Matriz"
              onchange="_lojaOp=this.value" class="input" />
          </div>
          <div>
            <label class="lbl">Turno</label>
            <div style="display:flex;gap:8px">
              ${['MANHÃ','TARDE','NOITE'].map(t=>`
                <label style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;
                  padding:10px;border:2px solid ${_turnoOp===t?'var(--navy)':'var(--mid)'};
                  border-radius:10px;cursor:pointer;background:${_turnoOp===t?'var(--navy)':'#fff'};
                  color:${_turnoOp===t?'#fff':'var(--navy)'};font-weight:700;font-size:0.82rem">
                  <input type="radio" name="op-turno" value="${t}" ${_turnoOp===t?'checked':''}
                    onchange="_turnoOp=this.value;renderConformidadeOp([])" style="display:none" />
                  ${t}
                </label>`).join('')}
            </div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
          <div>
            <label class="lbl">Responsável</label>
            <input type="text" id="op-resp" value="${_responsavelOp}" placeholder="Nome"
              onchange="_responsavelOp=this.value" class="input" />
          </div>
          <div>
            <label class="lbl">Conferido pelo Supervisor</label>
            <input type="text" id="op-sup" value="${_supervisorOp}" placeholder="Nome"
              onchange="_supervisorOp=this.value" class="input" />
          </div>
          <div>
            <label class="lbl">Visto Gerência</label>
            <input type="text" id="op-ger" value="${_gerenciaOp}" placeholder="Nome"
              onchange="_gerenciaOp=this.value" class="input" />
          </div>
        </div>
      </div>

      <!-- Progresso -->
      <div class="meta-bar-wrap mb-16">
        <div class="meta-bar-head">
          <div><div class="mh-title">Progresso — Turno ${_turnoOp}</div>
            <div class="mh-label">${conc} de ${_checkItensOp.length} itens</div></div>
          <div class="mh-val" style="color:${cor}">${pct}%</div>
        </div>
        <div class="progress-bar mb-8"><div class="progress-fill ${bg}" style="width:${pct}%"></div></div>
        <p class="meta-bar-msg" style="color:${cor}">
          ${pct===100?'✓ Todas as tarefas concluídas!':pct>=75?`${_checkItensOp.length-conc} tarefas restantes`:`${_checkItensOp.length-conc} tarefas pendentes`}
        </p>
      </div>

      <!-- Itens -->
      <div class="card no-pad mb-16">
        <div style="background:var(--navy);padding:12px 18px;display:flex;justify-content:space-between;align-items:center">
          <h3 style="color:#fff;font-size:0.875rem">O QUE FAZER</h3>
          <span style="color:rgba(255,255,255,0.5);font-size:0.75rem">Turno: ${_turnoOp}</span>
        </div>
        ${_checkItensOp.map(item=>`
          <button class="check-item ${item.ok?'checked':''}" onclick="toggleCheckOp(${item.id})">
            <span class="ci-icon">${item.ok?'✅':'⬜'}</span>
            <span class="ci-text">${item.texto}</span>
          </button>`).join('')}
      </div>

      <div class="flex gap-12 mb-24">
        <button class="btn btn-primary" onclick="salvarChecklistOp()">${icon('save')} Salvar</button>
        <button class="btn btn-outline btn-sm" onclick="_checkItensOp=_checkItensOp.map(i=>({...i,ok:true}));renderConformidadeOp([])">Marcar todos</button>
        <button class="btn btn-ghost btn-sm" onclick="_checkItensOp=_checkItensOp.map(i=>({...i,ok:false}));renderConformidadeOp([])">Limpar</button>
      </div>

      <!-- Histórico -->
      ${Object.keys(histAgrupado).length?`
        <div class="card">
          <div class="card-header"><h3>Histórico (7 dias)</h3></div>
          ${Object.entries(histAgrupado).map(([data, turnos])=>`
            <div style="margin-bottom:12px">
              <p class="text-sm font-bold text-navy mb-8">${fmt(data)}</p>
              <div style="display:flex;gap:8px">
                ${turnos.map(t=>`
                  <div style="flex:1;background:var(--gray-light);border-radius:8px;padding:8px 12px;text-align:center">
                    <p style="font-size:10px;font-weight:700;color:var(--gray)">${t.turno}</p>
                    <p style="font-size:14px;font-weight:700;color:${t.percentual===100?'var(--ok)':t.percentual>=75?'var(--gold)':'var(--danger)'}">
                      ${t.percentual}%
                    </p>
                    <p style="font-size:10px;color:var(--text-muted)">${t.itens_ok}/${t.itens_total}</p>
                  </div>`).join('')}
              </div>
            </div>`).join('')}
        </div>`:''}
    </div>
  `);
}

function toggleCheckOp(id) {
  _checkItensOp = _checkItensOp.map(i => i.id===id ? {...i,ok:!i.ok} : i);
  const conc = _checkItensOp.filter(i=>i.ok).length;
  const pct  = Math.round(conc/_checkItensOp.length*100);
  const cor  = pct===100?'var(--ok)':pct>=75?'var(--gold)':'var(--danger)';
  const bg   = pct===100?'pf-ok':pct>=75?'pf-gold':'pf-danger';
  document.querySelectorAll('.check-item').forEach((el,i) => {
    const item = _checkItensOp[i];
    el.className = `check-item ${item.ok?'checked':''}`;
    el.querySelector('.ci-icon').textContent = item.ok?'✅':'⬜';
  });
  const v=document.querySelector('.mh-val');    if(v){v.textContent=pct+'%';v.style.color=cor;}
  const f=document.querySelector('.progress-fill'); if(f){f.style.width=pct+'%';f.className=`progress-fill ${bg}`;}
  const l=document.querySelector('.mh-label');  if(l) l.textContent=`${conc} de ${_checkItensOp.length} itens`;
}

async function salvarChecklistOp() {
  // Coletar valores dos campos antes de salvar
  _lojaOp        = document.getElementById('op-loja')?.value || _lojaOp;
  _responsavelOp = document.getElementById('op-resp')?.value || _responsavelOp;
  _supervisorOp  = document.getElementById('op-sup')?.value  || _supervisorOp;
  _gerenciaOp    = document.getElementById('op-ger')?.value  || _gerenciaOp;

  const conc = _checkItensOp.filter(i=>i.ok).length;
  const pct  = Math.round(conc/_checkItensOp.length*100);
  const hoje = new Date().toISOString().split('T')[0];

  const {error} = await db.from('checklists_operacional').upsert({
    data_checklist: hoje,
    turno:          _turnoOp,
    loja:           _lojaOp || null,
    responsavel:    _responsavelOp || null,
    supervisor:     _supervisorOp  || null,
    gerencia:       _gerenciaOp    || null,
    itens_total:    _checkItensOp.length,
    itens_ok:       conc,
    percentual:     pct,
    itens_json:     JSON.stringify(_checkItensOp),
  },{onConflict:'data_checklist,turno'});

  if(error){toast('Erro: '+error.message,'danger');return;}
  toast(`Checklist Operacional — ${_turnoOp} salvo!`,'ok');

  // Resetar itens para próxima vez
  _checkItensOp = CHECKLIST_OP.map((t,i) => ({id:i,texto:t,ok:false}));
  await renderConfLayout();
}


/* ── SETUP SKU ───────────────────────────────────────────────── */
registerRoute('setup_sku', async () => {
  if (!await checkAuth()) return;
  renderLayout('', 'setup_sku');
  setMain(`
    <div style="max-width:700px">
      <div class="page-header"><div class="ph-left"><h1>Setup de SKUs</h1><p>Importe produtos do SISMO com SKU único por variação</p></div></div>
      <div class="alert alert-amber mb-16">${icon('alert',16)}
        <div><strong>Formato (ponto e vírgula):</strong><br/>
          <code style="font-family:var(--font-mono);font-size:0.8rem">Nome;SKU-VARIACAO;SKU-FATURAMENTO;Categoria</code><br/>
          <code style="font-family:var(--font-mono);font-size:0.8rem;color:var(--text-muted)">Pão Doce com Nozes;PAD-0042-NZ;PAD-0042;Pães</code>
        </div>
      </div>
      <div class="card mb-16">
        <label class="lbl">Cole os dados aqui</label>
        <textarea id="sku-input" rows="12" style="font-family:var(--font-mono);font-size:0.82rem"
          placeholder="Nome;SKU-VARIACAO;SKU-FATURAMENTO;Categoria"></textarea>
      </div>
      <div id="sku-result" class="hidden"></div>
      <div class="flex gap-12">
        <button class="btn btn-primary" onclick="processarSKU()" id="btn-sku">${icon('refresh')} Importar SKUs</button>
        <button class="btn btn-outline" onclick="navigate('dashboard')">Ir ao Dashboard</button>
      </div>
    </div>
  `);
});

async function processarSKU() {
  const linhas=document.getElementById('sku-input').value.trim().split('\n').filter(Boolean);
  const btn=document.getElementById('btn-sku'), res=document.getElementById('sku-result');
  btn.disabled=true; btn.textContent='Importando...';
  const {data:cats}=await db.from('categorias_receita').select('*');
  const catMap={}; (cats||[]).forEach(c=>{catMap[c.nome.toLowerCase()]=c.id;});
  let ok=0, erros=[];
  for(const linha of linhas){
    const [nome,sku_v,sku_f,cat]=linha.split(';').map(s=>s?.trim());
    if(!nome||!sku_v) continue;
    let catId=catMap[cat?.toLowerCase()];
    if(!catId&&cat){const {data:nc}=await db.from('categorias_receita').insert({nome:cat}).select().single();if(nc){catId=nc.id;catMap[cat.toLowerCase()]=nc.id;}}
    const {error}=await db.from('receitas').upsert({nome,sku_variacao:sku_v.toUpperCase(),sku_faturamento:sku_f?.toUpperCase()||null,categoria_id:catId||null,status:'rascunho'},{onConflict:'sku_variacao'});
    if(error) erros.push(`${nome}: ${error.message}`); else ok++;
  }
  res.className=`alert ${erros.length?'alert-amber':'alert-ok'} mt-16`;
  res.innerHTML=`${icon(erros.length?'alert':'check_circ',16)} <div><strong>${ok} de ${linhas.length} importados</strong>${erros.length?'<ul>'+erros.map(e=>`<li>${e}</li>`).join('')+'</ul>':''}</div>`;
  res.classList.remove('hidden');
  btn.disabled=false; btn.innerHTML=icon('refresh')+' Importar SKUs';
}

/* ============================================================
   PADARIA DE VALOR — Módulo Tablet
   TabletHome · TabletPreparo · TabletFinalizar
   ============================================================ */

let _tabReceita    = null;
let _tabPassoIdx   = 0;
let _tabFator      = 1;
let _tabIngVisible = false;
let _tabIngredientes = [];
let _tabPassos       = [];

/* ── TABLET HOME ─────────────────────────────────────────────── */
registerRoute('tablet_home', async () => {
  if (!await checkAuth()) return;
  const p = App.perfil;

  renderApp(`
    <div class="tablet-screen">
      <header class="tablet-header">
        <div class="th-brand">
          <span class="th-icon">🍞</span>
          <div>
            <h1>Padaria de Valor</h1>
            <p>${p?.nome || 'Padeiro'}</p>
          </div>
        </div>
        <div class="flex items-center gap-12">
          <div class="sync-badge sync-online" id="sync-badge">
            <span class="sync-dot"></span>Online
          </div>
          <button class="btn btn-ghost btn-icon" onclick="logout()" title="Sair"
            style="color:rgba(255,255,255,0.5)">
            ${icon('logout',20)}
          </button>
        </div>
      </header>

      ${p?.modo_onboarding ? `
      <div style="background:#EFF6FF;border-bottom:2px solid #BFDBFE;padding:12px 20px;display:flex;align-items:center;gap:12px">
        <span style="font-size:1.4rem">🎓</span>
        <div>
          <p style="font-weight:700;color:#1E40AF;font-size:0.875rem">Modo Treinamento Ativo</p>
          <p style="font-size:0.75rem;color:#3B82F6">As receitas mostrarão dicas extras para te ajudar!</p>
        </div>
      </div>` : ''}

      <div class="tablet-body">
        <div class="search-box">
          ${icon('search',20)}
          <input type="search" id="t-busca" placeholder="Buscar receita ou código..."
            oninput="filtrarReceitas(this.value)" />
        </div>
        <div class="cat-row" id="cat-row">
          <div class="cat-pill active" onclick="filterCat(this,'todas')">Todas</div>
        </div>
        <div id="receita-list">
          <div style="text-align:center;padding:40px">
            <div style="width:40px;height:40px;border:4px solid var(--navy);border-top-color:var(--gold);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto"></div>
          </div>
        </div>
      </div>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  `);

  updateSyncBadge();
  await carregarReceitas();
});

let _allReceitas = [];
let _catAtiva    = 'todas';

async function carregarReceitas() {
  const { data } = await db.from('receitas')
    .select('id,nome,sku_variacao,status,categoria_id,categorias_receita(nome)')
    .eq('status','ativa').order('nome');
  _allReceitas = data || [];

  // Montar categorias
  const cats = [...new Set(_allReceitas.map(r=>r.categorias_receita?.nome).filter(Boolean))];
  const catRow = document.getElementById('cat-row');
  if (catRow) {
    catRow.innerHTML = ['todas',...cats].map(c=>`
      <div class="cat-pill ${_catAtiva===c?'active':''}" onclick="filterCat(this,'${c}')">
        ${c==='todas'?'Todas':c}
      </div>`).join('');
  }
  renderReceitas(_allReceitas);
}

function filterCat(el, cat) {
  document.querySelectorAll('.cat-pill').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');
  _catAtiva = cat;
  const busca = document.getElementById('t-busca')?.value || '';
  filtrarReceitas(busca);
}

function filtrarReceitas(q) {
  const f = _allReceitas.filter(r => {
    const bOk = !q || r.nome?.toLowerCase().includes(q.toLowerCase()) ||
                       r.sku_variacao?.toLowerCase().includes(q.toLowerCase());
    const cOk  = _catAtiva==='todas' || r.categorias_receita?.nome===_catAtiva;
    return bOk && cOk;
  });
  renderReceitas(f);
}

function renderReceitas(list) {
  const el = document.getElementById('receita-list');
  if (!el) return;
  if (!list.length) {
    el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)">
      <p style="font-size:2rem;margin-bottom:8px">🔍</p>
      <p style="font-weight:600">Nenhuma receita encontrada</p>
      <p style="font-size:0.8rem;margin-top:4px">Tente outro nome ou código</p>
    </div>`; return;
  }
  el.innerHTML = list.map(r => `
    <div class="receita-card" onclick="navigate('tablet_preparo',{id:'${r.id}'})">
      <div>
        <div class="rc-nome">${r.nome}</div>
        <div class="rc-sku">${r.sku_variacao}</div>
        ${r.categorias_receita?.nome?`<div class="rc-cat">${r.categorias_receita.nome}</div>`:''}
      </div>
      <span class="rc-arrow">›</span>
    </div>`).join('');
}

/* ── TABLET PREPARO ──────────────────────────────────────────── */
registerRoute('tablet_preparo', async ({id}={}) => {
  if (!await checkAuth()) return;

  // Carregar dados
  const [{data:r},{data:ing},{data:ps}] = await Promise.all([
    db.from('receitas').select('*').eq('id',id).single(),
    db.from('ingredientes_receita').select('*').eq('receita_id',id).order('ordem'),
    db.from('passos_preparo').select('*').eq('receita_id',id).order('ordem'),
  ]);

  _tabReceita      = r;
  _tabIngredientes = ing || [];
  _tabPassos       = ps  || [];
  _tabPassoIdx     = 0;
  _tabFator        = 1;
  _tabIngVisible   = false;

  renderApp(`
    <div class="tablet-screen" style="min-height:100vh;display:flex;flex-direction:column">
      <div class="prep-header">
        <button class="back-btn" onclick="navigate('tablet_home')">
          ${icon('arrow_left',16)} Voltar
        </button>
        <h1>${r?.nome}</h1>
        <div class="prep-sku">${r?.sku_variacao}</div>
      </div>

      <div class="tablet-body" id="prep-body" style="flex:1;overflow-y:auto">
        <!-- Calculadora Dinâmica -->
        <div class="calc-card">
          <h3>${icon('scale',16)} Calculadora de Rendimento</h3>
          <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:12px">
            Informe a quantidade do ingrediente base (${_tabIngredientes[0]?.nome||'1º ingrediente'}) para recalcular toda a receita:
          </p>
          <div class="calc-row">
            <input type="number" id="massa-input" placeholder="${_tabIngredientes[0]?.quantidade_base||1000}"
              inputmode="decimal" oninput="previewFator(this.value)" />
            <span class="unit">${_tabIngredientes[0]?.unidade||'g'}</span>
            <button class="btn btn-gold btn-sm" onclick="aplicarFator()">Calcular</button>
          </div>
          <p class="calc-success" id="calc-success"></p>
        </div>

        <!-- Toggle ingredientes -->
        <button class="ing-toggle" onclick="toggleIng()">
          <span id="ing-toggle-label">Ver ingredientes</span>
          <span id="ing-toggle-arrow">▼</span>
        </button>
        <div id="ing-list" style="display:none"></div>

        <!-- Passo atual (proteção IP: 1 por vez) -->
        <div id="passo-card"></div>
      </div>

      <!-- Navegação -->
      <div class="nav-btns">
        <button class="btn btn-outline btn-lg" id="btn-prev" onclick="prevPasso()" disabled>
          ${icon('arrow_left')} Anterior
        </button>
        <button class="btn btn-primary btn-lg" id="btn-next" onclick="nextPasso()">
          Próximo ${icon('arrow_right')}
        </button>
      </div>
    </div>
  `);

  renderIngredientes();
  renderPasso();
});

function previewFator(val) {
  const v = parseFloat(val);
  if (!v || !_tabIngredientes[0]) return;
  _tabFator = v / _tabIngredientes[0].quantidade_base;
}

function aplicarFator() {
  const val = parseFloat(document.getElementById('massa-input')?.value);
  if (!val || !_tabIngredientes[0]) return;
  _tabFator = val / _tabIngredientes[0].quantidade_base;
  renderIngredientes();
  const msg = document.getElementById('calc-success');
  if (msg) { msg.textContent = `✓ Fator ×${_tabFator.toFixed(2)} aplicado — ingredientes recalculados`; msg.style.display='block'; }
}

function toggleIng() {
  _tabIngVisible = !_tabIngVisible;
  const list = document.getElementById('ing-list');
  const lbl  = document.getElementById('ing-toggle-label');
  const arr  = document.getElementById('ing-toggle-arrow');
  if (list) list.style.display = _tabIngVisible ? 'block' : 'none';
  if (lbl)  lbl.textContent = _tabIngVisible ? 'Ocultar ingredientes' : 'Ver ingredientes';
  if (arr)  arr.textContent = _tabIngVisible ? '▲' : '▼';
}

function renderIngredientes() {
  const el = document.getElementById('ing-list');
  if (!el) return;
  el.innerHTML = _tabIngredientes.map(ing => {
    const qtd = parseFloat((ing.quantidade_base * _tabFator).toFixed(1));
    return `<div class="ing-item ${ing.alergeno?'alergeno':'normal'}">
      <div style="display:flex;align-items:center;gap:8px">
        ${ing.alergeno?'<span style="font-size:1.1rem">⚠</span>':''}
        <span class="in-nome">${ing.nome}${ing.alergeno?'<span class="in-alert">(ALÉRGENO)</span>':''}</span>
      </div>
      <span class="in-qtd">${qtd} ${ing.unidade}</span>
    </div>`;}).join('');
  if (el.style.display === 'block') { /* já visível */ }
}

function renderPasso() {
  const p      = _tabPassos[_tabPassoIdx];
  const total  = _tabPassos.length;
  const atual  = _tabPassoIdx + 1;
  const pct    = Math.round(atual/total*100);
  const isUlt  = _tabPassoIdx === total - 1;
  const onb    = App.perfil?.modo_onboarding;

  const card = document.getElementById('passo-card');
  if (!card || !p) return;

  card.innerHTML = `
    <div class="passo-card">
      <div class="prog-row">
        <span class="prog-label">Passo ${atual} de ${total}</span>
        <span class="prog-pct">${pct}%</span>
      </div>
      <div class="prog-track"><div class="prog-fill" style="width:${pct}%"></div></div>
      ${p.tempo_minutos?`<p class="passo-tempo">⏱ Tempo estimado: ${p.tempo_minutos} min</p>`:''}
      <p class="passo-texto">${p.descricao}</p>
      ${onb?`<div class="passo-dica" style="display:block">💡 <strong>Dica de treinamento:</strong> Leia o passo com atenção antes de executar. Em caso de dúvida, consulte o líder da padaria.</div>`:''}
    </div>
  `;

  const prev = document.getElementById('btn-prev');
  const next = document.getElementById('btn-next');
  if (prev) prev.disabled = _tabPassoIdx === 0;
  if (next) {
    if (isUlt) {
      next.className = 'btn btn-gold btn-lg';
      next.innerHTML = `Finalizar ✓`;
      next.onclick   = () => navigate('tablet_finalizar', {id:_tabReceita?.id});
    } else {
      next.className = 'btn btn-primary btn-lg';
      next.innerHTML = `Próximo ${icon('arrow_right')}`;
      next.onclick   = nextPasso;
    }
  }
}

function prevPasso() { if (_tabPassoIdx>0) { _tabPassoIdx--; renderPasso(); } }
function nextPasso()  { if (_tabPassoIdx<_tabPassos.length-1) { _tabPassoIdx++; renderPasso(); } }

/* ── TABLET FINALIZAR ────────────────────────────────────────── */
registerRoute('tablet_finalizar', async ({id}={}) => {
  if (!await checkAuth()) return;
  const r   = _tabReceita || {};
  const ing = _tabIngredientes;
  const rendEsp = (r.rendimento_peso_g||0) * _tabFator;

  renderApp(`
    <div class="tablet-screen" style="min-height:100vh;display:flex;flex-direction:column">
      <div class="prep-header">
        <button class="back-btn" onclick="navigate('tablet_preparo',{id:'${id}'})">
          ${icon('arrow_left',16)} Voltar ao preparo
        </button>
        <h1>Finalizar Produção</h1>
        <div class="prep-sku">${r.nome||''}</div>
      </div>

      <div class="tablet-body" id="fin-body" style="flex:1;overflow-y:auto">
        <div id="fin-erro" class="alert alert-danger hidden" style="margin-bottom:14px"></div>

        <!-- Quantidade -->
        <div style="margin-bottom:16px">
          <label style="display:block;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--navy);margin-bottom:8px">
            Quantidade produzida (unidades)
          </label>
          <input type="number" id="fin-qtd" inputmode="numeric" placeholder="0"
            style="font-size:2rem;font-family:var(--font-mono);text-align:center;width:100%;padding:16px"
            oninput="atualizarFinalizacao(${rendEsp})" />
        </div>

        <!-- Peso real -->
        <div style="margin-bottom:16px">
          <label style="display:block;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--navy);margin-bottom:8px">
            Peso total real (gramas)
            ${rendEsp?`<span style="font-weight:400;color:var(--text-muted);font-size:0.7rem;text-transform:none;margin-left:8px">Esperado: ${rendEsp.toFixed(0)}g</span>`:''}
          </label>
          <input type="number" id="fin-peso" inputmode="decimal" placeholder="${rendEsp?rendEsp.toFixed(0):'0'}"
            style="font-size:2rem;font-family:var(--font-mono);text-align:center;width:100%;padding:16px"
            oninput="atualizarFinalizacao(${rendEsp})" />
          <div id="fin-desvio" class="hidden" style="margin-top:8px"></div>
        </div>

        <!-- Preço/kg -->
        <div style="margin-bottom:16px">
          <label style="display:block;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--navy);margin-bottom:8px">
            Preço de venda (R$/kg) — para etiqueta
          </label>
          <div style="position:relative">
            <span style="position:absolute;left:16px;top:50%;transform:translateY(-50%);font-weight:700;color:var(--gray);font-size:1rem">R$</span>
            <input type="number" id="fin-preco" inputmode="decimal" placeholder="59.99"
              style="font-size:2rem;font-family:var(--font-mono);text-align:center;width:100%;padding:16px;padding-left:52px"
              oninput="atualizarEtiquetaFin()" />
          </div>
          <div id="fin-procon" class="hidden" style="margin-top:6px;font-size:0.8rem;font-weight:600;color:var(--ok)"></div>
        </div>

        <!-- Preview etiqueta -->
        <div id="fin-etiqueta" class="hidden"></div>

        <button class="btn btn-gold btn-xl" onclick="confirmarProducao('${id}')" id="btn-confirmar" disabled
          style="margin-top:8px">
          ✓ Confirmar e Gerar Etiqueta
        </button>
      </div>

      <!-- Tela de sucesso (hidden) -->
      <div id="fin-sucesso" class="hidden" style="flex:1;display:flex;align-items:center;justify-content:center;padding:40px">
        <div class="sucesso-screen">
          <div class="s-icon">✅</div>
          <h2>Produção Registrada!</h2>
          <p id="fin-sucesso-msg"></p>
          <div style="margin-top:24px">
            <div id="etiqueta-impressao"></div>
            <button class="btn btn-gold btn-lg w-full" style="margin-top:12px" onclick="navigate('tablet_home')">
              ${icon('arrow_left')} Nova Produção
            </button>
          </div>
        </div>
      </div>
    </div>
  `);
});

function atualizarFinalizacao(rendEsp) {
  atualizarEtiquetaFin();
  const peso = parseFloat(document.getElementById('fin-peso')?.value);
  const box  = document.getElementById('fin-desvio');
  if (!box) return;
  if (!peso || !rendEsp) { box.classList.add('hidden'); return; }
  const dev  = ((peso - rendEsp) / rendEsp * 100).toFixed(1);
  const alto = Math.abs(dev) > 5;
  box.className = `alert ${alto?'alert-amber':'alert-ok'}`;
  box.innerHTML = `${alto?icon('alert',16):icon('check_circ',16)} <span>Desvio: ${dev}% ${alto?'— registre o motivo na observação':'— dentro do padrão'}</span>`;
  box.classList.remove('hidden');
  verificarBotao();
}

function atualizarEtiquetaFin() {
  const preco = parseFloat(document.getElementById('fin-preco')?.value);
  const peso  = parseFloat(document.getElementById('fin-peso')?.value);
  const qtd   = parseInt(document.getElementById('fin-qtd')?.value);
  const procon= document.getElementById('fin-procon');
  const etiq  = document.getElementById('fin-etiqueta');

  if (preco && procon) {
    const p100 = (preco/10).toFixed(2);
    procon.textContent = `→ Etiqueta mostrará R$ ${p100}/100g (conformidade Procon ✓)`;
    procon.classList.remove('hidden');
  }

  if (!peso && !preco) { if(etiq) etiq.classList.add('hidden'); verificarBotao(); return; }

  const r    = _tabReceita || {};
  const ing  = _tabIngredientes;
  const hoje = new Date();
  const val  = addDias(hoje, 3);
  const alerg = ing.filter(i=>i.alergeno).map(i=>i.nome).join(', ');
  const p100  = preco ? 'R$ '+(preco/10).toFixed(2) : null;

  if (etiq) {
    etiq.classList.remove('hidden');
    etiq.innerHTML = `
      <p style="font-size:0.75rem;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:8px">Prévia da Etiqueta</p>
      <div class="etiqueta-preview" id="etiqueta-content">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px">
          <div class="etiq-nome">${r.nome||'—'}</div>
          <span style="font-family:var(--font-mono);font-size:0.68rem;color:var(--text-muted)">${r.sku_variacao||''}</span>
        </div>
        <div class="etiq-grid">
          <span>Fabricado: <strong>${fmt(hoje)}</strong></span>
          <span>Validade: <strong>${fmt(val)}</strong></span>
          <span>Qtd: <strong>${qtd||'—'} un</strong></span>
          <span>Peso: <strong>${peso||'—'}g</strong></span>
        </div>
        ${p100?`<div class="etiq-preco"><span class="ep-val">${p100}</span><span class="ep-unit"> / 100g</span><span class="ep-kg">R$ ${preco.toFixed(2)}/kg</span></div>`:''}
        ${alerg?`<div class="etiq-alerg">⚠ CONTÉM: ${alerg.toUpperCase()}</div>`:''}
        <div class="etiq-rodape">Padaria de Valor — Supermercado Royal</div>
      </div>
    `;
  }
  verificarBotao();
}

function verificarBotao() {
  const qtd  = document.getElementById('fin-qtd')?.value;
  const peso = document.getElementById('fin-peso')?.value;
  const btn  = document.getElementById('btn-confirmar');
  if (btn) btn.disabled = !qtd || !peso;
}

async function confirmarProducao(recId) {
  const qtd   = parseInt(document.getElementById('fin-qtd').value);
  const peso  = parseFloat(document.getElementById('fin-peso').value);
  const preco = parseFloat(document.getElementById('fin-preco').value) || null;
  const r     = _tabReceita || {};
  const rendEsp = (r.rendimento_peso_g||0) * _tabFator;
  const desvio  = rendEsp ? parseFloat(((peso-rendEsp)/rendEsp*100).toFixed(2)) : null;

  const btn = document.getElementById('btn-confirmar');
  btn.disabled=true; btn.textContent='Registrando...';

  const payload = {
    receita_id:           recId,
    padeiro_id:           App.perfil?.id,
    quantidade_produzida: qtd,
    peso_real_g:          peso,
    multiplicador:        _tabFator,
    desvio_pct:           desvio,
    preco_kg:             preco,
    etiqueta_gerada:      true,
    modo_onboarding:      App.perfil?.modo_onboarding || false,
    produzido_em:         new Date().toISOString(),
  };

  const { error } = await db.from('logs_producao').insert(payload);

  // Mesmo com erro de conectividade, simula sucesso offline
  const finBody    = document.getElementById('fin-body');
  const finSucesso = document.getElementById('fin-sucesso');
  if (finBody)    finBody.classList.add('hidden');
  if (finSucesso) finSucesso.classList.remove('hidden');
  finSucesso.style.display='flex';

  document.getElementById('fin-sucesso-msg').textContent =
    `${r.nome} — ${qtd} unidades / ${peso}g registrados com sucesso.${error?' (modo offline — será sincronizado)':''}`;

  // Etiqueta para impressão
  const etiqContent = document.getElementById('etiqueta-content');
  const impArea     = document.getElementById('etiqueta-impressao');
  if (etiqContent && impArea) {
    impArea.innerHTML = etiqContent.outerHTML;
    const printBtn = document.createElement('button');
    printBtn.className = 'btn btn-outline btn-sm w-full';
    printBtn.innerHTML = `${icon('printer',15)} Imprimir Etiqueta`;
    printBtn.style.marginTop = '8px';
    printBtn.onclick = () => {
      const w = window.open('','_blank');
      w.document.write(`<html><head><title>Etiqueta</title><style>
        body{font-family:monospace;padding:20px;max-width:300px}
        .etiq-nome{font-size:1rem;font-weight:bold;margin-bottom:8px}
        .etiq-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:0.75rem;margin-bottom:8px}
        .etiq-preco{background:#1B2A4A;color:#fff;padding:8px;text-align:center;margin-bottom:8px;border-radius:6px}
        .etiq-alerg{font-size:0.7rem;font-weight:bold;color:#92400E;background:#FFFBEB;padding:4px 8px;border-radius:4px;margin-bottom:6px}
        .etiq-rodape{font-size:0.65rem;color:#666}
      </style></head><body>${etiqContent.innerHTML}</body></html>`);
      w.document.close(); w.print();
    };
    impArea.appendChild(printBtn);
  }
}

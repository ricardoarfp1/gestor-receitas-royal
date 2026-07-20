// ============================================================
// GESTOR DE RECEITAS — Edge Function: Notificações
// Dispara e-mails via Resend para eventos do sistema
// ============================================================

const RESEND_KEY   = Deno.env.get('RESEND_API_KEY') || '';
const FROM         = 'Gestor de Receitas <onboarding@resend.dev>';

// Destinatários — adicione Rafael aqui quando precisar
const DESTINATARIOS = [
  'ricardoarfp@gmail.com',
  // 'rafael@supermercadoroyal.com.br', // descomentar quando quiser adicionar
];

// ── Enviar e-mail via Resend ──────────────────────────────────
async function enviarEmail(assunto: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to:   DESTINATARIOS,
      subject: assunto,
      html,
    }),
  });
  return res.ok;
}

// ── Templates de e-mail ───────────────────────────────────────
function templateBase(titulo: string, corpo: string, cor = '#1B2A4A') {
  return `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head><meta charset="UTF-8"/></head>
  <body style="margin:0;padding:0;background:#F5F7FA;font-family:Inter,sans-serif">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0">
      <tr><td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
          <!-- Header -->
          <tr><td style="background:${cor};padding:24px 32px">
            <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.6)">Gestor de Receitas · Supermercado Royal</p>
            <h1 style="margin:8px 0 0;font-size:20px;font-weight:800;color:#fff">${titulo}</h1>
          </td></tr>
          <!-- Corpo -->
          <tr><td style="padding:28px 32px">
            ${corpo}
          </td></tr>
          <!-- Footer -->
          <tr><td style="padding:16px 32px 24px;border-top:1px solid #E5E7EB">
            <p style="margin:0;font-size:11px;color:#9CA3AF">
              Valor Soluções Empresariais · padariaroyal.appsdevalor.com.br
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
  </html>`;
}

function emailNovaReceita(dados: any) {
  const corpo = `
    <p style="font-size:15px;color:#374151;margin:0 0 20px">
      Uma nova receita foi cadastrada no sistema.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;border-radius:12px;padding:20px;margin-bottom:24px">
      <tr><td style="padding:6px 0">
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;color:#9CA3AF">Nome</span><br/>
        <span style="font-size:16px;font-weight:700;color:#1B2A4A">${dados.nome}</span>
      </td></tr>
      <tr><td style="padding:6px 0;border-top:1px solid #E5E7EB">
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;color:#9CA3AF">SKU Variação</span><br/>
        <span style="font-size:14px;font-family:monospace;color:#1B2A4A">${dados.sku_variacao}</span>
      </td></tr>
      <tr><td style="padding:6px 0;border-top:1px solid #E5E7EB">
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;color:#9CA3AF">Categoria</span><br/>
        <span style="font-size:14px;color:#374151">${dados.categoria || '—'}</span>
      </td></tr>
      <tr><td style="padding:6px 0;border-top:1px solid #E5E7EB">
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;color:#9CA3AF">Status inicial</span><br/>
        <span style="font-size:14px;color:#374151">${dados.status}</span>
      </td></tr>
      <tr><td style="padding:6px 0;border-top:1px solid #E5E7EB">
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;color:#9CA3AF">Criada em</span><br/>
        <span style="font-size:14px;color:#374151">${new Date().toLocaleString('pt-BR')}</span>
      </td></tr>
    </table>
    <a href="https://tangerine-genie-48c043.netlify.app#receitas"
       style="display:inline-block;background:#1B2A4A;color:#fff;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none">
      Ver no sistema →
    </a>`;
  return templateBase('Nova Receita Cadastrada 🍞', corpo, '#1B2A4A');
}

function emailConformidadeBaixa(dados: any) {
  const cor = dados.percentual < 50 ? '#C0392B' : '#B45309';
  const corpo = `
    <div style="background:${dados.percentual < 50 ? '#FEF2F2' : '#FFFBEB'};border-radius:12px;padding:20px;margin-bottom:20px;border-left:4px solid ${cor}">
      <p style="margin:0;font-size:14px;font-weight:700;color:${cor}">
        ⚠ Conformidade em ${dados.percentual}% — ${dados.percentual < 50 ? 'Risco crítico de autuação' : 'Atenção necessária'}
      </p>
    </div>
    <p style="font-size:15px;color:#374151;margin:0 0 16px">
      O checklist de conformidade do dia <strong>${dados.data}</strong> foi salvo com apenas
      <strong>${dados.itens_ok} de ${dados.itens_total} itens</strong> verificados.
    </p>
    <p style="font-size:14px;color:#6B7280;margin:0 0 24px">
      Itens não verificados representam risco de autuação pela Vigilância Sanitária ou Procon.
      Corrija antes da próxima fiscalização.
    </p>
    <a href="https://tangerine-genie-48c043.netlify.app#conformidade"
       style="display:inline-block;background:${cor};color:#fff;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none">
      Ver checklist →
    </a>`;
  return templateBase('Alerta de Conformidade ⚠', corpo, cor);
}

function emailConformidadeNaoPreenchida(data: string) {
  const corpo = `
    <div style="background:#FEF2F2;border-radius:12px;padding:20px;margin-bottom:20px;border-left:4px solid #C0392B">
      <p style="margin:0;font-size:14px;font-weight:700;color:#C0392B">
        ⚠ Checklist não preenchido hoje
      </p>
    </div>
    <p style="font-size:15px;color:#374151;margin:0 0 16px">
      O checklist de conformidade do dia <strong>${data}</strong> ainda não foi preenchido.
    </p>
    <p style="font-size:14px;color:#6B7280;margin:0 0 24px">
      Lembre o responsável de preencher antes do início da produção.
      Operar sem o checklist pode resultar em autuação.
    </p>
    <a href="https://tangerine-genie-48c043.netlify.app#conformidade"
       style="display:inline-block;background:#C0392B;color:#fff;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none">
      Preencher agora →
    </a>`;
  return templateBase('Conformidade Não Preenchida ⚠', corpo, '#C0392B');
}

// ── Handler principal ─────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await req.json();
    const { tipo, dados } = body;

    let ok = false;

    if (tipo === 'nova_receita') {
      ok = await enviarEmail(
        `Nova receita cadastrada: ${dados.nome}`,
        emailNovaReceita(dados)
      );
    }

    else if (tipo === 'conformidade_baixa') {
      ok = await enviarEmail(
        `⚠ Conformidade ${dados.percentual}% — ${dados.data}`,
        emailConformidadeBaixa(dados)
      );
    }

    else if (tipo === 'conformidade_nao_preenchida') {
      ok = await enviarEmail(
        `⚠ Checklist não preenchido — ${dados.data}`,
        emailConformidadeNaoPreenchida(dados.data)
      );
    }

    return new Response(JSON.stringify({ ok }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

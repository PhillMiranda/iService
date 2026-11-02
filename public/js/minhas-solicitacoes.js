import { sb } from './supabase.js';
import { $, el, moeda, dataHora, montarNav, exigirLogin, ROTULO_STATUS } from './comum.js';

await montarNav('cliente');
const user = await exigirLogin();
if (user) await carregar();

async function carregar() {
  const { data, error } = await sb
    .from('solicitacoes')
    .select(`
      id, status, descricao, data_agendada, endereco, valor_final, criado_em, prestador_id,
      servicos ( titulo ),
      modalidades ( nome, codigo ),
      prestadores ( perfis ( nome ) ),
      orcamentos ( id, valor, descricao, aprovado, valido_ate )
    `)
    .eq('cliente_id', user.id)
    .order('criado_em', { ascending: false });

  if (error) { console.error(error); return; }
  const lista = $('#lista');
  lista.innerHTML = '';
  $('#vazio').hidden = (data || []).length > 0;

  for (const s of data || []) {
    const fechada = ['aceita', 'em_andamento', 'concluida'].includes(s.status);
    const card = el('div', { class: 'cartao', style: 'margin-bottom:14px' }, [
      el('div', { style: 'display:flex;justify-content:space-between;gap:10px;align-items:start' }, [
        el('div', {}, [
          el('h3', {}, s.servicos?.titulo || 'Serviço'),
          el('p', { class: 'meta' }, `${s.prestadores?.perfis?.nome || 'Prestador'} · ${s.modalidades?.nome || ''}`),
        ]),
        el('span', { class: `status ${s.status}` }, ROTULO_STATUS[s.status] || s.status),
      ]),
      s.data_agendada ? el('p', { class: 'meta' }, `📅 ${dataHora(s.data_agendada)}`) : '',
      s.descricao ? el('p', {}, s.descricao) : '',
    ]);

    // Orçamento pendente de aprovação
    const orc = (s.orcamentos || []).find((o) => o.aprovado == null);
    if (orc && s.status === 'orcamento_enviado') {
      card.append(
        el('div', { class: 'aviso info' }, `Orçamento: ${moeda(orc.valor)}${orc.descricao ? ' — ' + orc.descricao : ''}`),
        el('div', { class: 'linha-acoes' }, [
          el('button', { class: 'btn-sm', onclick: () => aprovar(orc, s.id, true) }, 'Aprovar orçamento'),
          el('button', { class: 'btn-sm sec', onclick: () => aprovar(orc, s.id, false) }, 'Recusar'),
        ])
      );
    }

    // Contato liberado após fechar
    if (fechada) card.append(await blocoContato(s.prestador_id, s.prestadores?.perfis?.nome));

    // Avaliar quando concluída
    if (s.status === 'concluida') card.append(blocoAvaliacao(s));

    lista.append(card);
  }
}

async function blocoContato(prestadorId, nome) {
  const { data } = await sb.from('contatos').select('telefone, whatsapp, email_contato').eq('id', prestadorId).maybeSingle();
  const box = el('div', { class: 'contato-box' }, [el('strong', {}, `Contato de ${nome || 'prestador'}`)]);
  if (!data) {
    box.append(el('p', { class: 'meta', style: 'margin:6px 0 0' }, 'O prestador ainda não cadastrou um contato.'));
  } else {
    if (data.telefone) box.append(el('p', { style: 'margin:6px 0 0' }, `📞 ${data.telefone}`));
    if (data.whatsapp) box.append(el('p', { style: 'margin:2px 0 0' }, `💬 ${data.whatsapp}`));
    if (data.email_contato) box.append(el('p', { style: 'margin:2px 0 0' }, `✉️ ${data.email_contato}`));
  }
  return box;
}

function blocoAvaliacao(s) {
  const box = el('div', { style: 'margin-top:10px' });
  sb.from('avaliacoes').select('id').eq('solicitacao_id', s.id).eq('autor_id', user.id).maybeSingle()
    .then(({ data }) => {
      if (data) { box.append(el('p', { class: 'meta' }, '✓ Você já avaliou.')); return; }
      const sel = el('select', {}, [5, 4, 3, 2, 1].map((n) => el('option', { value: n }, `${'★'.repeat(n)} (${n})`)));
      const txt = el('input', { type: 'text', placeholder: 'Comentário (opcional)' });
      const btn = el('button', { class: 'btn-sm', style: 'margin-top:8px' }, 'Enviar avaliação');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const { error } = await sb.from('avaliacoes').insert({
          solicitacao_id: s.id, autor_id: user.id, avaliado_id: s.prestador_id,
          nota: Number(sel.value), comentario: txt.value.trim() || null,
        });
        box.innerHTML = error ? `<p class="aviso erro">${error.message}</p>` : '<p class="meta">✓ Avaliação enviada. Obrigado!</p>';
      });
      box.append(el('label', {}, 'Avalie o atendimento'), sel, txt, btn);
    });
  return box;
}

async function aprovar(orc, solicitacaoId, aprovado) {
  await sb.from('orcamentos').update({ aprovado }).eq('id', orc.id);
  await sb.from('solicitacoes').update({
    status: aprovado ? 'aceita' : 'cancelada',
    valor_final: aprovado ? orc.valor : null,
  }).eq('id', solicitacaoId);
  await carregar();
}

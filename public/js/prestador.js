import { sb } from './supabase.js';
import { $, el, moeda, dataHora, montarNav, exigirLogin, ROTULO_STATUS } from './comum.js';

const raiz = $('#conteudo');
await montarNav('prestador');
const user = await exigirLogin();
if (user) await iniciar();

async function iniciar() {
  const { data: prest } = await sb.from('prestadores').select('*').eq('id', user.id).maybeSingle();
  raiz.innerHTML = '';
  raiz.append(el('h1', {}, 'Painel do prestador'));

  if (!prest) {
    raiz.append(
      el('p', { class: 'sub' }, 'Você ainda não é um prestador. Ative seu cadastro para começar a oferecer serviços.'),
      el('button', { class: 'btn', onclick: virarPrestador }, 'Quero ser prestador')
    );
    return;
  }

  await secaoAssinatura();
  await secaoContato();
  await secaoServicos();
  await secaoSolicitacoes();
}

// ---------- ASSINATURA / MENSALIDADE ----------
async function secaoAssinatura() {
  const { data: a } = await sb.from('assinaturas').select('*').eq('prestador_id', user.id).maybeSingle();
  if (!a) return;
  const emDia = a.status === 'ativa' && new Date(a.ativa_ate) >= new Date(new Date().toDateString());
  const ate = new Date(a.ativa_ate).toLocaleDateString('pt-BR');

  const banner = el('div', { class: `aviso ${emDia ? 'ok' : 'erro'}` },
    emDia
      ? `Assinatura ativa — acesso liberado até ${ate}. Plano: ${moeda(a.valor_mensal)}/mês.`
      : `Assinatura ${a.status === 'cancelada' ? 'cancelada' : 'vencida'} desde ${ate}. Seus serviços estão ocultos no catálogo até a regularização.`
  );
  raiz.append(banner);

  const { data: mens } = await sb.from('mensalidades').select('*').eq('prestador_id', user.id).order('competencia', { ascending: false });
  if (mens?.length) {
    const linhas = mens.map((m) => el('div', { style: 'display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--linha)' }, [
      el('span', {}, `${new Date(m.competencia).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} · vence ${new Date(m.vencimento).toLocaleDateString('pt-BR')}`),
      el('span', {}, `${moeda(m.valor)} `),
      el('span', { class: `status ${m.pago ? 'concluida' : 'orcamento_enviado'}` }, m.pago ? 'Pago' : 'Em aberto'),
    ]));
    raiz.append(el('details', { style: 'margin-bottom:10px' }, [
      el('summary', { style: 'cursor:pointer;color:var(--cinza)' }, 'Ver histórico de mensalidades'),
      el('div', { class: 'cartao', style: 'margin-top:8px' }, linhas),
    ]));
  }
}

async function virarPrestador() {
  await sb.from('prestadores').insert({ id: user.id, ativo: true });
  await iniciar();
}

// ---------- CONTATO ----------
async function secaoContato() {
  const { data } = await sb.from('contatos').select('*').eq('id', user.id).maybeSingle();
  const tel = el('input', { id: 'c-tel', type: 'tel', value: data?.telefone || '', placeholder: '(11) 99999-0000' });
  const zap = el('input', { id: 'c-zap', type: 'tel', value: data?.whatsapp || '', placeholder: 'WhatsApp' });
  const mail = el('input', { id: 'c-mail', type: 'email', value: data?.email_contato || '', placeholder: 'E-mail de contato' });
  const msg = el('div');
  const btn = el('button', { class: 'btn-sm', style: 'margin-top:12px' }, 'Salvar contato');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const { error } = await sb.from('contatos').upsert({
      id: user.id, telefone: tel.value.trim() || null, whatsapp: zap.value.trim() || null,
      email_contato: mail.value.trim() || null, atualizado_em: new Date().toISOString(),
    });
    msg.innerHTML = error ? `<p class="aviso erro">${error.message}</p>` : '<p class="aviso ok">Contato salvo.</p>';
    btn.disabled = false;
  });
  raiz.append(
    el('h2', {}, 'Seu contato'),
    el('p', { class: 'sub' }, 'Fica oculto para o cliente até a solicitação ser aceita.'),
    el('div', { class: 'cartao' }, [
      el('label', {}, 'Telefone'), tel,
      el('label', {}, 'WhatsApp'), zap,
      el('label', {}, 'E-mail de contato'), mail,
      btn, msg,
    ])
  );
}

// ---------- SERVIÇOS ----------
async function secaoServicos() {
  raiz.append(el('h2', {}, 'Seus serviços'));
  const lista = el('div', { id: 'meus-servicos' });
  raiz.append(lista, await formNovoServico());
  await listarServicos(lista);
}

async function listarServicos(lista) {
  const { data } = await sb.from('servicos')
    .select('id, titulo, ativo, tipo_preco, preco, categorias(nome), servico_modalidades(modalidades(nome))')
    .eq('prestador_id', user.id).order('criado_em', { ascending: false });

  lista.innerHTML = '';
  if (!data?.length) { lista.append(el('p', { class: 'sub' }, 'Nenhum serviço cadastrado ainda.')); return; }
  for (const s of data) {
    const preco = s.tipo_preco === 'sob_orcamento' ? 'Sob orçamento' : s.tipo_preco === 'por_hora' ? `${moeda(s.preco)}/h` : moeda(s.preco);
    lista.append(el('div', { class: 'cartao', style: 'margin-bottom:10px' }, [
      el('div', { style: 'display:flex;justify-content:space-between;gap:8px' }, [
        el('div', {}, [
          el('h3', {}, s.titulo),
          el('p', { class: 'meta' }, `${s.categorias?.nome} · ${preco}`),
          el('div', { class: 'chips' }, (s.servico_modalidades || []).map((m) => el('span', { class: 'chip' }, m.modalidades?.nome))),
        ]),
        el('span', { class: 'status ' + (s.ativo ? 'aceita' : '') }, s.ativo ? 'Ativo' : 'Inativo'),
      ]),
      el('div', { class: 'linha-acoes' }, [
        el('button', { class: 'btn-sm sec', onclick: async () => { await sb.from('servicos').update({ ativo: !s.ativo }).eq('id', s.id); await listarServicos(lista); } }, s.ativo ? 'Desativar' : 'Ativar'),
        el('button', { class: 'btn-sm sec', onclick: async () => { if (confirm('Excluir este serviço?')) { await sb.from('servicos').delete().eq('id', s.id); await listarServicos(lista); } } }, 'Excluir'),
      ]),
    ]));
  }
}

async function formNovoServico() {
  const { data: cats } = await sb.from('categorias').select('id, nome').eq('ativo', true).order('nome');
  const selCat = el('select', { id: 'n-cat' }, [el('option', { value: '' }, 'Selecione...'), ...cats.map((c) => el('option', { value: c.id }, c.nome))]);
  const boxMods = el('div', { class: 'chips', id: 'n-mods' });
  const selTipo = el('select', { id: 'n-tipo' }, [
    el('option', { value: 'sob_orcamento' }, 'Sob orçamento'),
    el('option', { value: 'fixo' }, 'Preço fixo'),
    el('option', { value: 'por_hora' }, 'Por hora'),
  ]);
  const inPreco = el('input', { id: 'n-preco', type: 'number', step: '0.01', min: '0', placeholder: 'R$', disabled: true });
  const msg = el('div');

  // Ao escolher a categoria, mostra só as modalidades que ela permite  <<< a inteligência na UI
  selCat.addEventListener('change', async () => {
    boxMods.innerHTML = '';
    if (!selCat.value) return;
    const { data } = await sb.from('categoria_modalidades')
      .select('modalidade_id, modalidades(codigo, nome)').eq('categoria_id', Number(selCat.value));
    for (const m of data || []) {
      const lab = el('label', { style: 'display:flex;align-items:center;gap:6px;font-weight:600;margin:0' }, [
        el('input', { type: 'checkbox', value: m.modalidade_id, style: 'width:auto' }), m.modalidades?.nome,
      ]);
      boxMods.append(lab);
    }
  });
  selTipo.addEventListener('change', () => { inPreco.disabled = selTipo.value === 'sob_orcamento'; if (inPreco.disabled) inPreco.value = ''; });

  const form = el('form', { id: 'form-servico' }, [
    el('h3', { style: 'margin-top:4px' }, 'Novo serviço'),
    msg,
    el('label', {}, 'Título'), el('input', { id: 'n-titulo', required: true, placeholder: 'Ex.: Instalação de chuveiro' }),
    el('label', {}, 'Categoria'), selCat,
    el('label', {}, 'Modalidades oferecidas'), boxMods,
    el('label', {}, 'Tipo de preço'), selTipo,
    el('label', {}, 'Valor'), inPreco,
    el('label', {}, 'Descrição'), el('textarea', { id: 'n-desc', placeholder: 'Detalhe o que está incluso...' }),
    el('button', { class: 'btn', type: 'submit', style: 'margin-top:14px' }, 'Cadastrar serviço'),
  ]);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button'); btn.disabled = true;
    const aviso = (t, tipo) => { msg.innerHTML = ''; msg.append(el('div', { class: `aviso ${tipo}` }, t)); };

    const categoria_id = Number(selCat.value);
    const mods = [...boxMods.querySelectorAll('input:checked')].map((c) => Number(c.value));
    const tipo = selTipo.value;
    const preco = tipo === 'sob_orcamento' ? null : Number(inPreco.value);

    if (!categoria_id) { aviso('Escolha a categoria.', 'erro'); btn.disabled = false; return; }
    if (!mods.length) { aviso('Escolha ao menos uma modalidade.', 'erro'); btn.disabled = false; return; }
    if (tipo !== 'sob_orcamento' && !(preco > 0)) { aviso('Informe o valor.', 'erro'); btn.disabled = false; return; }

    const { data: novo, error } = await sb.from('servicos').insert({
      prestador_id: user.id, categoria_id, titulo: $('#n-titulo').value.trim(),
      descricao: $('#n-desc').value.trim() || null, tipo_preco: tipo, preco,
    }).select('id').single();

    if (error) { aviso(error.message, 'erro'); btn.disabled = false; return; }

    const linhas = mods.map((modalidade_id) => ({ servico_id: novo.id, categoria_id, modalidade_id }));
    const { error: e2 } = await sb.from('servico_modalidades').insert(linhas);
    if (e2) { aviso('Serviço criado, mas falhou ao salvar modalidades: ' + e2.message, 'erro'); btn.disabled = false; return; }

    form.reset(); boxMods.innerHTML = ''; inPreco.disabled = true;
    aviso('Serviço cadastrado!', 'ok');
    await listarServicos($('#meus-servicos'));
    btn.disabled = false;
  });

  return el('div', { class: 'cartao', style: 'margin-top:14px' }, [form]);
}

// ---------- SOLICITAÇÕES RECEBIDAS ----------
async function secaoSolicitacoes() {
  raiz.append(el('h2', {}, 'Solicitações recebidas'));
  const box = el('div', { id: 'recebidas' });
  raiz.append(box);
  await listarRecebidas(box);
}

async function listarRecebidas(box) {
  const { data } = await sb.from('solicitacoes')
    .select(`id, status, descricao, data_agendada, endereco, valor_final, cliente_id,
             servicos(titulo, tipo_preco), modalidades(nome, codigo), perfis:cliente_id(nome)`)
    .eq('prestador_id', user.id).order('criado_em', { ascending: false });

  box.innerHTML = '';
  if (!data?.length) { box.append(el('p', { class: 'sub' }, 'Nenhuma solicitação ainda.')); return; }

  for (const s of data) {
    const fechada = ['aceita', 'em_andamento', 'concluida'].includes(s.status);
    const card = el('div', { class: 'cartao', style: 'margin-bottom:12px' }, [
      el('div', { style: 'display:flex;justify-content:space-between;gap:8px' }, [
        el('div', {}, [
          el('h3', {}, s.servicos?.titulo || 'Serviço'),
          el('p', { class: 'meta' }, `${s.perfis?.nome || 'Cliente'} · ${s.modalidades?.nome || ''}`),
        ]),
        el('span', { class: `status ${s.status}` }, ROTULO_STATUS[s.status] || s.status),
      ]),
      s.data_agendada ? el('p', { class: 'meta' }, `📅 ${dataHora(s.data_agendada)}`) : '',
      s.endereco?.texto ? el('p', { class: 'meta' }, `📍 ${s.endereco.texto}`) : '',
      s.descricao ? el('p', {}, s.descricao) : '',
    ]);

    const acoes = el('div', { class: 'linha-acoes' });
    const mudar = async (status, extra = {}) => { await sb.from('solicitacoes').update({ status, ...extra }).eq('id', s.id); await listarRecebidas(box); };

    if (s.status === 'pendente') {
      if (s.servicos?.tipo_preco === 'sob_orcamento') {
        acoes.append(el('button', { class: 'btn-sm', onclick: () => enviarOrcamento(s, box) }, 'Enviar orçamento'));
      } else {
        acoes.append(el('button', { class: 'btn-sm', onclick: () => mudar('aceita') }, 'Aceitar'));
      }
      acoes.append(el('button', { class: 'btn-sm sec', onclick: () => mudar('recusada') }, 'Recusar'));
    } else if (s.status === 'aceita') {
      acoes.append(el('button', { class: 'btn-sm', onclick: () => mudar('em_andamento') }, 'Iniciar'));
    } else if (s.status === 'em_andamento') {
      acoes.append(el('button', { class: 'btn-sm', onclick: () => mudar('concluida') }, 'Concluir'));
    }
    if (acoes.children.length) card.append(acoes);

    if (fechada) card.append(await blocoContatoCliente(s.cliente_id, s.perfis?.nome));
    box.append(card);
  }
}

async function enviarOrcamento(s, box) {
  const valor = prompt(`Valor do orçamento para "${s.servicos?.titulo}" (R$):`);
  if (valor == null) return;
  const num = Number(valor.replace(',', '.'));
  if (!(num > 0)) { alert('Valor inválido.'); return; }
  const desc = prompt('Descrição do orçamento (opcional):') || null;
  const { error } = await sb.from('orcamentos').insert({ solicitacao_id: s.id, valor: num, descricao: desc });
  if (error) { alert(error.message); return; }
  await sb.from('solicitacoes').update({ status: 'orcamento_enviado' }).eq('id', s.id);
  await listarRecebidas(box);
}

async function blocoContatoCliente(clienteId, nome) {
  const { data } = await sb.from('contatos').select('telefone, whatsapp, email_contato').eq('id', clienteId).maybeSingle();
  const box = el('div', { class: 'contato-box' }, [el('strong', {}, `Contato de ${nome || 'cliente'}`)]);
  if (!data) box.append(el('p', { class: 'meta', style: 'margin:6px 0 0' }, 'O cliente ainda não cadastrou contato.'));
  else {
    if (data.telefone) box.append(el('p', { style: 'margin:6px 0 0' }, `📞 ${data.telefone}`));
    if (data.whatsapp) box.append(el('p', { style: 'margin:2px 0 0' }, `💬 ${data.whatsapp}`));
    if (data.email_contato) box.append(el('p', { style: 'margin:2px 0 0' }, `✉️ ${data.email_contato}`));
  }
  return box;
}

import { sb } from './supabase.js?v=2';
import { $, el, moeda, montarNav, usuarioAtual } from './comum.js?v=2';

const id = Number(new URLSearchParams(location.search).get('id'));
const raiz = $('#conteudo');

await montarNav(null);

if (!id) {
  raiz.innerHTML = '<p class="aviso erro">Serviço não informado.</p>';
} else {
  await carregar();
}

async function carregar() {
  const { data: s, error } = await sb
    .from('servicos')
    .select(`
      id, titulo, descricao, tipo_preco, preco, duracao_min, prestador_id,
      categorias ( nome, icone ),
      prestadores ( nota_media, total_avaliacoes, bio, perfis ( nome, cidade ) ),
      servico_modalidades ( modalidade_id, modalidades ( codigo, nome ) )
    `)
    .eq('id', id)
    .eq('ativo', true)
    .single();

  if (error || !s) { raiz.innerHTML = '<p class="aviso erro">Serviço não encontrado.</p>'; return; }

  const nota = s.prestadores?.total_avaliacoes
    ? `★ ${Number(s.prestadores.nota_media).toFixed(1)} (${s.prestadores.total_avaliacoes} avaliações)`
    : 'Sem avaliações ainda';
  const preco = s.tipo_preco === 'sob_orcamento' ? 'Sob orçamento'
    : s.tipo_preco === 'por_hora' ? `${moeda(s.preco)}/h` : moeda(s.preco);

  raiz.innerHTML = '';
  raiz.append(
    el('a', { href: 'index.html', class: 'sub' }, '← Voltar'),
    el('div', { class: 'chips' }, [el('span', { class: 'chip cat' }, `${s.categorias?.icone || ''} ${s.categorias?.nome || ''}`.trim())]),
    el('h1', {}, s.titulo),
    el('p', { class: 'meta' }, `${s.prestadores?.perfis?.nome || 'Prestador'} · ${s.prestadores?.perfis?.cidade || '—'} · ${nota}`),
    el('p', { class: 'preco', style: 'font-size:20px' }, preco),
    s.descricao ? el('p', {}, s.descricao) : '',
    s.prestadores?.bio ? el('p', { class: 'sub' }, s.prestadores.bio) : '',
    el('div', { class: 'chips' }, (s.servico_modalidades || []).map((m) => el('span', { class: 'chip' }, m.modalidades?.nome))),
    el('hr'),
    el('div', { id: 'area-form' })
  );

  montarFormulario(s);
}

async function montarFormulario(s) {
  const area = $('#area-form');
  const user = await usuarioAtual();

  if (!user) {
    area.append(
      el('p', { class: 'aviso info' }, 'Entre para solicitar este serviço.'),
      el('a', { class: 'btn', href: `login.html?retorno=servico.html?id=${s.id}` }, 'Entrar e solicitar')
    );
    return;
  }
  if (user.id === s.prestador_id) {
    area.append(el('p', { class: 'aviso info' }, 'Este é um serviço seu. Gerencie as solicitações no painel do prestador.'));
    return;
  }

  const mods = s.servico_modalidades || [];
  const selMod = el('select', { id: 'modalidade' },
    mods.map((m) => el('option', { value: m.modalidade_id, 'data-cod': m.modalidades?.codigo }, m.modalidades?.nome)));

  const form = el('form', { id: 'form-solic' }, [
    el('h2', {}, 'Solicitar serviço'),
    el('div', { id: 'msg' }),
    el('label', { for: 'modalidade' }, 'Modalidade de atendimento'),
    selMod,
    el('div', { id: 'box-endereco', hidden: true }, [
      el('label', { for: 'endereco' }, 'Endereço (obrigatório para atendimento a domicílio)'),
      el('input', { id: 'endereco', type: 'text', placeholder: 'Rua, número, bairro, cidade' }),
    ]),
    el('label', { for: 'data' }, 'Data e hora desejadas'),
    el('input', { id: 'data', type: 'datetime-local' }),
    el('label', { for: 'descricao' }, 'Descreva o que você precisa'),
    el('textarea', { id: 'descricao', placeholder: 'Ex.: troca de chuveiro elétrico, 220v...' }),
    el('button', { class: 'btn', type: 'submit', style: 'margin-top:16px' }, 'Enviar solicitação'),
  ]);
  area.append(form);

  const togglEndereco = () => {
    const cod = selMod.selectedOptions[0]?.dataset.cod;
    $('#box-endereco').hidden = cod !== 'domicilio';
  };
  selMod.addEventListener('change', togglEndereco);
  togglEndereco();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    const cod = selMod.selectedOptions[0]?.dataset.cod;
    const endereco = $('#endereco')?.value.trim();

    if (cod === 'domicilio' && !endereco) {
      mostrar('Informe o endereço para atendimento a domicílio.', 'erro');
      btn.disabled = false; return;
    }

    const payload = {
      cliente_id: user.id,
      servico_id: s.id,
      prestador_id: s.prestador_id,
      modalidade_id: Number(selMod.value),
      descricao: $('#descricao').value.trim() || null,
      data_agendada: $('#data').value ? new Date($('#data').value).toISOString() : null,
      endereco: cod === 'domicilio' ? { texto: endereco } : null,
    };

    const { error } = await sb.from('solicitacoes').insert(payload);
    if (error) { mostrar(error.message, 'erro'); btn.disabled = false; return; }
    location.href = 'minhas-solicitacoes.html';
  });

  function mostrar(t, tipo) {
    $('#msg').innerHTML = '';
    $('#msg').append(el('div', { class: `aviso ${tipo}` }, t));
  }
}

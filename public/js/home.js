import { sb } from './supabase.js';
import { $, el, moeda, montarNav } from './comum.js';

// Cada ofício tem sua cor (a assinatura visual). Slug desconhecido usa o acento da marca.
const COR_OFICIO = {
  maquiagem: 'var(--c-maquiagem)',
  eletrica: 'var(--c-eletrica)',
  hidraulica: 'var(--c-hidraulica)',
  motorista: 'var(--c-motorista)',
  aulas: 'var(--c-aulas)',
};
const cor = (slug) => COR_OFICIO[slug] || 'var(--marca)';

let servicos = [];
let categoriaAtiva = null;
let termo = '';

async function carregar() {
  const { data: cats } = await sb.from('categorias').select('*').eq('ativo', true).order('nome');
  montarFiltros(cats || []);

  const { data, error } = await sb
    .from('servicos')
    .select(`
      id, titulo, descricao, tipo_preco, preco,
      categorias ( nome, slug, icone ),
      prestadores ( nota_media, total_avaliacoes, perfis ( nome, cidade ) ),
      servico_modalidades ( modalidades ( codigo, nome ) )
    `)
    .eq('ativo', true)
    .order('criado_em', { ascending: false });

  if (error) { console.error(error); return; }
  servicos = data || [];
  render();
}

function montarFiltros(cats) {
  const box = $('#filtros');
  box.innerHTML = '';
  const chip = (txt, slug, todas = false) =>
    el('button', {
      class: 'oficio' + (todas ? ' todas' : '') + (categoriaAtiva === slug ? ' on' : ''),
      style: `--cat:${slug ? cor(slug) : 'var(--marca)'}`,
      onclick: () => { categoriaAtiva = categoriaAtiva === slug ? null : slug; montarFiltros(cats); render(); },
    }, [el('span', { class: 'ponto' }), txt]);

  box.append(chip('Todas', null, true));
  cats.forEach((c) => box.append(chip(`${c.icone ? c.icone + ' ' : ''}${c.nome}`, c.slug)));
}

function precoTexto(s) {
  if (s.tipo_preco === 'sob_orcamento') return 'Sob orçamento';
  if (s.tipo_preco === 'por_hora') return `${moeda(s.preco)}/h`;
  return moeda(s.preco);
}

function render() {
  const lista = $('#lista');
  lista.innerHTML = '';
  const filtrados = servicos.filter((s) => {
    const okCat = !categoriaAtiva || s.categorias?.slug === categoriaAtiva;
    const alvo = `${s.titulo} ${s.descricao || ''} ${s.prestadores?.perfis?.nome || ''}`.toLowerCase();
    return okCat && (!termo || alvo.includes(termo));
  });

  $('#vazio').hidden = filtrados.length > 0;
  $('#conta').textContent = filtrados.length
    ? `${filtrados.length} ${filtrados.length === 1 ? 'serviço' : 'serviços'}`
    : '';

  for (const s of filtrados) {
    const c = cor(s.categorias?.slug);
    const nota = s.prestadores?.total_avaliacoes
      ? el('span', { class: 'nota' }, `★ ${Number(s.prestadores.nota_media).toFixed(1)} (${s.prestadores.total_avaliacoes})`)
      : el('span', {}, 'Sem avaliações');

    lista.append(
      el('a', { href: `servico.html?id=${s.id}`, class: 'cartao', style: `--cat:${c}` }, [
        el('div', { class: 'chips' }, [
          el('span', { class: 'chip cat' }, [el('span', { class: 'ponto', style: `width:7px;height:7px;border-radius:50%;background:${c};display:inline-block` }), `${s.categorias?.icone ? s.categorias.icone + ' ' : ''}${s.categorias?.nome || ''}`]),
        ]),
        el('h3', {}, s.titulo),
        el('p', { class: 'meta' }, [
          `${s.prestadores?.perfis?.nome || 'Prestador'} · ${s.prestadores?.perfis?.cidade || '—'} · `, nota,
        ]),
        el('div', { class: 'chips' }, (s.servico_modalidades || []).map((m) => el('span', { class: 'chip' }, m.modalidades?.nome))),
        el('p', { class: 'preco' }, precoTexto(s)),
      ])
    );
  }
}

$('#busca').addEventListener('input', (e) => { termo = e.target.value.trim().toLowerCase(); render(); });

await montarNav('home');
await carregar();

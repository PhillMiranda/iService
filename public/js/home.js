import { sb } from './supabase.js';
import { $, el, moeda, montarNav } from './comum.js';
import { lerLocal, salvarLocal, dentroDoLocal, distanciaKm, posicaoAtual } from './localizacao.js';

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
      id, titulo, descricao, tipo_preco, preco, imagem_url,
      categorias ( nome, slug, icone ),
      prestadores ( nota_media, total_avaliacoes, atende_cidade, raio_km, latitude, longitude, perfis ( nome, cidade ) ),
      servico_modalidades ( modalidades ( codigo, nome ) )
    `)
    .eq('ativo', true)
    .order('criado_em', { ascending: false });

  if (error) {
    console.error(error);
    const lista = $('#lista');
    lista.innerHTML = '';
    $('#vazio').hidden = true;
    $('#conta').textContent = '';
    lista.append(el('div', { class: 'aviso erro', style: 'grid-column:1/-1' },
      `Não foi possível carregar os serviços: ${error.message || error.hint || 'erro desconhecido'}`));
    return;
  }
  servicos = data || [];
  preencherCidades();
  wireModal();
  atualizarBarra();
  if (!lerLocal().escolhido) abrirModal();   // primeira visita: pergunta o local
  render();
}

// Preenche as cidades no modal (vêm dos prestadores ativos no catálogo).
function preencherCidades() {
  const sel = $('#m-cidade');
  if (!sel) return;
  const cidades = [...new Set(servicos.map((s) => s.prestadores?.atende_cidade).filter(Boolean))].sort();
  const salvo = lerLocal().cidade || '';
  sel.innerHTML = '';
  sel.append(el('option', { value: '' }, 'Selecione uma cidade'));
  cidades.forEach((c) => sel.append(el('option', { value: c }, c)));
  if (cidades.includes(salvo)) sel.value = salvo;
}

function textoLocal() {
  const l = lerLocal();
  if (l.lat != null) return 'Perto de você';
  if (l.cidade) return l.cidade;
  return 'Todas as cidades';
}
function atualizarBarra() {
  const alvo = $('#local-atual');
  if (alvo) alvo.textContent = textoLocal();
}
function abrirModal() { const m = $('#modal-local'); if (m) m.hidden = false; }
function fecharModal() { const m = $('#modal-local'); if (m) m.hidden = true; }

function wireModal() {
  const aplicar = () => { atualizarBarra(); fecharModal(); render(); };
  const bar = $('#barra-local'); if (bar) bar.onclick = abrirModal;
  const modal = $('#modal-local'); if (modal) modal.onclick = (e) => { if (e.target === modal) fecharModal(); };

  const gps = $('#m-gps');
  if (gps) gps.onclick = async () => {
    gps.disabled = true; gps.textContent = 'Localizando...';
    const pos = await posicaoAtual();
    gps.disabled = false; gps.textContent = 'Usar minha localização';
    if (!pos) { alert('Não foi possível acessar sua localização. Verifique a permissão do navegador.'); return; }
    salvarLocal({ escolhido: true, lat: pos.lat, lng: pos.lng });
    aplicar();
  };

  const conf = $('#m-confirmar');
  if (conf) conf.onclick = () => {
    const c = $('#m-cidade').value;
    if (!c) { alert('Escolha uma cidade ou use a sua localização.'); return; }
    salvarLocal({ escolhido: true, cidade: c });
    aplicar();
  };

  const todas = $('#m-todas');
  if (todas) todas.onclick = () => { salvarLocal({ escolhido: true }); aplicar(); };
}

function distServico(s, local) {
  const p = s.prestadores || {};
  if (local?.lat == null || p.latitude == null) return null;
  return distanciaKm(local, { lat: Number(p.latitude), lng: Number(p.longitude) });
}

function metaTexto(s) {
  const nome = s.prestadores?.perfis?.nome || 'Prestador';
  const cidade = s.prestadores?.perfis?.cidade || '—';
  const d = distServico(s, lerLocal());
  const dist = d != null ? ` · a ${d < 10 ? d.toFixed(1).replace('.', ',') : Math.round(d)} km` : '';
  return `${nome} · ${cidade}${dist}`;
}

function montarFiltros(cats) {
  const box = $('#filtros');
  box.innerHTML = '';
  const tile = (icone, rotulo, slug, todas = false) =>
    el('button', {
      class: 'oficio' + (todas ? ' todas' : '') + (categoriaAtiva === slug ? ' on' : ''),
      style: `--cat:${slug ? cor(slug) : 'var(--marca)'}`,
      onclick: () => { categoriaAtiva = categoriaAtiva === slug ? null : slug; montarFiltros(cats); render(); },
    }, [el('span', { class: 'circulo' }, icone), el('span', { class: 'rotulo' }, rotulo)]);

  box.append(tile('✦', 'Todas', null, true));
  cats.forEach((c) => box.append(tile(c.icone || '•', c.nome, c.slug)));
}

function precoTexto(s) {
  if (s.tipo_preco === 'sob_orcamento') return 'Sob orçamento';
  if (s.tipo_preco === 'por_hora') return `${moeda(s.preco)}/h`;
  return moeda(s.preco);
}

function render() {
  const lista = $('#lista');
  lista.innerHTML = '';
  const local = lerLocal();
  let filtrados = servicos.filter((s) => {
    const okCat = !categoriaAtiva || s.categorias?.slug === categoriaAtiva;
    const alvo = `${s.titulo} ${s.descricao || ''} ${s.prestadores?.perfis?.nome || ''}`.toLowerCase();
    return okCat && (!termo || alvo.includes(termo)) && dentroDoLocal(s, local);
  });
  // Modo B: ordena pelos mais próximos (quem tem distância primeiro)
  if (local.lat != null) {
    filtrados = filtrados
      .map((s) => [s, distServico(s, local)])
      .sort((a, b) => (a[1] ?? Infinity) - (b[1] ?? Infinity))
      .map((x) => x[0]);
  }

  $('#vazio').hidden = filtrados.length > 0;
  $('#conta').textContent = filtrados.length
    ? `${filtrados.length} ${filtrados.length === 1 ? 'serviço' : 'serviços'}`
    : '';

  for (const s of filtrados) {
    const c = cor(s.categorias?.slug);
    const icone = s.categorias?.icone || '•';

    // Banner: imagem do serviço, ou gradiente da categoria com o ícone
    const banner = el('div', { class: 'banner', style: s.imagem_url ? `--cat:${c};background-image:url("${s.imagem_url}")` : `--cat:${c}` },
      [el('span', { class: 'selo' }, [el('span', { class: 'ponto' }), s.categorias?.nome || '']),
       ...(s.imagem_url ? [] : [document.createTextNode(icone)]),
       ...(s.prestadores?.total_avaliacoes ? [el('span', { class: 'nota-selo' }, `★ ${Number(s.prestadores.nota_media).toFixed(1)}`)] : [])]);

    const corpo = el('div', { class: 'corpo' }, [
      el('h3', {}, s.titulo),
      el('p', { class: 'meta' }, metaTexto(s)),
      el('div', { class: 'chips' }, (s.servico_modalidades || []).map((m) => el('span', { class: 'chip' }, m.modalidades?.nome))),
      el('div', { class: 'rodape' }, [
        el('span', { class: 'preco' }, precoTexto(s)),
        el('span', { class: 'conta' },
          s.prestadores?.total_avaliacoes ? `${s.prestadores.total_avaliacoes} avaliações` : 'Novo'),
      ]),
    ]);

    lista.append(el('a', { href: `servico.html?id=${s.id}`, class: 'cartao', style: `--cat:${c}` }, [banner, corpo]));
  }
}

$('#busca').addEventListener('input', (e) => { termo = e.target.value.trim().toLowerCase(); render(); });

try { await montarNav('home'); } catch (e) { console.error(e); }
try { await carregar(); } catch (e) { console.error(e); }

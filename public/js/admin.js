import { sb } from './supabase.js';
import { $, el, moeda, montarNav, exigirLogin } from './comum.js';

const raiz = $('#conteudo');
await montarNav('admin');
const user = await exigirLogin();
if (user) await iniciar();

async function iniciar() {
  const { data: admin } = await sb.rpc('eh_admin');
  raiz.innerHTML = '';
  raiz.append(el('h1', {}, 'Administração'));

  if (!admin) {
    raiz.append(el('p', { class: 'aviso erro' }, 'Acesso restrito. Esta área é só para administradores.'));
    return;
  }
  raiz.append(el('p', { class: 'sub' }, 'Controle de mensalidades e acesso dos prestadores.'));
  await carregar();
}

async function carregar() {
  // assinaturas + nome do prestador
  const { data: assinaturas, error } = await sb
    .from('assinaturas')
    .select('*, prestadores ( perfis ( nome, cidade ) )')
    .order('ativa_ate', { ascending: true });
  if (error) { raiz.append(el('p', { class: 'aviso erro' }, error.message)); return; }

  const { data: mensalidades } = await sb.from('mensalidades').select('*').order('competencia', { ascending: false });
  const porPrest = {};
  for (const m of mensalidades || []) (porPrest[m.prestador_id] ??= []).push(m);

  const antigo = $('#lista'); if (antigo) antigo.remove();
  const lista = el('div', { id: 'lista' });
  raiz.append(lista);

  if (!assinaturas?.length) { lista.append(el('p', { class: 'sub' }, 'Nenhum prestador ainda.')); return; }

  const hoje = new Date(new Date().toDateString());
  for (const a of assinaturas) {
    const emDia = a.status === 'ativa' && new Date(a.ativa_ate) >= hoje;
    const nome = a.prestadores?.perfis?.nome || a.prestador_id.slice(0, 8);
    const ate = new Date(a.ativa_ate).toLocaleDateString('pt-BR');

    const card = el('div', { class: 'cartao', style: 'margin-bottom:14px' }, [
      el('div', { style: 'display:flex;justify-content:space-between;gap:8px;align-items:start' }, [
        el('div', {}, [
          el('h3', {}, nome),
          el('p', { class: 'meta' }, `${a.prestadores?.perfis?.cidade || '—'} · ${moeda(a.valor_mensal)}/mês · ativo até ${ate}`),
        ]),
        el('span', { class: `status ${emDia ? 'aceita' : 'recusada'}` }, emDia ? 'Em dia' : (a.status === 'cancelada' ? 'Cancelada' : 'Vencida')),
      ]),
    ]);

    // Mensalidades do prestador
    const mens = porPrest[a.prestador_id] || [];
    if (mens.length) {
      const box = el('div', { style: 'margin-top:10px' });
      for (const m of mens) {
        const linha = el('div', { style: 'display:flex;justify-content:space-between;gap:8px;align-items:center;padding:5px 0;border-bottom:1px solid var(--linha)' }, [
          el('span', {}, `${new Date(m.competencia).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })} · ${moeda(m.valor)} · vence ${new Date(m.vencimento).toLocaleDateString('pt-BR')}`),
          m.pago
            ? el('span', { class: 'status concluida' }, 'Pago')
            : el('button', { class: 'btn-sm', onclick: async (e) => { e.target.disabled = true; await sb.rpc('registrar_pagamento', { p_mensalidade: m.id }); await carregar(); } }, 'Marcar pago'),
        ]);
        box.append(linha);
      }
      card.append(box);
    }

    // Ações
    card.append(el('div', { class: 'linha-acoes' }, [
      el('button', { class: 'btn-sm', onclick: () => gerarCobranca(a) }, 'Gerar cobrança'),
      emDia
        ? el('button', { class: 'btn-sm sec', onclick: () => suspender(a) }, 'Suspender')
        : el('button', { class: 'btn-sm sec', onclick: () => reativar(a) }, 'Reativar 30 dias'),
      el('button', { class: 'btn-sm sec', onclick: () => mudarValor(a) }, 'Alterar valor'),
    ]));

    lista.append(card);
  }
}

async function gerarCobranca(a) {
  const mes = prompt('Competência (AAAA-MM):', new Date().toISOString().slice(0, 7));
  if (!mes) return;
  const comp = `${mes}-01`;
  const valor = Number((prompt('Valor (R$):', String(a.valor_mensal)) || '').replace(',', '.'));
  if (!(valor >= 0)) { alert('Valor inválido.'); return; }
  const venc = prompt('Vencimento (AAAA-MM-DD):', `${mes}-10`);
  if (!venc) return;
  const { error } = await sb.rpc('gerar_mensalidade', { p_prestador: a.prestador_id, p_competencia: comp, p_valor: valor, p_vencimento: venc });
  if (error) { alert(error.message); return; }
  await carregar();
}

async function suspender(a) {
  if (!confirm('Suspender o acesso deste prestador agora?')) return;
  await sb.from('assinaturas').update({ status: 'inadimplente', ativa_ate: new Date(Date.now() - 86400000).toISOString().slice(0, 10), atualizado_em: new Date().toISOString() }).eq('prestador_id', a.prestador_id);
  await carregar();
}

async function reativar(a) {
  const ate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  await sb.from('assinaturas').update({ status: 'ativa', ativa_ate: ate, atualizado_em: new Date().toISOString() }).eq('prestador_id', a.prestador_id);
  await carregar();
}

async function mudarValor(a) {
  const valor = Number((prompt('Novo valor mensal (R$):', String(a.valor_mensal)) || '').replace(',', '.'));
  if (!(valor >= 0)) { alert('Valor inválido.'); return; }
  await sb.from('assinaturas').update({ valor_mensal: valor, atualizado_em: new Date().toISOString() }).eq('prestador_id', a.prestador_id);
  await carregar();
}

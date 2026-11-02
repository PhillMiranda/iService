import { sb } from './supabase.js';

// Atalhos de DOM
export const $  = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function el(tag, props = {}, filhos = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v != null) n.setAttribute(k, v);
  }
  for (const f of [].concat(filhos)) n.append(f?.nodeType ? f : document.createTextNode(f ?? ''));
  return n;
}

export const moeda = (v) =>
  v == null ? '' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const dataHora = (iso) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';

export const ROTULO_STATUS = {
  pendente: 'Pendente',
  orcamento_enviado: 'Orçamento enviado',
  aceita: 'Aceita',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
  recusada: 'Recusada',
};

// Usuário logado (ou null)
export async function usuarioAtual() {
  const { data } = await sb.auth.getUser();
  return data?.user ?? null;
}

// Garante que exista uma linha em "perfis" para o usuário logado
export async function garantirPerfil(user, nome) {
  if (!user) return;
  await sb.from('perfis').upsert(
    { id: user.id, nome: nome || user.email.split('@')[0] },
    { onConflict: 'id', ignoreDuplicates: true }
  );
}

// Redireciona para login se não houver sessão
export async function exigirLogin() {
  const user = await usuarioAtual();
  if (!user) {
    location.href = `login.html?retorno=${encodeURIComponent(location.pathname.split('/').pop() + location.search)}`;
    return null;
  }
  return user;
}

// Monta a barra de navegação em qualquer página
export async function montarNav(ativa) {
  const user = await usuarioAtual();
  let admin = false;
  if (user) { try { const { data } = await sb.rpc('eh_admin'); admin = !!data; } catch { /* ignora */ } }

  const links = [el('a', { href: 'index.html', class: ativa === 'home' ? 'on' : '' }, 'Serviços')];
  if (user) {
    links.push(el('a', { href: 'minhas-solicitacoes.html', class: ativa === 'cliente' ? 'on' : '' }, 'Minhas solicitações'));
    links.push(el('a', { href: 'prestador.html', class: ativa === 'prestador' ? 'on' : '' }, 'Sou prestador'));
    if (admin) links.push(el('a', { href: 'admin.html', class: ativa === 'admin' ? 'on' : '' }, 'Admin'));
    links.push(el('a', { href: 'guia-cliente.html', class: ativa === 'ajuda' ? 'on' : '' }, 'Ajuda'));
    links.push(el('a', { href: '#', onclick: async (e) => { e.preventDefault(); await sb.auth.signOut(); location.href = 'index.html'; } }, 'Sair'));
  } else {
    links.push(el('a', { href: 'guia-cliente.html' }, 'Ajuda'));
    links.push(el('a', { href: 'login.html', class: 'btn-sm' }, 'Entrar'));
  }

  const nav = el('nav', { class: 'nav' }, [
    el('a', { href: 'index.html', class: 'marca' }, 'iService'),
    el('div', { class: 'links' }, links),
  ]);
  document.body.prepend(nav);
}

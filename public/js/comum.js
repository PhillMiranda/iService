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

// Usuário logado (ou null). Nunca lança: falha de rede/sessão vira "deslogado".
export async function usuarioAtual() {
  try {
    const { data } = await sb.auth.getUser();
    return data?.user ?? null;
  } catch {
    return null;
  }
}

// Garante que exista uma linha em "perfis" para o usuário logado.
// O CPF vem do metadado do Auth (preenchido no cadastro), então é guardado
// no perfil mesmo em logins posteriores.
export async function garantirPerfil(user, nome) {
  if (!user) return;
  const linha = { id: user.id, nome: nome || user.user_metadata?.nome || user.email.split('@')[0] };
  const cpf = user.user_metadata?.cpf;
  if (cpf) linha.cpf = String(cpf).replace(/\D/g, '');
  await sb.from('perfis').upsert(linha, { onConflict: 'id', ignoreDuplicates: true });
}

// Validação de CPF (dígitos verificadores). Aceita com ou sem máscara.
export function validaCPF(valor) {
  const c = String(valor || '').replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (base, pesoInicial) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(c.slice(0, 9), 10) === Number(c[9]) && dv(c.slice(0, 10), 11) === Number(c[10]);
}

export const formataCPF = (v) =>
  String(v || '').replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');

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
  try { document.body.prepend(nav); } catch { /* ignora */ }
}

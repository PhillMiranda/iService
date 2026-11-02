import { sb } from './supabase.js';
import { $, el, garantirPerfil } from './comum.js';

let modo = 'entrar'; // ou 'cadastrar'
const params = new URLSearchParams(location.search);
const retorno = params.get('retorno') || 'index.html';

// Se já estiver logado, vai direto
const { data: { user } } = await sb.auth.getUser();
if (user) location.href = retorno;

function msg(texto, tipo = 'erro') {
  $('#msg').innerHTML = '';
  if (texto) $('#msg').append(el('div', { class: `aviso ${tipo}` }, texto));
}

function aplicarModo() {
  const cadastrar = modo === 'cadastrar';
  $('#titulo').textContent = cadastrar ? 'Criar conta' : 'Entrar';
  $('#subtitulo').textContent = cadastrar
    ? 'Leva menos de um minuto.'
    : 'Acesse sua conta para solicitar ou oferecer serviços.';
  $('#campo-nome').hidden = !cadastrar;
  $('#nome').required = cadastrar;
  $('#enviar').textContent = cadastrar ? 'Criar conta' : 'Entrar';
  $('#alternar-texto').textContent = cadastrar ? 'Já tem conta?' : 'Ainda não tem conta?';
  $('#alternar').textContent = cadastrar ? 'Entrar' : 'Criar conta';
  $('#senha').autocomplete = cadastrar ? 'new-password' : 'current-password';
  msg('');
}

$('#alternar').addEventListener('click', (e) => {
  e.preventDefault();
  modo = modo === 'entrar' ? 'cadastrar' : 'entrar';
  aplicarModo();
});

$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#email').value.trim();
  const senha = $('#senha').value;
  const nome = $('#nome').value.trim();
  $('#enviar').disabled = true;

  try {
    if (modo === 'cadastrar') {
      const { data, error } = await sb.auth.signUp({ email, password: senha });
      if (error) throw error;
      if (data.session) {
        await garantirPerfil(data.user, nome);
        location.href = retorno;
      } else {
        // Confirmação de e-mail ativada no projeto
        msg('Conta criada! Confirme o e-mail que enviamos e depois faça login.', 'ok');
        modo = 'entrar';
        aplicarModo();
      }
    } else {
      const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) throw error;
      await garantirPerfil(data.user, nome);
      location.href = retorno;
    }
  } catch (err) {
    msg(traduzErro(err.message));
  } finally {
    $('#enviar').disabled = false;
  }
});

function traduzErro(m = '') {
  if (/Invalid login/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/already registered/i.test(m)) return 'Esse e-mail já tem conta. Tente entrar.';
  if (/at least 6/i.test(m)) return 'A senha precisa ter ao menos 6 caracteres.';
  return m;
}

aplicarModo();

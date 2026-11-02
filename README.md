# iService

Marketplace de serviços sob demanda — a ideia do iFood, mas para prestadores de serviço
(eletricista, maquiadora, bombeiro hidráulico, professor particular e qualquer outro).

Cliente encontra um profissional, escolhe a **modalidade de atendimento** (a domicílio,
no local do prestador ou on-line), solicita, negocia orçamento e avalia. O **contato só é
revelado às partes depois que a solicitação é fechada**.

## Stack

- **Banco/Auth/API:** Supabase (PostgreSQL + Row Level Security)
- **Hospedagem:** Vercel (site estático)
- **Front-end:** HTML + CSS + JavaScript puro (sem frameworks), via ESM

## A "inteligência" de modalidade

Cada **categoria** define quais modalidades são permitidas (motorista só a domicílio;
aula pode ser a domicílio, no local ou on-line). Cada **serviço** só pode oferecer uma
modalidade dentro do que a categoria libera — e isso é garantido por **chaves estrangeiras
no banco**, não por código. Uma combinação inválida é recusada no `insert`, mesmo que o
front-end tenha bug.

```
categorias ──< categoria_modalidades >── modalidades
                      ▲
                      │ (FK composta garante o subconjunto)
servicos  ──< servico_modalidades >──────┘
```

## Como rodar

### 1. Banco (Supabase)
1. Crie um projeto em https://supabase.com
2. No **SQL Editor**, cole e rode `supabase/migrations/001_schema.sql`
3. Em **Settings → API → Exposed schemas**, adicione `iservice`
4. (Opcional, para testar rápido) **Authentication → Providers → Email**: desligue
   "Confirm email" enquanto estiver testando

### 2. Front-end
1. Edite `public/js/config.js` com a URL do projeto e a chave **anon** (em Settings → API)
2. Suba a pasta `public/` em qualquer host estático. Na Vercel:
   ```
   vercel        # ou conecte o repositório pelo painel
   ```
3. Localmente, sirva a pasta (os módulos ESM precisam de http, não `file://`):
   ```
   npx serve public
   ```

## Estrutura

```
supabase/migrations/001_schema.sql   schema iservice + RLS + seed de categorias
public/
  index.html / js/home.js            catálogo + busca + filtro por categoria
  login.html / js/login.js           cadastro e login (e-mail + senha)
  servico.html / js/servico.js       detalhe + solicitar (modalidade, agendamento, endereço)
  minhas-solicitacoes.html / .js     cliente acompanha, aprova orçamento, avalia, vê contato
  prestador.html / js/prestador.js   vira prestador, cadastra contato e serviços, gere pedidos
  js/supabase.js  js/comum.js         cliente Supabase e helpers
  css/estilo.css
```

## Fluxo de uma solicitação

`pendente → (orcamento_enviado →) aceita → em_andamento → concluida`
(ou `cancelada` / `recusada`). O contato das partes aparece a partir de **aceita**.

## Próximos passos sugeridos

- Geolocalização e raio de atendimento (hoje há os campos `atende_cidade` / `raio_km`)
- Pagamento no app
- Notificações em tempo real (Supabase Realtime) quando o status muda
- Verificação de prestador (documento) para o selo `verificado`

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
2. No **SQL Editor**, rode as migrations na ordem:
   - `supabase/migrations/001_schema.sql` (schema, RLS, catálogo)
   - `supabase/migrations/002_assinaturas.sql` (mensalidade e controle de acesso)
3. Em **Settings → API → Exposed schemas**, adicione `iservice`
4. (Opcional, para testar rápido) **Authentication → Providers → Email**: desligue
   "Confirm email" enquanto estiver testando
5. **Torne-se admin:** crie sua conta pelo app, depois rode no SQL Editor
   `insert into iservice.admins (id) values ('SEU-UUID');`
   (o UUID está em Authentication → Users, ou `select id, email from auth.users;`)

### 2. Front-end (Vercel)
As credenciais vêm de **variáveis de ambiente**. O build (`scripts/build.mjs`) copia
`public/` para `dist/`, gera `dist/js/config.js` e **carimba uma versão única** em cada
referência de JS/CSS (cache busting automático — o cliente nunca fica preso numa versão
velha em cache).

1. Conecte o repositório na Vercel (ela lê o `vercel.json` automaticamente).
2. Em **Settings → Environment Variables**, crie (em todos os ambientes):
   - `SUPABASE_URL` — a Project URL (Settings → API)
   - `SUPABASE_ANON_KEY` — a chave **anon** / public
   (a chave `anon` é pública, protegida pelo RLS. **Nunca** use a `service_role` aqui.)
3. Faça o deploy. O build publica a pasta `dist/`.

### Rodando localmente
Os módulos ESM precisam de http (não `file://`).
```
# opção A: build completo
export SUPABASE_URL=... SUPABASE_ANON_KEY=... && node scripts/build.mjs && npx serve dist
# opção B: rápido, sem build
cp public/js/config.example.js public/js/config.js   # preencha os dois valores
npx serve public
```

## Estrutura

```
supabase/migrations/
  001_schema.sql                     schema iservice + RLS + seed de categorias
  002_assinaturas.sql                mensalidade, admin e gate de acesso do prestador
public/
  index.html / js/home.js            catálogo + busca + filtro por categoria
  login.html / js/login.js           cadastro e login (e-mail + senha)
  servico.html / js/servico.js       detalhe + solicitar (modalidade, agendamento, endereço)
  minhas-solicitacoes.html / .js     cliente acompanha, aprova orçamento, avalia, vê contato
  prestador.html / js/prestador.js   vira prestador, status da assinatura, serviços, pedidos
  admin.html / js/admin.js           painel do admin: mensalidades e acesso dos prestadores
  guia-cliente.html / guia-prestador.html   guias de uso (ajuda)
  js/supabase.js  js/comum.js         cliente Supabase e helpers
  css/estilo.css
```

## Mensalidade e controle de acesso

Cada prestador tem uma **assinatura** (`assinaturas`) com um status e uma data `ativa_ate`.
Ele está **em dia** enquanto `status = 'ativa'` e `ativa_ate >= hoje` — e só nesse caso seus
serviços aparecem no catálogo (a regra vive na policy de leitura de `servicos`, via a função
`prestador_em_dia`). Ao vencer sem pagamento, os serviços **somem sozinhos**; o cadastro
permanece salvo.

O controle é seu, pela página **Admin** (visível só para quem está em `iservice.admins`):

- **Gerar cobrança** de um mês (`mensalidades`)
- **Marcar como pago** — estende o acesso automaticamente até o mês seguinte
- **Suspender** / **Reativar 30 dias** / **Alterar valor**

Novos prestadores ganham **7 dias de teste** ao ativar o cadastro.

## Fluxo de uma solicitação

`pendente → (orcamento_enviado →) aceita → em_andamento → concluida`
(ou `cancelada` / `recusada`). O contato das partes aparece a partir de **aceita**.

## Próximos passos sugeridos

- Geolocalização e raio de atendimento (hoje há os campos `atende_cidade` / `raio_km`)
- Pagamento no app
- Notificações em tempo real (Supabase Realtime) quando o status muda
- Verificação de prestador (documento) para o selo `verificado`

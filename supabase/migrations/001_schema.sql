-- =====================================================================
-- iService — marketplace de serviços sob demanda
-- Banco: PostgreSQL (Supabase)
-- Convenção: tudo isolado no schema "iservice"; nomes em português.
--
-- Inteligência de modalidade:
--   categorias            -> quais modalidades a categoria PERMITE
--   servico_modalidades   -> quais o prestador OFERECE (subconjunto do permitido)
-- A regra é garantida por chaves estrangeiras, não por código de app.
--
-- Contato (telefone) fica em tabela à parte e só é revelado às partes
-- depois que a solicitação é FECHADA (status 'aceita' em diante).
-- =====================================================================

create schema if not exists iservice;

-- =====================================================================
-- TIPOS
-- =====================================================================
do $$ begin
  create type iservice.tipo_preco as enum ('fixo', 'por_hora', 'sob_orcamento');
exception when duplicate_object then null; end $$;

do $$ begin
  create type iservice.status_solicitacao as enum (
    'pendente',            -- cliente abriu, aguardando o prestador
    'orcamento_enviado',   -- prestador respondeu com um orçamento
    'aceita',              -- preço fixo aceito ou orçamento aprovado (= FECHADA)
    'em_andamento',        -- serviço em execução
    'concluida',
    'cancelada',           -- cancelada pelo cliente
    'recusada'             -- recusada pelo prestador
  );
exception when duplicate_object then null; end $$;

-- =====================================================================
-- CATÁLOGO: modalidades e categorias
-- =====================================================================
create table iservice.modalidades (
  id          smallint generated always as identity primary key,
  codigo      text not null unique,           -- domicilio | local_proprio | online
  nome        text not null,
  descricao   text,
  ativo       boolean not null default true
);

insert into iservice.modalidades (codigo, nome, descricao) values
  ('domicilio',     'A domicílio',   'O prestador vai até o endereço do cliente'),
  ('local_proprio', 'Local próprio', 'O cliente vai até o estabelecimento/estúdio do prestador'),
  ('online',        'On-line',       'Atendimento remoto, sem deslocamento');

create table iservice.categorias (
  id          smallint generated always as identity primary key,
  slug        text not null unique,
  nome        text not null,
  descricao   text,
  icone       text,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- Modalidades PERMITIDAS por categoria (o "o que pode")
create table iservice.categoria_modalidades (
  categoria_id   smallint not null references iservice.categorias(id) on delete cascade,
  modalidade_id  smallint not null references iservice.modalidades(id),
  primary key (categoria_id, modalidade_id)
);

-- Seed demonstrando a inteligência
with cat as (
  insert into iservice.categorias (slug, nome, descricao, icone) values
    ('maquiagem',  'Maquiagem',             'Maquiagem social, noivas, eventos', '💄'),
    ('eletrica',   'Eletricista',           'Instalações e reparos elétricos',   '🔌'),
    ('hidraulica', 'Bombeiro hidráulico',   'Instalações e reparos hidráulicos', '🔧'),
    ('motorista',  'Motorista profissional','Transporte e motorista particular', '🚗'),
    ('aulas',      'Aula particular',       'Reforço escolar e aulas diversas',  '📚')
  returning id, slug
),
m as (select id, codigo from iservice.modalidades)
insert into iservice.categoria_modalidades (categoria_id, modalidade_id)
select cat.id, m.id
from cat join m on (
      (cat.slug = 'maquiagem'  and m.codigo in ('domicilio','local_proprio'))
   or (cat.slug = 'eletrica'   and m.codigo in ('domicilio'))
   or (cat.slug = 'hidraulica' and m.codigo in ('domicilio'))
   or (cat.slug = 'motorista'  and m.codigo in ('domicilio'))                        -- só a domicílio
   or (cat.slug = 'aulas'      and m.codigo in ('domicilio','local_proprio','online'))
);

-- =====================================================================
-- PESSOAS: perfis, contatos e prestadores
-- =====================================================================

-- Dados públicos de exibição (sem informação de contato)
create table iservice.perfis (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null,
  avatar_url  text,
  cidade      text,
  criado_em   timestamptz not null default now()
);

-- Contato sensível, isolado e revelado só após o fechamento
create table iservice.contatos (
  id            uuid primary key references iservice.perfis(id) on delete cascade,
  telefone      text,
  whatsapp      text,
  email_contato text,
  atualizado_em timestamptz not null default now()
);

create table iservice.prestadores (
  id                uuid primary key references iservice.perfis(id) on delete cascade,
  bio               text,
  verificado        boolean not null default false,
  nota_media        numeric(3,2) not null default 0,
  total_avaliacoes  integer not null default 0,
  atende_cidade     text,
  raio_km           integer,
  ativo             boolean not null default true,
  criado_em         timestamptz not null default now()
);

-- =====================================================================
-- SERVIÇOS oferecidos
-- =====================================================================
create table iservice.servicos (
  id            bigint generated always as identity primary key,
  prestador_id  uuid not null references iservice.prestadores(id) on delete cascade,
  categoria_id  smallint not null references iservice.categorias(id),
  titulo        text not null,
  descricao     text,
  tipo_preco    iservice.tipo_preco not null default 'sob_orcamento',
  preco         numeric(10,2),
  duracao_min   integer,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  unique (id, categoria_id),                 -- alvo do FK composto abaixo
  constraint preco_coerente check (
       (tipo_preco = 'sob_orcamento' and preco is null)
    or (tipo_preco in ('fixo','por_hora') and preco is not null and preco >= 0)
  )
);

-- Modalidades que o serviço OFERECE. Dois FKs garantem a regra toda:
--   1) a modalidade pertence à categoria do próprio serviço
--   2) a categoria realmente permite essa modalidade  <<< a inteligência
create table iservice.servico_modalidades (
  servico_id     bigint   not null,
  categoria_id   smallint not null,
  modalidade_id  smallint not null,
  primary key (servico_id, modalidade_id),
  foreign key (servico_id, categoria_id)
    references iservice.servicos(id, categoria_id) on delete cascade,
  foreign key (categoria_id, modalidade_id)
    references iservice.categoria_modalidades(categoria_id, modalidade_id)
);

-- =====================================================================
-- SOLICITAÇÕES, ORÇAMENTOS e AVALIAÇÕES
-- =====================================================================
create table iservice.solicitacoes (
  id            bigint generated always as identity primary key,
  cliente_id    uuid not null references iservice.perfis(id),
  servico_id    bigint not null references iservice.servicos(id),
  prestador_id  uuid not null references iservice.prestadores(id),
  modalidade_id smallint not null references iservice.modalidades(id),
  status        iservice.status_solicitacao not null default 'pendente',
  descricao     text,
  data_agendada timestamptz,
  endereco      jsonb,                       -- obrigatório p/ modalidade a domicílio
  valor_final   numeric(10,2),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  foreign key (servico_id, modalidade_id)
    references iservice.servico_modalidades(servico_id, modalidade_id)
);

create table iservice.orcamentos (
  id              bigint generated always as identity primary key,
  solicitacao_id  bigint not null references iservice.solicitacoes(id) on delete cascade,
  valor           numeric(10,2) not null check (valor >= 0),
  descricao       text,
  valido_ate      timestamptz,
  aprovado        boolean,
  criado_em       timestamptz not null default now()
);

create table iservice.avaliacoes (
  id              bigint generated always as identity primary key,
  solicitacao_id  bigint not null references iservice.solicitacoes(id) on delete cascade,
  autor_id        uuid not null references iservice.perfis(id),
  avaliado_id     uuid not null references iservice.perfis(id),
  nota            smallint not null check (nota between 1 and 5),
  comentario      text,
  criado_em       timestamptz not null default now(),
  unique (solicitacao_id, autor_id)
);

-- =====================================================================
-- REGRAS: endereço obrigatório a domicílio + coerência do prestador
-- =====================================================================
create or replace function iservice.valida_solicitacao()
returns trigger language plpgsql as $$
declare
  v_codigo text;
begin
  select codigo into v_codigo from iservice.modalidades where id = new.modalidade_id;

  if v_codigo = 'domicilio'
     and (new.endereco is null or new.endereco = '{}'::jsonb) then
    raise exception 'Endereço é obrigatório para atendimento a domicílio';
  end if;

  if not exists (
    select 1 from iservice.servicos s
    where s.id = new.servico_id and s.prestador_id = new.prestador_id
  ) then
    raise exception 'prestador_id não corresponde ao prestador do serviço';
  end if;

  new.atualizado_em := now();
  return new;
end $$;

create trigger trg_valida_solicitacao
  before insert or update on iservice.solicitacoes
  for each row execute function iservice.valida_solicitacao();

-- Recalcula a nota média do avaliado a cada avaliação
create or replace function iservice.recalcula_nota()
returns trigger language plpgsql as $$
begin
  update iservice.prestadores p
     set nota_media = sub.media, total_avaliacoes = sub.total
    from (
      select avaliado_id, round(avg(nota)::numeric, 2) as media, count(*) as total
      from iservice.avaliacoes where avaliado_id = new.avaliado_id
      group by avaliado_id
    ) sub
   where p.id = sub.avaliado_id;
  return new;
end $$;

create trigger trg_recalcula_nota
  after insert on iservice.avaliacoes
  for each row execute function iservice.recalcula_nota();

-- =====================================================================
-- ÍNDICES
-- =====================================================================
create index idx_servicos_categoria   on iservice.servicos(categoria_id) where ativo;
create index idx_servicos_prestador   on iservice.servicos(prestador_id);
create index idx_solic_cliente        on iservice.solicitacoes(cliente_id);
create index idx_solic_prestador      on iservice.solicitacoes(prestador_id);
create index idx_solic_status         on iservice.solicitacoes(status);
create index idx_avaliacoes_avaliado  on iservice.avaliacoes(avaliado_id);

-- =====================================================================
-- RLS
-- =====================================================================
alter table iservice.modalidades            enable row level security;
alter table iservice.categorias             enable row level security;
alter table iservice.categoria_modalidades  enable row level security;
alter table iservice.perfis                 enable row level security;
alter table iservice.contatos               enable row level security;
alter table iservice.prestadores            enable row level security;
alter table iservice.servicos               enable row level security;
alter table iservice.servico_modalidades    enable row level security;
alter table iservice.solicitacoes           enable row level security;
alter table iservice.orcamentos             enable row level security;
alter table iservice.avaliacoes             enable row level security;

-- Catálogo: leitura pública
create policy "leitura pública" on iservice.modalidades           for select using (true);
create policy "leitura pública" on iservice.categorias            for select using (true);
create policy "leitura pública" on iservice.categoria_modalidades for select using (true);

-- Perfis: públicos (só nome/avatar/cidade) e cada um gerencia o seu
create policy "perfis públicos"  on iservice.perfis for select using (true);
create policy "gerencia perfil"  on iservice.perfis for all
  using (auth.uid() = id) with check (auth.uid() = id);

-- Contatos: o dono sempre; a contraparte só APÓS fechar a solicitação
create policy "gerencia contato próprio" on iservice.contatos
  for all using (id = auth.uid()) with check (id = auth.uid());
create policy "contato liberado após fechar" on iservice.contatos
  for select using (
    exists (
      select 1 from iservice.solicitacoes s
      where s.status in ('aceita','em_andamento','concluida')
        and (
             (s.prestador_id = contatos.id and s.cliente_id   = auth.uid())   -- cliente vê contato do prestador
          or (s.cliente_id   = contatos.id and s.prestador_id = auth.uid())   -- prestador vê contato do cliente
        )
    )
  );

-- Prestadores
create policy "prestadores ativos públicos" on iservice.prestadores
  for select using (ativo or id = auth.uid());
create policy "gerencia próprio prestador" on iservice.prestadores
  for all using (id = auth.uid()) with check (id = auth.uid());

-- Serviços
create policy "serviços ativos públicos" on iservice.servicos
  for select using (ativo or prestador_id = auth.uid());
create policy "prestador gerencia serviços" on iservice.servicos
  for all using (prestador_id = auth.uid()) with check (prestador_id = auth.uid());

-- Modalidades do serviço
create policy "leitura pública" on iservice.servico_modalidades for select using (true);
create policy "dono gerencia modalidades" on iservice.servico_modalidades
  for all using (
    exists (select 1 from iservice.servicos s where s.id = servico_id and s.prestador_id = auth.uid())
  ) with check (
    exists (select 1 from iservice.servicos s where s.id = servico_id and s.prestador_id = auth.uid())
  );

-- Solicitações
create policy "partes veem solicitação" on iservice.solicitacoes
  for select using (cliente_id = auth.uid() or prestador_id = auth.uid());
create policy "cliente cria solicitação" on iservice.solicitacoes
  for insert with check (cliente_id = auth.uid());
create policy "partes atualizam solicitação" on iservice.solicitacoes
  for update using (cliente_id = auth.uid() or prestador_id = auth.uid());

-- Orçamentos
create policy "partes veem orçamento" on iservice.orcamentos
  for select using (
    exists (select 1 from iservice.solicitacoes s
            where s.id = solicitacao_id and (s.cliente_id = auth.uid() or s.prestador_id = auth.uid()))
  );
create policy "prestador cria orçamento" on iservice.orcamentos
  for insert with check (
    exists (select 1 from iservice.solicitacoes s
            where s.id = solicitacao_id and s.prestador_id = auth.uid())
  );
create policy "partes atualizam orçamento" on iservice.orcamentos
  for update using (
    exists (select 1 from iservice.solicitacoes s
            where s.id = solicitacao_id and (s.cliente_id = auth.uid() or s.prestador_id = auth.uid()))
  );

-- Avaliações: leitura pública; autor cria só em solicitação concluída
create policy "leitura pública" on iservice.avaliacoes for select using (true);
create policy "autor cria avaliação" on iservice.avaliacoes
  for insert with check (
    autor_id = auth.uid()
    and exists (
      select 1 from iservice.solicitacoes s
      where s.id = solicitacao_id and s.status = 'concluida'
        and (s.cliente_id = auth.uid() or s.prestador_id = auth.uid())
    )
  );

-- =====================================================================
-- GRANTS (PostgREST usa anon / authenticated)
-- Exponha o schema em: Dashboard -> Settings -> API -> Exposed schemas
-- =====================================================================
grant usage on schema iservice to anon, authenticated;
grant select on all tables in schema iservice to anon, authenticated;
grant insert, update, delete on all tables in schema iservice to authenticated;
grant usage, select on all sequences in schema iservice to authenticated;

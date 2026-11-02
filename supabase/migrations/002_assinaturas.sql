-- =====================================================================
-- iService — controle de mensalidade e acesso do prestador
--
-- Ideia: cada prestador tem uma ASSINATURA com uma data "ativa_ate".
--   - Enquanto ativa_ate >= hoje e status = 'ativa', ele está EM DIA e
--     seus serviços aparecem no catálogo.
--   - Vencendo sem pagamento, os serviços somem automaticamente (regra no
--     banco, via a policy de leitura de "servicos").
-- O controle (registrar pagamento, gerar cobrança, suspender) é feito por
-- ADMIN — você. As ações sensíveis passam por funções que exigem admin.
-- =====================================================================

-- ---------- Administradores ----------
create table iservice.admins (
  id         uuid primary key references iservice.perfis(id) on delete cascade,
  criado_em  timestamptz not null default now()
);

-- ---------- Assinatura (1 por prestador) ----------
create table iservice.assinaturas (
  prestador_id  uuid primary key references iservice.prestadores(id) on delete cascade,
  plano         text not null default 'mensal',
  valor_mensal  numeric(10,2) not null default 49.90,
  status        text not null default 'ativa' check (status in ('ativa','inadimplente','cancelada')),
  ativa_ate     date not null default (current_date + 7),   -- 7 dias de teste ao ativar
  observacao    text,
  atualizado_em timestamptz not null default now()
);

-- ---------- Mensalidades (histórico de cobranças) ----------
create table iservice.mensalidades (
  id            bigint generated always as identity primary key,
  prestador_id  uuid not null references iservice.prestadores(id) on delete cascade,
  competencia   date not null,                 -- 1º dia do mês de referência
  valor         numeric(10,2) not null check (valor >= 0),
  vencimento    date not null,
  pago          boolean not null default false,
  pago_em       timestamptz,
  criado_em     timestamptz not null default now(),
  unique (prestador_id, competencia)
);

create index idx_mensalidades_prestador on iservice.mensalidades(prestador_id);

-- =====================================================================
-- FUNÇÕES
-- =====================================================================

-- Prestador está em dia? (SECURITY DEFINER para poder ser usada na policy
-- pública de "servicos" sem expor a tabela de assinaturas)
create or replace function iservice.prestador_em_dia(p uuid)
returns boolean language sql stable security definer
set search_path = iservice, pg_temp as $$
  select exists (
    select 1 from iservice.assinaturas a
    where a.prestador_id = p and a.status = 'ativa' and a.ativa_ate >= current_date
  );
$$;

-- Usuário atual é admin?
create or replace function iservice.eh_admin()
returns boolean language sql stable security definer
set search_path = iservice, pg_temp as $$
  select exists (select 1 from iservice.admins where id = auth.uid());
$$;

-- Cria a assinatura inicial (com teste) ao virar prestador
create or replace function iservice.cria_assinatura_inicial()
returns trigger language plpgsql security definer
set search_path = iservice, pg_temp as $$
begin
  insert into iservice.assinaturas (prestador_id) values (new.id)
  on conflict (prestador_id) do nothing;
  return new;
end $$;

create trigger trg_cria_assinatura
  after insert on iservice.prestadores
  for each row execute function iservice.cria_assinatura_inicial();

-- Admin gera/atualiza a cobrança de um mês
create or replace function iservice.gerar_mensalidade(
  p_prestador uuid, p_competencia date, p_valor numeric, p_vencimento date)
returns bigint language plpgsql security definer
set search_path = iservice, pg_temp as $$
declare v_id bigint;
begin
  if not iservice.eh_admin() then raise exception 'Apenas administradores'; end if;
  insert into iservice.mensalidades (prestador_id, competencia, valor, vencimento)
  values (p_prestador, date_trunc('month', p_competencia)::date, p_valor, p_vencimento)
  on conflict (prestador_id, competencia)
    do update set valor = excluded.valor, vencimento = excluded.vencimento
  returning id into v_id;
  return v_id;
end $$;

-- Admin registra o pagamento e estende o acesso do prestador
create or replace function iservice.registrar_pagamento(p_mensalidade bigint)
returns void language plpgsql security definer
set search_path = iservice, pg_temp as $$
declare v_prest uuid; v_comp date; v_ate date;
begin
  if not iservice.eh_admin() then raise exception 'Apenas administradores'; end if;

  update iservice.mensalidades
     set pago = true, pago_em = now()
   where id = p_mensalidade
   returning prestador_id, competencia into v_prest, v_comp;
  if v_prest is null then raise exception 'Mensalidade não encontrada'; end if;

  -- estende para o fim do mês de competência (ou mantém, se já for maior)
  select greatest(ativa_ate, (v_comp + interval '1 month')::date)
    into v_ate from iservice.assinaturas where prestador_id = v_prest;

  update iservice.assinaturas
     set ativa_ate = coalesce(v_ate, (v_comp + interval '1 month')::date),
         status = 'ativa', atualizado_em = now()
   where prestador_id = v_prest;
end $$;

-- =====================================================================
-- BACKFILL: assinatura para prestadores já existentes
-- =====================================================================
insert into iservice.assinaturas (prestador_id)
select id from iservice.prestadores
on conflict (prestador_id) do nothing;

-- =====================================================================
-- GATE DE VISIBILIDADE: serviço só aparece se o prestador está em dia
-- =====================================================================
drop policy "serviços ativos públicos" on iservice.servicos;
create policy "serviços ativos públicos" on iservice.servicos
  for select using (
    (ativo and iservice.prestador_em_dia(prestador_id))   -- público só se em dia
    or prestador_id = auth.uid()                          -- o dono sempre vê os seus
  );

-- =====================================================================
-- RLS das novas tabelas
-- =====================================================================
alter table iservice.admins        enable row level security;
alter table iservice.assinaturas   enable row level security;
alter table iservice.mensalidades  enable row level security;

create policy "admin lê admins" on iservice.admins
  for select using (iservice.eh_admin());

create policy "prestador vê sua assinatura" on iservice.assinaturas
  for select using (prestador_id = auth.uid() or iservice.eh_admin());
create policy "admin gerencia assinaturas" on iservice.assinaturas
  for all using (iservice.eh_admin()) with check (iservice.eh_admin());

create policy "prestador vê suas mensalidades" on iservice.mensalidades
  for select using (prestador_id = auth.uid() or iservice.eh_admin());
create policy "admin gerencia mensalidades" on iservice.mensalidades
  for all using (iservice.eh_admin()) with check (iservice.eh_admin());

-- =====================================================================
-- GRANTS
-- =====================================================================
grant select on all tables in schema iservice to anon, authenticated;
grant insert, update, delete on all tables in schema iservice to authenticated;
grant usage, select on all sequences in schema iservice to authenticated;
grant execute on function iservice.prestador_em_dia(uuid) to anon, authenticated;
grant execute on function iservice.eh_admin() to anon, authenticated;
grant execute on function iservice.gerar_mensalidade(uuid, date, numeric, date) to authenticated;
grant execute on function iservice.registrar_pagamento(bigint) to authenticated;

-- =====================================================================
-- TORNE-SE ADMIN  (rode UMA vez, com sua conta já criada no app)
-- Descubra seu id em Authentication > Users, ou rode:
--   select id, email from auth.users;
-- Depois:
--   insert into iservice.admins (id) values ('SEU-UUID-AQUI');
-- =====================================================================

-- =====================================================================
-- SEED DE TESTE — dados fictícios para ver o catálogo cheio.
-- Rode DEPOIS das migrations 001, 002 e 003.
-- Pode rodar de novo: limpa os demos antes (e-mails @demo.iservice).
-- NÃO use em produção.
-- =====================================================================

create extension if not exists pgcrypto;

-- Remove usuários demo (a cascata limpa perfis, prestadores, serviços, etc.)
delete from auth.users where email like '%@demo.iservice';

do $$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  m_dom smallint; m_loc smallint; m_onl smallint;
  reg record;
  srv record;
  uid uuid; sid bigint; cat_id smallint;
  mod_id smallint; cod text;
begin
  select id into m_dom from iservice.modalidades where codigo = 'domicilio';
  select id into m_loc from iservice.modalidades where codigo = 'local_proprio';
  select id into m_onl from iservice.modalidades where codigo = 'online';

  -- ---------- Prestadores ----------
  for reg in
    select * from (values
      ('camila@demo.iservice',  'Camila Rocha',    'São Paulo, SP', 'Maquiadora profissional há 8 anos, especialista em noivas e eventos.', 4.9::numeric, 37, '13434740430'),
      ('jorge@demo.iservice',   'Jorge Mendes',    'Guarulhos, SP', 'Eletricista com registro, atendimento residencial e comercial.',        4.8::numeric, 52, '10000606758'),
      ('paulo@demo.iservice',   'Paulo Henrique',  'São Paulo, SP', 'Bombeiro hidráulico. Caça-vazamento e desentupimento sem quebra-quebra.', 4.7::numeric, 28, '04537736305'),
      ('rafael@demo.iservice',  'Rafael Lima',     'São Paulo, SP', 'Motorista executivo, carro próprio, pontual e discreto.',               5.0::numeric, 12, '68841548290'),
      ('ana@demo.iservice',     'Ana Beatriz',     'Barueri, SP',   'Professora de matemática e inglês, reforço do fundamental ao médio.',     4.9::numeric, 64, '40112761704')
    ) as t(email, nome, cidade, bio, nota, total, cpf)
  loop
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change)
    values (inst, uid, 'authenticated', 'authenticated', reg.email,
      crypt('demo-123456', gen_salt('bf')), now(), now(), now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('nome', reg.nome, 'cpf', reg.cpf),
      false, '', '', '', '');

    insert into iservice.perfis (id, nome, cidade) values (uid, reg.nome, reg.cidade);
    insert into iservice.contatos (id, telefone, whatsapp) values (uid, '(11) 90000-0000', '(11) 90000-0000');
    insert into iservice.prestadores (id, bio, verificado, nota_media, total_avaliacoes, atende_cidade, ativo)
      values (uid, reg.bio, true, reg.nota, reg.total, reg.cidade, true);
    -- o trigger já criou a assinatura (teste de 7 dias); estende para 30 dias
    update iservice.assinaturas set status = 'ativa', ativa_ate = current_date + 30 where prestador_id = uid;
  end loop;

  -- ---------- Serviços ----------
  for srv in
    select * from (values
      ('camila@demo.iservice', 'maquiagem',  'Maquiagem para noivas e madrinhas', 'Prova inclusa. Produtos de alta fixação para o dia todo.', 'sob_orcamento', null::numeric,       array['domicilio','local_proprio']),
      ('camila@demo.iservice', 'maquiagem',  'Maquiagem social',                  'Para festas e eventos. Dura a noite inteira.',             'fixo',          150::numeric,       array['local_proprio']),
      ('jorge@demo.iservice',  'eletrica',   'Reparo elétrico residencial',       'Curto-circuito, disjuntor, tomadas e fiação.',             'por_hora',      90::numeric,        array['domicilio']),
      ('jorge@demo.iservice',  'eletrica',   'Instalação de chuveiro 220v',       'Troca e instalação com segurança e garantia.',             'fixo',          120::numeric,       array['domicilio']),
      ('paulo@demo.iservice',  'hidraulica', 'Caça e conserto de vazamentos',     'Localização sem quebrar parede. Orçamento na hora.',       'sob_orcamento', null::numeric,       array['domicilio']),
      ('rafael@demo.iservice', 'motorista',  'Motorista particular por hora',     'Eventos, aeroporto e agenda do dia. Carro executivo.',     'por_hora',      60::numeric,        array['domicilio']),
      ('ana@demo.iservice',    'aulas',      'Reforço de matemática',             'Fundamental e médio. Presencial ou on-line.',              'por_hora',      70::numeric,        array['domicilio','local_proprio','online']),
      ('ana@demo.iservice',    'aulas',      'Inglês conversação',                'Aulas focadas em fala, do básico ao avançado.',            'por_hora',      80::numeric,        array['online'])
    ) as t(email, slug, titulo, descricao, tipo, preco, mods)
  loop
    select id into uid from iservice.perfis p
      join auth.users u on u.id = p.id where u.email = srv.email;
    select id into cat_id from iservice.categorias where slug = srv.slug;

    insert into iservice.servicos (prestador_id, categoria_id, titulo, descricao, tipo_preco, preco)
      values (uid, cat_id, srv.titulo, srv.descricao, srv.tipo::iservice.tipo_preco, srv.preco)
      returning id into sid;

    foreach cod in array srv.mods loop
      select case cod when 'domicilio' then m_dom when 'local_proprio' then m_loc else m_onl end into mod_id;
      insert into iservice.servico_modalidades (servico_id, categoria_id, modalidade_id)
        values (sid, cat_id, mod_id);
    end loop;
  end loop;
end $$;

-- Conferência rápida
select c.nome as categoria, s.titulo, p.nome as prestador, pr.nota_media
from iservice.servicos s
join iservice.categorias c on c.id = s.categoria_id
join iservice.prestadores pr on pr.id = s.prestador_id
join iservice.perfis p on p.id = pr.id
order by c.nome;

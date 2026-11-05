-- O PostgREST (API do Supabase) embute recursos por chaves estrangeiras DIRETAS.
-- A servico_modalidades só tinha a FK composta para categoria_modalidades, então a
-- API não encontrava o caminho servico_modalidades -> modalidades para montar os
-- chips de modalidade. Este FK direto resolve o embed (e é coerente: modalidade_id
-- sempre referencia modalidades).
alter table iservice.servico_modalidades
  add constraint servico_modalidades_modalidade_fkey
  foreign key (modalidade_id) references iservice.modalidades (id);

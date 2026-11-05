-- Preparação para geolocalização.
--   Opção A (agora):   filtro por cidade de atendimento (prestadores.atende_cidade).
--   Opção B (futuro):  distância real — as colunas de coordenadas já ficam prontas,
--                      e o app usa distância quando elas existirem, senão cai na cidade.
alter table iservice.prestadores
  add column if not exists latitude  numeric(9,6),
  add column if not exists longitude numeric(9,6);

-- Busca por cidade (opção A)
create index if not exists idx_prestadores_cidade
  on iservice.prestadores (atende_cidade) where ativo;

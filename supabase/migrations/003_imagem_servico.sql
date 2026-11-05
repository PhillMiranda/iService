-- Imagem opcional do serviço (banner no cartão). Sem imagem, o app mostra um
-- banner com a cor e o ícone da categoria.
alter table iservice.servicos add column if not exists imagem_url text;

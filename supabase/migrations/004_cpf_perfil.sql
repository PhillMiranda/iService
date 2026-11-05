-- CPF do usuário (cliente/prestador). Guardado só com dígitos.
-- O cadastro envia o CPF no metadado do Auth (raw_user_meta_data.cpf), que também
-- satisfaz o gatilho handle_new_user; aqui guardamos uma cópia no perfil do iService.
alter table iservice.perfis add column if not exists cpf text;

-- Opcional: impedir CPF duplicado no iService (descomente se quiser exigir).
-- create unique index if not exists uq_perfis_cpf on iservice.perfis (cpf) where cpf is not null;

-- Usuários: e-mail (só identificação, o login continua pelo usuário) e acesso por filial.
-- brand_ids = null → acessa todas as filiais; lista → só as filiais da lista (aplicado a Editor e Leitura; Administrador sempre vê todas).
alter table users
  add column email text,
  add column brand_ids uuid[];

create unique index users_email_unique on users (lower(email)) where email is not null;

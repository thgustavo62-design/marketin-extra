-- Fundo transparente nas imagens de produto: guarda a imagem original e se o fundo foi removido.
-- Rollback: alter table product_images drop column original, drop column fundo;
alter table product_images
  add column original bytea,
  -- transparente = fundo removido (original guardada); original = não tinha fundo liso, ficou como veio
  add column fundo text check (fundo is null or fundo in ('transparente', 'original'));

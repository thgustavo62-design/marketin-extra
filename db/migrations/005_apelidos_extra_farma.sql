-- Regras confirmadas pelo dono: "Drogaria Melhor Preço" é a Farma e Farma;
-- qualquer conta com "Extra Farma" no nome é a Minas Farma.
update brands
   set aliases = (select array_agg(distinct a) from unnest(aliases || array['extra farma', 'extrafarma']) as a)
 where slug = 'minas-farma';

update brands
   set aliases = (select array_agg(distinct a) from unnest(aliases || array['melhor preco']) as a)
 where slug = 'farma-e-farma';

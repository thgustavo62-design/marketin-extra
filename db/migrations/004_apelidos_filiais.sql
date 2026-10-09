-- As duas filiais (Minas Farma e Farma e Farma) são reconhecidas nas contas do Windsor pelo nome.
-- "aliases" = trechos que, aparecendo no nome da conta, identificam a filial (sem acento/maiúscula; espaços não importam).
alter table brands add column aliases text[] not null default '{}';

update brands set aliases = array['minas farma', 'minasfarma'] where slug = 'minas-farma';
update brands set aliases = array['farma e farma', 'farmaefarma', 'drogaria melhor preco'] where slug = 'farma-e-farma';

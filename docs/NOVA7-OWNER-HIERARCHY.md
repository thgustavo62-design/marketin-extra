# Base de proprietários, empresas e filiais

## Inspeção e decisões de migração

A base anterior não possui proprietários: `brands` representa as empresas, `branches` as filiais e `users.brand_ids` apenas acesso por empresa. Produtos e parte dos arquivos eram compartilhados, e a conexão PostgreSQL privilegiada não aplicava RLS ao aplicativo.

A nova estrutura reaproveita os IDs: `brands` é renomeada para `companies`, com uma view de compatibilidade `brands` para o código existente. `branches.company_id` corresponde ao vínculo existente `brand_id`. Proprietários, logins vinculados, permissões de funcionários, contrato e limites são entidades explícitas.

Nenhum proprietário é criado pela migração. Minas Farma e Farma e Farma conservam IDs, nomes, filiais e dados. Empresas legadas sem titularidade confirmada têm uma pendência administrativa; não ficam disponíveis a clientes até serem vinculadas por um administrador a um proprietário real, com motivo e auditoria. Novas empresas são recusadas sem proprietário.

Arquivos e produtos antigos sem empresa comprovável ficam preservados e restritos à administração. O sistema não atribui um acervo compartilhado à primeira empresa da lista. A classificação posterior é explícita, não inferida pelo nome da pessoa logada.

## Autorização

Administrador Nova7 é uma permissão de plataforma separada da titularidade. Proprietários recebem administração por `owner_user_links` e pelo `companies.owner_id`; não precisam de cópias de permissões quando cadastram empresas ou filiais novas. Gerentes e funcionários recebem `employee_memberships` explícitas, por empresa ou filial, com permissões de módulos.

A seleção de empresa é somente contexto de navegação e de novas gravações. Não é prova de autorização. O banco valida o token de sessão, titularidade, situação do proprietário, vínculos e filial em cada consulta.

O acesso comum do aplicativo utiliza um papel PostgreSQL sem BYPASSRLS, dentro de transações com contexto local. Login e sessão mantêm um caminho interno estreito para verificar credenciais; dados comerciais usam o papel restrito. Funções auxiliares de autorização ficam em schema privado, sem acesso público e com search_path fixo. Elas retornam decisões de acesso, sem expor registros de outros clientes.

Todos os dados privados, inclusive filhos (fotos, partes de arquivos, itens de campanhas, páginas do Studio), recebem políticas correspondentes ao registro pai. Vínculos entre empresas diferentes são recusados também no banco. Templates universais marcados como plataforma são legíveis pelos clientes e alteráveis apenas pela administração; não carregam automaticamente a identidade de uma farmácia.

## Contratos e limites

O contrato pertence ao proprietário. Limites de empresas, filiais e usuários são cadastrados pela administração; o sistema não contrata, cobra ou atribui um plano fictício. A criação de recursos verifica os limites dentro de uma transação com bloqueio do registro do proprietário, para impedir ultrapassagem por requisições simultâneas.

Mudança de titularidade é uma operação administrativa própria, exige motivo e registra antes/depois. Um proprietário não pode se tornar dono de outra empresa editando uma requisição ou o seletor.

## Implantação

A migração desta etapa é incompatível com o antigo acesso irrestrito e deve acompanhar a versão nova da aplicação. Não deve ser aplicada ao banco compartilhado apenas para levantar uma prévia. Primeiro validar em banco descartável, preparar a versão e revisar o inventário legado; depois executar o corte autorizado com backup e verificação dos IDs/contagens. Nenhuma titularidade real é preenchida pelo script de implantação.

O PR anterior de Windsor/encartes ainda aguarda autorização de publicação. Esta etapa não autoriza automaticamente publicar esse PR ou executar a migração nova em produção.

## Identidade Corta Preço

O renderizador `offer-identity` usa formas vetoriais e textos separados, sem preço incorporado em imagem. Os ajustes são normalizados no tema e nas exceções de cada oferta; a prévia e a exportação usam o mesmo desenho. As descrições e fotografias possuem áreas separadas. A etiqueta considera a caixa após a rotação e reduz sua escala para permanecer dentro da oferta.

A migração 038 cria o catálogo de componentes da empresa e o código oficial dos modelos. O instalador em Layouts e modelos exige a empresa Minas Farma selecionada, titularidade confirmada, permissão administrativa e confirmação textual. Ele resolve o ID real pelo cadastro, cria CP-MF-001 até CP-MF-006 uma única vez e preserva o modelo anterior. Não copia logos para templates globais. Cabeçalho e rodapé institucionais continuam como arquivos privados editáveis do modelo. As referências recebidas orientam o desenho; não são fotografias de produtos.

Sem confirmação explícita da totalidade das variações, a faixa troca “TODAS AS FRAGRÂNCIAS” por “FRAGRÂNCIAS SELECIONADAS”. A atualização de modelo mantém as versões anteriores. Aplicar ajustes do modelo afeta as ofertas que não têm exceções individuais.

## Verificação reproduzível

- `npm test`: regras de domínio, regressões e preços dinâmicos.
- `NOVA7_BUILD_DIR=.next-owners npm run build`: build da aplicação.
- `NOVA7_TEST_MODULES=/caminho/node_modules node e2e/owner-hierarchy-local.mjs`: banco descartável PGlite, todas as migrações, testes de autorização e transferência, sem acesso remoto.
- Adicionar `NOVA7_BROWSER_TEST=1` executa também a interface sobre esse banco. Requer build, Chromium em `/tmp/nova7-chromium/chromium` e certificado local em `/tmp/nova7-test/{key,cert}.pem`, como no harness Studio existente. Dependências opcionais de QA: `@electric-sql/pglite@0.5.10`, `@electric-sql/pglite-socket@0.2.13` e `@sparticuz/chromium`.

O banco compartilhado não recebeu as migrações 037/038. O cadastro dos titulares reais, classificação dos arquivos legados, provisionamento da conexão restrita e cadastro dos componentes oficiais no banco real dependem do corte coordenado; não foram simulados como operações concluídas.

### Resultado desta revisão

Build de produção e 258 testes de domínio aprovados. A suíte de banco executa 58 verificações, incluindo leitura dos bytes de arquivos, isolamento de fotos e campanhas, limites de contrato, revogação após transferência e bloqueio de troca para o papel PostgreSQL privilegiado. A suíte combinada passou em 66 verificações de banco e navegador, incluindo cadastro de proprietário e empresa, confirmação de titularidade e instalação dos seis componentes oficiais no banco descartável; o servidor terminou sem erros. A verificação gráfica validou cinco preços e 25 objetos de texto independentes no caminho SVG/Fabric.

Ainda exige revisão de implantação: titulares reais de Minas Farma/Farma e Farma, classificação do acervo legado sem empresa, arquivos institucionais aprovados do cabeçalho e rodapé, credenciais restritas e migração coordenada do banco real. A faixa permanece conservadora quando não há comprovação de todas as variações. O harness serializa as conexões de teste porque PGlite multiplexa uma única sessão; esse preload não participa da aplicação publicada. As migrações também foram verificadas com um ator CREATEROLE sem SUPERUSER. A validação em PostgreSQL de staging e os advisors do projeto correto continuam necessários antes do corte.

`node e2e/offer-identity-visual.cjs` reproduz a verificação gráfica usando o Chromium local do harness.

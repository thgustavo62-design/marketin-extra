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

- `npm test`: 264 testes de domínio, regressão e proteção do inventário.
- `NOVA7_BUILD_DIR=.next-owners npm run build`: build da aplicação.
- `NOVA7_TEST_DB=postgres node e2e/owner-hierarchy-local.mjs`: 73 verificações em PostgreSQL nativo descartável. Usa a dependência `embedded-postgres` do projeto, sem consumir DATABASE_URL nem conectar a um banco externo. Executar com usuário de sistema não-root.
- Adicionar `NOVA7_TEST_MIGRATION_ROLE=limited` repete as migrations com CREATEROLE sem SUPERUSER.
- `NOVA7_TEST_DB=postgres NOVA7_BROWSER_TEST=1 NOVA7_PROMOTION_TEST=1 NOVA7_TEST_MODULES=/caminho/qa/node_modules node e2e/owner-hierarchy-local.mjs`: fluxo completo com 94 verificações, incluindo planilha, cinco preços, três formatos, PNG, PDF e isolamento entre empresas.
- Para o navegador, fornecer `NOVA7_CHROMIUM_BIN` ou instalar `@sparticuz/chromium@153.0.0` no diretório de QA. O bootstrap extrai fontes/NSS em pasta temporária quando necessário. O certificado de teste é criado automaticamente com OpenSSL. As fontes e as bibliotecas de teste não alteram configurações de produção.
- O modo PGlite anterior permanece disponível por `NOVA7_TEST_MODULES`, com `@electric-sql/pglite@0.5.10` e `@electric-sql/pglite-socket@0.2.13`. Apenas esse adaptador serializa conexões. O modo PostgreSQL utiliza conexões independentes e o login comercial `nova7_runtime` sem BYPASSRLS.

## Inventário antes do corte

`NOVA7_PROJECT_REF=<referência confirmada> node scripts/tenancy-inventory.mjs` usa a conexão interna autorizada de DATABASE_URL em transação READ ONLY com snapshot consistente. Recusa outro projeto, host arbitrário ou conexão local fora da suíte antes de consultar. TLS exige validação de certificado; informar DATABASE_CA quando necessário. O script nunca imprime a credencial, lê senhas, cria titulares ou reclassifica arquivos.

O resultado lista empresas, contagens dos acervos e quantos produtos não possuem uso identificado, possuem uso em uma empresa ou são compartilhados entre empresas. Uso comercial é evidência para revisão, não prova de titularidade. O script foi testado antes e depois da migração em banco descartável, preservando as contagens e detectando o produto compartilhado. Não foi executado no banco real.

## Resultado desta revisão

Build aprovado e 264 testes passaram. As migrations e 73 verificações passaram em PostgreSQL 18.4 nativo, também com ator CREATEROLE sem SUPERUSER. A suíte completa passou em 94 verificações de banco e navegador. Validou cadastro de proprietário/empresa, confirmação administrativa de titularidade, instalação CP-MF-001 a CP-MF-006, importação de planilha com fotos de teste, seleção automática do modelo, preços R$ 0,99 até R$ 1.299,99, Stories/Feed/A4 e exportações PNG/PDF. Os textos e os preços permanecem independentes e editáveis. Nenhum dado de cliente foi utilizado nesses testes.

O teste de legado verifica IDs e nomes das duas empresas, filiais, administrador, produto compartilhado, bytes da foto e preços das campanhas antes/depois da migração, sem criar proprietários. A conferência visual do PNG revelou um recorte incorreto das descrições na conversão SVG/Fabric. O renderizador agora ajusta as linhas antes de desenhar e evita o clip relativo que cortava a primeira linha. A regressão verifica a descrição em cada formato.

O banco compartilhado não recebeu as migrations 037/038. Continuam pendentes os titulares reais, classificação administrativa do acervo, arquivos institucionais aprovados do cabeçalho/rodapé, conexão restrita, backup e corte coordenado. A faixa usa texto conservador quando não há comprovação de todas as variações. Ainda faltam os advisors e o inventário no projeto real autorizado; a integração Supabase disponível apontou outro projeto e não foi usada para ler nem alterar dados do Nova7.

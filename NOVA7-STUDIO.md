# Nova7 Studio

O editor do Canva Clone de Davronov-Alimardon foi adaptado para o login, a biblioteca e os fluxos existentes deste projeto. Não é uma integração com o serviço oficial Canva, nem uma reprodução de todos os recursos comerciais do Canva.

## Entrega

- Identidade Nova7 no login, navegação, metadados e relatórios.
- `/studio/:id` é o editor padrão de designs e promoções.
- Textos, fontes, formas, cores, contornos, transparência, alinhamento, desenho, filtros e camadas; agrupar, bloquear, ocultar, duplicar e atalhos.
- Uploads e biblioteca existentes, modelos da própria plataforma, importação e exportação de JSON, PNG, JPG e SVG com imagens incorporadas.
- Salvamento por campanha, formato e página; histórico de até 60 estados durante a sessão, salvamento automático e proteção contra sobrescrita por outra aba.
- As promoções automáticas passam pelo gerador existente e são convertidas em elementos editáveis por SVG, preservando o acesso a produtos, planilha, temas e geração automática em `?classico=1`.
- Alterar um preço como texto no Studio não altera o catálogo ou a planilha. Mudanças nos dados originais exibem aviso: regenerar a página substitui as edições gráficas daquela página.

## Banco e publicação

Aplique `db/migrations/034_nova7_studio.sql` no mesmo banco que já contém `promo_campaigns`, usando o processo existente (`npm run db:migrate`). Faça backup antes da publicação. A migração cria `studio_pages`, com RLS e acesso apenas pelo servidor autenticado. Ela não foi executada em nenhum banco remoto nesta entrega.

Sem a tabela, o editor informa que aguarda atualização e permite visualizar/exportar, sem salvar. A clonagem de designs e modelos também depende da nova tabela. O editor clássico continua acessível.

O projeto mantém as permissões existentes (admin/editor escrevem, viewer consulta/exporta). A base atual compartilha campanhas: esta alteração não implementa isolamento entre empresas, novos assinantes, cobrança ou chaves Windsor individuais. Essa é uma etapa posterior obrigatória antes de vender acesso a empresas independentes.

## IA opcional

No servidor, configure `REPLICATE_API_TOKEN`, `REPLICATE_GENERATE_VERSION` e/ou `REPLICATE_REMOVE_BG_VERSION`. Use IDs de versão fixos de modelos compatíveis, respectivamente com entrada `prompt` e entrada `image`, e saída URL de imagem. Os painéis deixam claro quando não há configuração. A API exige sessão com escrita, valida origem no POST, registra pedidos no audit log e limita a 10 solicitações por usuário/hora. Somente o autor da solicitação consulta/importa o resultado. Imagens são copiadas para os assets da campanha, com tamanho limitado. O serviço pode cobrar por processamento. Nenhuma chamada paga é necessária para executar os testes.

## Licença e escopo

Consulte `THIRD_PARTY_NOTICES.md` e `licenses/canva-clone-APACHE-2.0.txt`. O editor deriva do código upstream; pagamentos, banco e autenticação do exemplo foram substituídos pelos recursos locais. Não inclui o acervo de elementos do Canva, colaboração em tempo real, vídeo, recursos premium da plataforma oficial ou funcionalidades do PhotoCraft.

## Validação

`npm test`, `npm run typecheck` e `npm run build`. Testes de domínio incluem limites de tamanho, páginas, fontes de imagem, padrões executáveis, profundidade e mudanças na origem. Testes de navegador usam banco local descartável, sem atingir dados ou credenciais de produção.

Validação desta entrega: 220 testes de domínio passaram; TypeScript e build de produção passaram. O harness `e2e/studio-local.mjs` validou 20 fluxos no Chromium contra um banco PGlite local com todas as migrações, incluindo salvamento real, PNG/JPG/SVG, upload, filtros, desenho, conflitos entre abas e bloqueio de escrita para leitores. Nenhum banco remoto foi alterado.

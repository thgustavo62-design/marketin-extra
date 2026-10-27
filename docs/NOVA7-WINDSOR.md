# Windsor.ai em Insights e Resultados

O cabeçalho de `/resultados` e suas abas oferece **Configurar Windsor.ai** para administradores. O mesmo painel aparece em Configurações → Integrações. Usuários editores/leitores veem somente o estado da conexão.

1. Em uma sessão de administrador, abra o painel e cole apenas a chave API fornecida pela sua conta Windsor.ai.
2. Salve e use **Testar conexão**. Salvar a chave não afirma que a conexão foi validada.
3. Conecte as fontes Instagram/Meta Ads na Windsor.ai e use **Associar contas às empresas** para conferir os vínculos existentes.
4. Os Insights, relatórios, coleta e metas passam a usar a chave salva. Os filtros e permissões de empresa continuam nos carregadores de métricas.

A chave é compartilhada por este workspace/instância. Isto não introduz isolamento entre novos assinantes independentes nem chaves por usuário; isso exige o modelo de tenants e suas permissões. As contas das empresas atuais são organizadas pelos vínculos existentes.

## Proteção e implantação

- Migração `035_windsor_credentials.sql`, gerada inicialmente pela CLI Supabase e movida para a sequência de migrações própria deste repositório.
- Segredo cifrado com AES-256-GCM e IV aleatório; tabela com RLS e sem acesso PUBLIC/anon/authenticated/service_role. O servidor acessa via conexão PostgreSQL existente.
- `INTEGRATIONS_ENCRYPTION_KEY`: 32 bytes aleatórios em hexadecimal, somente no ambiente do servidor. Não rotacionar sem recriptografar as credenciais salvas. Chave API, conteúdo cifrado e chave de proteção nunca retornam nas props, auditoria ou mensagens de erro.
- `WINDSOR_API_KEY` permanece como fallback compatível até a primeira configuração pelo painel. Desconectar cria um estado explícito desativado e impede esse fallback.
- Aplicação da migração é explícita e idempotente: `node scripts/release-windsor.mjs && npm run build`, com verificação do projeto real de marketing, migração anterior, RLS e ausência de permissões públicas. O build comum não altera o banco.
- Autenticação de administradores verificada no servidor; limite de 10 tentativas por administrador a cada 15 minutos. O teste consulta somente nomes de contas, sem gerar conteúdo nem publicar anúncios.
- Referência: https://windsor.ai/api-documentation — Connectors API aceita chave no parâmetro `api_key`; a requisição fica no servidor e erros são sanitizados.

## Fotos de produtos e promoções

As fotos importadas em `/produtos/importar#fotos` são gravadas em `product_images`, vinculadas a `products` por EAN/nome confirmado. A prévia e a arte da promoção usam a foto principal do produto (ou a foto escolhida na oferta). Arquivos ambíguos ficam em conferência. A transparência original pode ser preservada.

O servidor não acessa o caminho `C:\Users\Admin\Desktop\MARKETING GUSTAVO\MARKETING MINAS FARMA\PRODUTOS RECORTADOS`. A importação dos arquivos reais depende da seleção da pasta no navegador ou do envio de um ZIP pelo usuário. Nenhuma foto real dessa pasta foi recebida nesta etapa.

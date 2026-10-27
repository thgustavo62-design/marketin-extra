# Encartiva — identidade do SaaS

Nova identidade enviada e autorizada pelo cliente em 27/10/2026.

- Lavanda #8E7FEE; creme #F8F5EA; grafite #111214; lilás #DCCEFF; violeta #6754D8.
- Sora variável nos títulos e Inter variável na interface, servidas localmente. Licenças OFL junto às fontes.
- Logos originais, sem recoloração ou distorção, em public/brand/encartiva.
- Login, navegação, Studio, relatórios, metadados e manifesto atualizados. Menu móvel inclui fechamento acessível.
- O canvas e os templates comerciais continuam independentes da identidade da plataforma. Montserrat permanece disponível nos encartes.
- Preservados nomes técnicos de papéis/esquemas do banco, variáveis NOVA7_*, cookies, armazenamento local, formato nova7-layout-v1 e AAD de criptografia Windsor, para não invalidar dados, sessões ou segredos existentes.

## Validação

Na base main, antes da publicação visual: 232 testes, build de produção, login real em 1440/768/390 px, logos/fontes, manifesto e API sem autenticação. Não usa banco de produção.

Na branch de proprietários: 264 testes, build e 102 verificações em PostgreSQL nativo/navegador, incluindo seis verificações da identidade e responsividade. Importação de planilha e exportações PNG/PDF continuam verificadas como proprietário.

A publicação visual é independente dos PRs #3 e #4. A migração 037/038 e a conexão restrita de runtime ainda precisam de acesso ao projeto Supabase correto e análise dos dados/titularidades reais antes da liberação da arquitetura.

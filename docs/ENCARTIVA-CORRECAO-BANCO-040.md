# Correção de banco e campanhas legadas — migração 040

## Diagnóstico em produção

O catálogo atingiu o timeout de 15 segundos. O log apontou a função actor, chamada repetidamente pelas políticas de RLS. Cada linha repetia consultas de sessão e permissões.

O Estúdio também recebeu P0001 ao salvar uma campanha histórica com brand_id nulo: “Selecione uma empresa autorizada antes de gravar este recurso”. A transação gravava a página e depois atualizava o status da campanha; esse último passo era rejeitado e toda a gravação era revertida. A navegação aguardava o salvamento e, portanto, permanecia na tela.

A correção anterior foi testada com campanhas vinculadas a empresas. A regressão atual acrescenta explicitamente uma campanha histórica sem empresa e um catálogo com 8.872 produtos sem classificação.

## Correção

- access_context calcula a identidade e os vínculos autorizados a partir da sessão validada no banco. As políticas usam um initPlan para reutilizar esse resultado dentro da mesma instrução SQL.
- As permissões consideram proprietário, assinatura vigente, empresas ativas, filiais ativas, vínculos explícitos e permissões por funcionalidade.
- A leitura dos produtos e imagens sem empresa continua exclusiva da administração. A condição agora é calculada uma vez por instrução, sem percorrer a função geral de autorização para cada linha.
- As políticas continuam habilitadas. A troca de empresa ou a gravação de configurações falsas na conexão não concede acesso.
- Somente a administração pode editar uma campanha legada que já existia sem empresa. ID, tipo, filial e classificação permanecem inalterados. Novas campanhas sem empresa continuam proibidas.
- O administrador não recebe uma atribuição automática da campanha à empresa ativa. A classificação futura continua exigindo o procedimento administrativo com motivo.
- Os erros de regra de negócio e de permissão recebem HTTP 422/403 no salvamento. Eles deixam de ser tratados como falhas transitórias de conexão.
- As buscas de importação reutilizam os identificadores de empresa e filial por instrução SQL.

## Medições

Os diagnósticos de produção usaram transações revertidas, sem gravar edições na campanha real ou deixar sessões de teste persistidas.

| Consulta no banco de produção                 |                                Antes |                         Depois |
| --------------------------------------------- | -----------------------------------: | -----------------------------: |
| Contagem limitada a 100 produtos, sob RLS     |                           198,417 ms |                       3,927 ms |
| Contagem do catálogo completo, sob RLS        | atingia timeout no fluxo de produtos |                     238,406 ms |
| Atualização da campanha histórica sem empresa |                                P0001 | permitida para a administração |

Essas são medições da consulta SQL. Não representam o tempo total de carregamento da página no navegador.

No PostgreSQL descartável, a contagem de 8.872 produtos caiu de 822,673 ms para aproximadamente 3 ms para a administração; o proprietário permaneceu sem acesso aos produtos sem classificação.

## Validação

- 296 testes unitários e build de produção.
- 171 verificações combinadas de PostgreSQL e navegador.
- Reprodução da falha antiga e salvamento posterior da campanha legada.
- Edição e saída do Estúdio pela interface, mantendo a campanha sem empresa.
- Isolamento entre proprietários, empresas e filiais; tentativa de falsificar contexto; bloqueio de novas campanhas sem empresa.
- Regressões de salvamento, recuperação, concorrência, imagens, estilos, camadas e exportação.
- Verificação de segurança do Supabase após aplicar a migração: sem novos apontamentos; permanece o aviso informativo já existente sobre schema_migrations sem política pública.

O arquivo foi iniciado pelo Supabase CLI e integrado ao diretório db/migrations usando a próxima versão do executor existente. A migração foi registrada nos históricos do Supabase e do aplicativo. Produtos, fotografias, titularidades e campanhas existentes não foram reclassificados.

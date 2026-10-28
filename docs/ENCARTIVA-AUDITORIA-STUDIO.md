# Auditoria do Estúdio: edição e salvamento

## Problemas corrigidos

- Salvar agora captura o estado atual da página. Ctrl/Cmd+S funciona também dentro dos campos.
- O salvamento automático agrupa alterações após 900 ms e mantém um único envio por documento.
- A resposta de salvamento é JSON, sem remontar a árvore da tela a cada alteração.
- A transação comercial reutiliza a conexão e o contexto RLS; não consulta a biblioteca, fundos e arquivos que não participam da verificação da origem.
- Falhas transitórias preservam a edição e tentam novamente até cinco vezes, com intervalos crescentes. O retorno da conexão também dispara uma tentativa.
- Se a resposta se perde depois de gravar, a mesma revisão e o mesmo conteúdo podem ser confirmados novamente. A fila confirma esse envio antes de mandar alterações posteriores.
- Conflitos de revisão ou de origem param a gravação. A interface oferece baixar a cópia editável e reabrir a versão do servidor, com confirmação.
- Uma cópia temporária em IndexedDB permite recuperar alterações após recarregar. As chaves separam usuário, arte, formato, página e aba. A recuperação exige a mesma revisão e origem; caso contrário, permite baixar para comparação.
- Transparência e borda preservam o valor zero. Sliders gravam ao concluir o gesto, preservando um passo de desfazer.
- O campo de fonte aceita edição vazia temporária sem enviar NaN ao Fabric; a faixa de tamanho é de 1 a 1000.
- A barra de ferramentas usa propriedades atuais, sem remontagem forçada a cada alteração.
- A ordenação usa as mesmas regras do painel Posição, mantendo a página no fundo.
- Os controles de cor em grupos abrem Estilos; controles de borda sem aplicação ao grupo não são exibidos.
- O zoom tem limites coerentes mesmo quando a página está muito reduzida.
- A inserção de imagens aguarda o carregamento e comunica falhas. O painel Imagens aguarda a inserção antes de liberar a navegação pelos controles do Estúdio.
- Ferramentas e miniaturas aguardam a restauração da arte. Alterações na seleção deixam de gerar miniaturas repetidas.
- O status de salvamento permanece visível no celular. As formas têm nomes acessíveis.
- A digitação agrupa snapshots do histórico e protege alterações recentes ao sair ou ocultar a aba.

## Segurança e compatibilidade

O endpoint POST /api/studio/:id/document verifica sessão, senha pendente, origem, perfil, formato, página, tamanho e estrutura. O limite da cena continua em 900 KB e 2.000 objetos. Permissões por empresa e filial permanecem no backend e nas políticas existentes. A troca de empresa no navegador não concede acesso.

Não há migração de banco nem alteração de titularidade, catálogo, preços de planilha ou arquivos originais. Recursos de IA continuam dependendo das integrações configuradas.

## Validação

A versão anterior reproduziu a falha de transparência: reabrir o painel mostrava 1 quando o valor salvo era 0.

As regressões cobrem fila concorrente, falha de conexão, resposta perdida depois do commit, edição posterior em voo, conflito entre abas, recuperação local, salvamento manual e automático, recarga, múltiplas páginas, controles de texto e zero nas bordas.

O teste do navegador também percorre planilha, ofertas oficiais Minas Farma, imagens, cores, fontes, grupos, camadas, histórico e saídas PNG/PDF/SVG em banco PostgreSQL descartável. O endpoint recebe verificações de origem, sessão e isolamento de empresa. Os dados reais de produção não são usados como fixtures.

## Uso

Edite a arte e acompanhe o status no cabeçalho. “Salvo” só aparece depois da confirmação do servidor. Use Salvar agora ou Ctrl/Cmd+S antes de sair. Se houver um erro, mantenha a página aberta e use Tentar salvar novamente. Em conflito, baixe sua cópia antes de reabrir a versão salva.

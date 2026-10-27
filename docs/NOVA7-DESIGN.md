# Nova7 — revisão da navegação e área de Design

A criação ganhou uma área própria em `/criacao`, inspirada na escolha de formatos da referência enviada pelo usuário. O layout usa a largura disponível do workspace, inclusive no Dashboard. As abas se reorganizam no celular.

| Opções anteriores | Organização atual | Motivo |
| --- | --- | --- |
| Meus designs, Modelos e Kit de marca no menu lateral | Dentro de Design | Um lugar para iniciar e continuar as criações |
| Calendário, Conteúdos e Importar plano no menu lateral | Abas de Planejamento | A importação é uma ferramenta do planejamento |
| Quadro de produção e Aprovações | Abas de Produção | Mesmo fluxo de execução |
| Insights, Instagram, Meta Ads, Publicações, Metas, Relatórios, Apresentações e Inteligência | Dentro de Resultados | Uma área para acompanhar o marketing |
| Alertas no menu e no cabeçalho | Sino do cabeçalho | Evita dois acessos permanentes para a mesma central |
| Produtos e Promoções | Mantidos como áreas próprias | Fazem parte da montagem das campanhas e não são designs avulsos |
| Base de informações e Unidades | Dentro de Cadastros | São contexto do workspace |

Os registros e as rotas existentes foram preservados. Não foram acrescentados ao menu recursos de assinatura, gamificação ou rádio; nesta etapa o foco é criar e operar campanhas.

## Formatos

Post 4:5, post quadrado, story/status, carrossel com cinco páginas, TV 16:9, banner horizontal, cartazes A4/A3 e etiqueta 12×6 cm. Os cartões criam páginas em branco; não representam um acervo externo de artes prontas. A biblioteca de modelos continua usando os modelos salvos pelos usuários.

A criação do design e das páginas é atômica. Dimensões personalizadas são persistidas no documento do Studio, mantidas ao adicionar páginas e exibidas na listagem. Impressos podem ser exportados em PDF com o tamanho físico dos presets a 300 dpi; documentos A4 antigos de 1414×2000 pixels preservam a página A4 original. O PDF incorpora uma imagem RGB, sem prometer CMYK ou sangria.

## Imagens e IA

A aba `/criacao/ia` mostra separadamente o estado da geração de imagens e da remoção de fundo. A chave e as versões de modelo são configuradas no servidor via Vercel; não são enviadas ao navegador. Administradores têm acesso ao checklist e ao teste da credencial pela API de conta da Replicate, que não chama um modelo de geração.

Variáveis necessárias: `REPLICATE_API_TOKEN`, `REPLICATE_GENERATE_VERSION` e `REPLICATE_REMOVE_BG_VERSION`. Cada recurso só aparece configurado quando há chave e uma versão fixa válida para ele. O backend aceita hash de versão ou `owner/model:hash`, enviando somente o hash para a API. Continua exigindo sessão, escrita, origem e o limite de dez solicitações por hora/usuário.

Na verificação desta etapa, essas variáveis não estavam configuradas na Vercel. Nenhuma chave foi inventada e nenhum processamento pago foi executado. A ativação real depende da credencial e das versões de modelos compatíveis escolhidas na conta do serviço.

## Promoções automáticas e importação de fotos

A montagem de promoções ganhou análise da planilha antes da criação, com os mesmos critérios de associação e agrupamento usados para gravar a campanha. A prévia não cria registros: informa preços, produtos fora do catálogo, fotos ausentes, avisos da planilha e quantidade de páginas em story/feed/A4. A grade pode manter o tema ou usar 1, 4 ou 6 produtos por página, apenas naquela campanha. A arte padrão funciona sem cadastrar um tema.

Em Produtos → Importar → Fotos, o usuário pode selecionar uma pasta do próprio computador, incluindo subpastas, e revisar a quantidade antes do envio. São usados lotes de até seis arquivos/3,3 MB, com otimização local de arquivos maiores. Há pausa entre lotes, continuação enquanto a página permanece aberta, relatório CSV e seleção de falhas para reenviar. A associação por EAN/nome e a detecção de duplicatas continuam no servidor. Casos sem associação vão para conferência. A opção de preservar recortes mantém a transparência sem executar a remoção heurística de fundo.

O navegador precisa receber a seleção dos arquivos: o servidor não acessa caminhos como `C:\Users\Admin\Desktop\...` por conta própria. Nenhuma foto real da pasta do usuário foi enviada nesta sessão, pois esses arquivos não foram disponibilizados. Se a aba for fechada, pode-se selecionar a pasta novamente; os arquivos já reconhecidos serão tratados como repetidos.

Validação conjunta: 232 testes de domínio passaram; TypeScript e build de produção passaram. O harness de navegador valida também pasta/subpastas, transparência, associação por EAN, repetição, relatório, pausa/continuação, rejeição de conteúdo inválido, permissões, prévia sem gravação e criação de campanha sem tema com a grade escolhida.

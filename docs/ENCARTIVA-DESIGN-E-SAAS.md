# Design, desempenho e preparação comercial

## O que esta entrega implementa

- Aba **Estilos** no Studio: cores identificadas na página, troca em toda a página ou somente na seleção, cores HEX/RGBA e transparência, combinações sugeridas e fundo sólido/degradê.
- Kit de marca da **empresa vinculada à arte** dentro do editor: cores aprovadas, fontes do catálogo e inserção de logos como arquivos privados da campanha. Não usa a empresa escolhida no frontend para substituir a titularidade da arte.
- Camadas bloqueadas e fotografias não participam da substituição de cores. Grupos, paradas de degradê e estilos por caractere participam. Preços e descrições mantêm seus textos e valores.
- Alterações fazem parte do JSON Fabric já persistido. Salvamento, revisão concorrente, histórico, RLS e autorização continuam nos caminhos existentes. Nenhuma migration ou credencial nova.
- O novo painel edita a página atual; não regrava o modelo oficial, o kit de marca, outras páginas ou artes de outra empresa.
- Fontes do catálogo disponíveis no seletor, carregadas quando solicitadas. A página de kit de marca passa a carregar somente as fontes selecionadas.

## Organização do código

| Responsabilidade | Módulo |
| --- | --- |
| Normalização, busca e substituição de cores | `src/lib/domain/design-colors.ts` |
| Aplicação das regras ao canvas e histórico | `src/features/studio/design-paints.ts` |
| Interface de estilos e identidade da empresa | `src/features/studio/components/styles-sidebar.tsx` |
| Carregamento de ferramentas por demanda | `src/features/studio/components/tool-panel.tsx` |
| Contagem de páginas, sem importar o renderizador SVG | `src/features/studio/page-count.ts` |
| Carregamento de fontes, separado do desenho das promoções | `src/lib/promo/fonts-loader.ts` |

React/TypeScript, Next.js e PostgreSQL são mantidos. Não há evidência que justifique reescrever todo o sistema em outra linguagem. Processamentos de imagem caros e geração em lote poderão ganhar workers ou serviços próprios quando houver medidas reais de CPU, memória, fila e latência que justifiquem isso.

## Desempenho

- Dez ferramentas laterais e o novo painel Estilos passam a carregar sob demanda. Painéis inativos deixam de ser montados.
- A abertura do editor não inclui mais o seletor completo `react-color`, nem a tabela `material-colors`. O controle de cor usa HTML nativo e commits explícitos, evitando serializar a arte em cada movimento do seletor.
- A navegação de páginas não importa o conversor SVG. Reabrir um documento salvo carrega apenas o módulo de fontes, sem importar o desenho das promoções.
- Fontes públicas passam a ter cache público de um dia; páginas, imagens privadas e APIs continuam sem cache compartilhado.
- `ENCARTIVA_METRICS=/tmp/metrics.json` no fluxo de promoção mede o JavaScript da abertura de um documento salvo com cache HTTP desativado. O tempo local de uma execução não é uma promessa de latência em produção.

Medição em build de produção no mesmo ambiente descartável, abrindo uma arte salva com cache HTTP desativado:

| JavaScript inicial | Antes | Depois |
| --- | ---: | ---: |
| Bytes descompactados | 1.157.985 | 915.760 |
| Bytes transferidos | 348.453 | 279.438 |

A redução de conteúdo JavaScript foi de aproximadamente **20,9%**. Não se promete uma redução equivalente no tempo total: banco, imagens, dispositivo e rede também afetam a abertura. Os tempos locais oscilaram entre execuções e não constituem uma comparação estatística de latência.

## Referência do Canva e limites da análise

Foram consultadas a navegação pública do Canva e as páginas oficiais de paletas, aplicação de cores e temas:

- https://www.canva.com/pt_br/
- https://www.canva.com/help/color-palettes/
- https://www.canva.com/help/apply-brand-kit-colors/
- https://www.canva.com/help/color-themes/

A implementação é própria, sobre a base Fabric já existente. A análise pública não revela o código, algoritmos internos ou backend do Canva. Não representa uma auditoria completa do editor autenticado, nem a implementação de todos os recursos do Canva. Assets pagos, templates e identidade do Canva não foram copiados. Os avisos de licença do canva-clone permanecem em `THIRD_PARTY_NOTICES.md`.

## Próximos critérios para venda

1. **Primeiro resultado do assinante:** configuração guiada de empresa e kit, importação de produtos, primeira arte e exportação; telas vazias com orientação e modelos genéricos completos.
2. **Cobrança e plano real:** checkout, assinatura, limites efetivamente contratados, renovação, cancelamento e recuperação de pagamento. A assinatura legada existente não é uma cobrança recorrente.
3. **Operação:** backup externo completo com restauração testada, monitoramento de erros, indicadores de disponibilidade e acompanhamento do uso de imagens/armazenamento/IA por proprietário.
4. **Configuração dos clientes atuais:** classificar o catálogo legado sem atribuição presumida; cadastrar as filiais reais; concluir a troca de senha inicial do proprietário; importar as fotos locais pelo navegador do usuário.
5. **Design em evolução:** redimensionamento com revisão de composição, distribuição/alinhamento, edição avançada de texto, revisão de marca, comentários/aprovações e versões visuais. Devem preservar preços e exigir revisão quando a composição mudar.
6. **IA em produção:** conectar provedores, estabelecer créditos/custos por plano, limites, rastreabilidade e mensagens de falha. Não transformar botões sem configuração em funcionalidades anunciadas como disponíveis.

A arquitetura de proprietários/empresas/filiais e o isolamento devem continuar sendo critérios obrigatórios de cada entrega. Um painel visualmente pronto não demonstra, sozinho, prontidão comercial completa.

## Validação

`tests/design-colors.test.ts` cobre normalização/alpha, entradas inválidas, grupos, degradês, texto por caractere, preservação de imagens, camadas bloqueadas e round-trip de cenas válidas.

`ENCARTIVA_STYLE_TEST=1` e `ENCARTIVA_PHOTO_TEST=1` no fluxo de promoção usam PostgreSQL e browser descartáveis: kit isolado, seleção/página, salvamento, histórico, logo privado, degradê, recarga, celular e exportação. Nenhum registro ou foto real de produção é criado nesse teste.

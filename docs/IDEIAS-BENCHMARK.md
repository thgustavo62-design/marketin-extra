# Benchmark de apps semelhantes e conceito "Palantir"

Pesquisa feita em 2026-10-11 (fontes ao final). O objetivo não é copiar: é trazer o que cada ferramenta faz de melhor e decidir o que cabe numa operação de duas filiais de farmácia, sem inventar número.

## Palantir (Foundry): o que se aplica aqui

O núcleo do Foundry é a **Ontologia**: *tipos de objeto* (as coisas com que se opera), *tipos de vínculo* (como se relacionam) e *tipos de ação* (operações governadas que mudam as coisas e registram quem decidiu). Cada decisão é vista como **dados + lógica + ação + segurança**.

| Conceito Palantir | No Extra Marketing |
|---|---|
| Objetos | Campanha, Conteúdo, Publicação real, Link/QR, Meta, Alerta, Solicitação, Arquivo |
| Vínculos | campanha → conteúdos → publicações → métricas; conteúdo → arquivos/aprovações/solicitação de origem; campanha → links UTM, inspirações, metas |
| Lógica | Motor de achados (comparações com teste estatístico), qualidade dos dados, mineração do processo (tempo em cada etapa) |
| Ação | Decisão registrada (aceitar / dispensar / concluir) com autor, data e a análise vigente; atalhos que levam ao registro a corrigir |
| Segurança | Tudo filtrado por filial (mesma regra do resto do sistema); nenhum achado mistura filiais sem autorização |

Não é "IA mágica": cada conclusão mostra **amostra, período, fórmula, nível de confiança e limites**. Quando não há dado suficiente, o sistema diz "inconclusivo", não força uma resposta.

## O que os concorrentes têm de bom

| Ferramenta | Ideia | Decisão |
|---|---|---|
| Iconosquare | Melhor horário para postar; benchmarking de mercado; 100+ métricas; relatórios automáticos | **Feito** (melhor dia/período com teste de confiança). Benchmarking de mercado: não — exigiria dados de terceiros; só referências manuais |
| Metricool | Análise de concorrentes, de seguidores e de desempenho por post; Ads + Analytics no mesmo painel | **Parcial**: desempenho por post e Ads já existiam; concorrentes só manual (sem raspagem) |
| Sprout Social | Relatórios executivos, inbox unificada, escuta social | Relatórios já feitos; inbox/escuta: fora (exige APIs e privacidade) |
| Agorapulse | Caixa de entrada, relatórios por cliente | Relatórios por filial já feitos |
| Planable | Aprovação visual com comentários, fluxo configurável | Aprovação com versão congelada já feita; **backlog**: comentário direto sobre a peça |
| Later | Calendário visual de Instagram, link na bio | Calendário já existe; link na bio: backlog |
| Buffer / Hootsuite | Agendamento multi-rede, equipe | Publicação automática: sem prova de viabilidade (ver `VIABILIDADE-PUBLICACAO.md`) |

## O que esta fase entrega (Central de Inteligência)

1. **Achados**: melhor formato, dia e período, tema (pilar) e campanha por engajamento; peças fora da curva; ritmo de publicação. Cada um com amostra, confiança e ação.
2. **Qualidade dos dados**: nota 0–100 e lista do que melhorar nas métricas (vínculo conteúdo↔publicação, coleta atrasada, métricas parciais, amostra pequena, metas, base de informações, arte final, responsáveis).
3. **Processo**: tempo mediano em cada etapa, giro de aprovação, retrabalho, pontualidade de publicação.
4. **Explorar**: o grafo de relações de qualquer campanha, conteúdo ou publicação, com linha do tempo.
5. **Decisões**: o que a equipe aceitou/dispensou/concluiu, e aviso quando a análise mudou depois da decisão.

## Backlog sugerido (não feito)

- Comentários sobre a peça dentro da aprovação (Planable).
- Link na bio com UTM (Later).
- Alertas de anomalia de alcance (precisa de mais histórico de coletas).
- Narrativa em linguagem natural sobre os achados (só se a Fase 6 for reaberta; exigiria provedor, chave e teto de gasto).

## Fontes

- Comparativos Metricool/Sprout/Agorapulse/Iconosquare: <https://www.g2.com/compare/sprout-social-vs-metricool-vs-agorapulse>, <https://metricool.com/metricool-vs-agorapulse/>, <https://postiz.com/compare/iconosquare/metricool>
- Ferramentas de aprovação e calendário: <https://postplanify.com/blog/best-social-media-tools-with-approval-workflows>, <https://toolradar.com/compare/later-vs-planable>
- Ontologia do Palantir Foundry: <https://palantir.com/docs/foundry/ontology/why-ontology/>, <https://palantir.com/docs/foundry/architecture-center/ontology-system/>

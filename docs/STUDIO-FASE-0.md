# Extra Marketing Studio — Fase 0: auditoria, baseline e plano

Data: 16/10/2026 · Escopo: confrontar a especificação "Extra Marketing Studio" com o código real e definir a ordem de entrega.
Este documento descreve o que **existe e foi testado** (e2e `promocoes`, `apresentacoes`; testes unitários), o que **falta** e o que mudou nesta entrega. Nada aqui é promessa de funcionalidade futura.

## 1. Como o editor de promoções é hoje (código real)

| Parte | Onde | Observação |
|---|---|---|
| Modelo de dados | `promo_campaigns` (nome, tema, título, validade, status/aprovação, `overrides` jsonb, `layers` jsonb, `layers_rev`), `promo_items` (encartes), `promo_assets` (imagens da promoção), `promo_themes`/`promo_theme_assets`, `promo_library` | Não existe "documento" genérico: tudo é uma promoção. |
| Regras puras (testadas) | `src/lib/domain/promo.ts` (formatos, preço, grade, tema, overrides, fundos), `promo-group.ts` (agrupamento), `promo-layers.ts` (elementos livres, seleção, grupos, alinhar, distribuir, escalar, colar), `promo-check.ts` (verificar arte), `promo-library.ts` | 100% sem dependência de navegador. |
| Armazenamento | `src/lib/promo/store.ts`, `library.ts`, `xlsx.ts` | Postgres só pelo servidor; imagens em `bytea` (WEBP). |
| Renderização | `src/lib/promo/render.ts` (`drawPage`, `drawLayers`, `drawBackgroundChoice`) — Canvas 2D | O mesmo código desenha a prévia, as miniaturas e a exportação. |
| Editor | `src/app/(app)/promocoes/[id]/promo-studio.tsx` + `layers-ui.tsx`, `background-gallery.tsx`, `library-picker.tsx`, `quick-edit.tsx`, `check-panel.tsx`; console em tela cheia em `/editor/[id]` | Mesmo componente nos dois modos. |
| Exportação | PNG por peça, ZIP por formato/todos (agora com `manifesto.json`), PDF A4 (imagens) | |

Formatos: Story 1080×1920, Feed 1080×1350, A4 **1414×2000 px** (não 300 DPI).

### Divergências entre a especificação e a realidade
1. A especificação lista como "a construir" várias coisas que **já existem**: elementos livres (texto, imagem, formas), camadas, grupos, seleção múltipla, alinhar/distribuir, snap, desfazer/refazer, autosave, edição de texto no lugar, galeria de fundos, biblioteca de imagens, aprovação com invalidação, miniaturas, zoom, ZIP/PDF.
2. O editor **não** é um documento genérico: só existe dentro de uma promoção (planilha → encartes). Não dá para criar uma arte livre sem promoção.
3. Os elementos livres são por **formato** (story/feed/a4) com um campo `page` (uma peça ou todas), não por página independente.
4. A4 é raster a 1414×2000 e o PDF embute PNG (texto não é vetorial).

## 2. Matriz de aderência (resumo)

Legenda: ✅ feito e testado · 🟡 parcial · ❌ não existe

| Capacidade da especificação | Estado | Nota |
|---|---|---|
| Shell com barra superior, painéis, canvas, inspetor, faixa de peças | 🟡 | Existe, sem trilho de ícones vertical nem modo foco/recolher painéis |
| Seleção, múltipla, retângulo de seleção, grupos, camadas | ✅ | |
| Mover/redimensionar/girar, snap, setas | ✅ | |
| Réguas e guias arrastáveis (ímã nas guias) | ✅ (fase 1) | Guias só na tela, lembradas neste navegador por promoção e formato |
| Zoom, pan | ✅ (nesta entrega) | 25–400%, Ctrl+rolagem, Espaço+arrastar |
| Copiar/colar/recortar entre peças e formatos | ✅ (nesta entrega) | Memória da sessão do navegador |
| Desfazer/refazer por gesto, autosave | ✅ | Só dos elementos livres; edições de encarte são salvas na hora, sem histórico de desfazer |
| Conflito de edição simultânea | ✅ (nesta entrega) | Revisão otimista nos elementos livres |
| Texto: edição no lugar, fonte, tamanho, cor, contorno, fundo, alinhamento | ✅ | Seletor com 12 fontes livres (OFL) e prévia; sem estilo por trecho nem texto em arco |
| Imagem: enviar, redimensionar, opacidade, encaixe, recorte/reposicionamento, moldura (retângulo/arredondada/círculo), espelhar, borda, brilho/contraste/saturação/desfoque/P&B | ✅ (fase 2) | Ajustes de cor usam `ctx.filter` (Safari antigo mostra sem ajustes); "substituir foto mantendo a moldura" ainda não existe |
| Formas: retângulo, arredondado, círculo, explosão, linha, triângulo, seta, estrela, hexágono, balão, etiqueta | ✅ | Degradê, traço tracejado/pontilhado e sombra suave em qualquer elemento |
| Fundo: cor, 12 prontos, imagem, fundo de tema | ✅ | Sem gradiente editável |
| Biblioteca de imagens, uploads | ✅ | SVG rasterizado no servidor |
| Verificar arte antes de aprovar | ✅ (nesta entrega) | Bloqueio só para preço/nome inválidos; resto é revisão humana |
| Manifesto de exportação | ✅ (nesta entrega) | Dentro do ZIP |
| Importação de planilha, agrupamento, relatório de importação | ✅ | Sem mapeamento manual de colunas |
| Preço tipado, cartão de produto, grade automática | 🟡 | Preço é dado tipado (reais/centavos) e a grade vem do tema; não há motor de composição por quantidade nem "criar nova página quando não couber" além da paginação por grade |
| Variante de layout por formato (posições próprias) | 🟡 | Grade por formato no tema; elementos livres por formato; não há herança de conteúdo entre variantes |
| Templates editáveis, kits de marca, componentes | ❌ | Hoje: temas (artes de cabeçalho/rodapé/fundo + cores/grade) |
| Documentos livres (sem promoção), "Meus designs", páginas independentes | ❌ | Exige modelo novo (`studio_documents`) |
| Versões/snapshots e restauração | ❌ | Só o estado atual; aprovação guarda quem/quando |
| Auditoria de alteração de preço/aprovação | 🟡 | Aprovação registrada; preço editado não gera log próprio |
| Exportação 300 DPI e PDF vetorial | ❌ | |
| Motion/vídeo, multiplayer, IA | ❌ | Fora do escopo da especificação (P2/futuro) |

## 3. Funcionalidades legadas que devem continuar funcionando (regressão obrigatória)
Cobertas pelo e2e `e2e/suites/promocoes.mjs` (196 verificações) e `apresentacoes.mjs` (32): importação de planilha multiaba, agrupamento de fraldas/fragrâncias, tema e artes, grade, painel/cartões, aprovação e invalidação, edição fina de encarte, console em outra aba, elementos livres (arrastar, girar, camadas, desfazer, copiar entre formatos), seleção múltipla e grupos, galeria de fundos, biblioteca de imagens, downloads PNG/ZIP/PDF, permissões de leitor.

## 4. Decisões técnicas desta fase
- **Motor de render:** manter Canvas 2D (`render.ts`). Migrar para outro motor só com prova de conceito e golden images; nenhum motivo técnico hoje.
- **Sem feature flag nem editor paralelo ainda:** a evolução está sendo feita no próprio editor, em fatias que não mudam dados existentes. Quando entrar o modelo de documento genérico (Fase 2), ele nasce atrás de flag e com adaptador do legado.
- **Migrações:** sempre aditivas e reversíveis (comentário de rollback no SQL). Nesta entrega: `028_promocoes_revisao_camadas.sql` (coluna `layers_rev`).
- **Segurança:** nada muda: servidor valida sessão, perfil e origem; imagens só autenticadas; RLS ligado sem políticas.

## 5. O que esta entrega acrescentou
1. **Verificar arte** (`promo-check.ts`, painel e botão no editor): preço ausente/zerado e encarte sem nome **bloqueiam a aprovação (também no servidor)**; sem foto, EAN repetido, validade ausente, elemento livre fora da peça/vazio/cortado/preso a peça inexistente e termos de publicidade de medicamento (RDC 96/2008, só apoio) pedem revisão. "Ir para" leva ao encarte ou elemento.
2. **Edição simultânea:** controle de revisão nos elementos livres; a segunda aba a salvar recebe aviso e escolhe entre recarregar a versão salva ou manter a sua. Nada é sobrescrito em silêncio.
3. **Ctrl+C / Ctrl+X / Ctrl+V** de elementos, inclusive para outra peça ou formato (com a proporção ajustada).
4. **Zoom 25–400%** por Ctrl+rolagem e **pan com Espaço + arrastar**.
5. **Manifesto no ZIP** (`manifesto.json`: promoção, status/aprovação, arquivos com tamanho e SHA-256, encartes).

### 5.1 Fase 1 (réguas, guias, fontes, formas)
- **Réguas e guias:** botão "Réguas e guias"; arraste da régua para criar, arraste a guia para mover, dois cliques ou soltar fora da peça apaga; elementos grudam nas guias. Não saem na exportação.
- **Fontes:** catálogo em `domain/promo-fonts.ts` (12 fontes; arquivos em `public/fonts/studio`, licenças em `LICENSES.md`), carregadas sob demanda antes de desenhar e de exportar.
- **Formas e estilo:** 6 formas novas, degradê com ângulo, traço tracejado/pontilhado e sombra suave.

### 5.2 Fase 2 (foto na moldura)
- Encaixe "foto inteira" (padrão, como antes) ou "preencher a moldura", com zoom (100–400%) e foco; duplo clique ou botão entra no modo de reposicionar (arrastar a foto dentro da moldura; Esc/Concluir sai).
- Moldura: retângulo, cantos arredondados ou círculo/elipse; espelhar; borda (contínua/tracejada/pontilhada); a sombra de foto recortada é omitida.
- Ajustes: brilho, contraste, saturação, desfoque e preto e branco; "Restaurar ajustes".
- Regras puras em `imagePlacement`/`panImage` (`promo-layers.ts`), testadas; render em `drawImageLayer`.
- O e2e passou a ter limite de 900 s (a suíte de promoções leva ~6 min).

## 6. Riscos conhecidos
- Desfazer não cobre edições de encarte (nome, preço, foto, ordem): são gravadas imediatamente.
- Colar usa memória do navegador (não funciona entre abas).
- O e2e é sensível a lentidão da máquina (esperas fixas); falhas isoladas em rodadas com a máquina ocupada foram de tempo, não de lógica.

## 7. Ordem proposta para as próximas fases (precisa de decisão do responsável)
1. ~~Guias e réguas, seletor de fontes e mais formas/gradientes~~ **(feito na fase 1; ver seção 5.1)**.
2. ~~Recorte/moldura de imagem e ajustes simples~~ **(feito na fase 2; ver 5.2)**.
3. **Modelo de documento genérico** (`studio_documents` + versões) com adaptador do legado e flag: habilita "Meus designs" e arte livre.
4. **Templates e kit de marca por filial** (sobre o item 3).
5. **Composição automática por quantidade e variantes de layout por formato**; exportação em 300 DPI / PDF vetorial.
6. Versões/restauração e auditoria de preço.

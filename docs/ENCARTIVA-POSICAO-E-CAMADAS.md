# Posição e camadas no Studio

Abra uma arte, selecione um elemento e use **Posição** na barra do editor. Abra **Camadas** no cabeçalho para selecionar elementos pelo nome e criar seleções múltiplas.

## Recursos

- Alinhamento à esquerda, direita, topo, base e centros horizontal/vertical.
- Referência **Página** move a seleção inteira em conjunto. Referência **Seleção** alinha os elementos entre si.
- Distribuição horizontal/vertical considera a distância entre as bordas de elementos com tamanhos diferentes. Exige pelo menos três elementos e espaço suficiente para não introduzir sobreposição.
- Medidas exatas: posição X/Y relativa à página, largura/altura sem rotação e inclinação. Dimensões entre 1 e 8192 px; posições entre -16384 e 16384 px, permitindo sangria intencional. A caixa visível após rotação determina X/Y.
- Manutenção de proporção opcional para formas/textos e obrigatória em fotografias e grupos que contêm fotografias. O arquivo original, recorte e filtros da foto são preservados.
- Quatro controles de ordem: topo, frente uma camada, trás uma camada e fundo. O objeto interno da página permanece no fundo.
- Seleção múltipla por caixas em Camadas ou Shift + clique no nome. Agrupar, separar, renomear, ocultar e bloquear.
- Nomes são metadados `layerName`, independentes do texto visível, preços e nomes internos. São validados na importação/salvamento e preservados em grupos e cópias.
- Cada agrupamento, separação, duplicação ou exclusão registra uma única etapa no histórico, evitando salvar estados intermediários com elementos faltando.

## Atalhos

| Ação | Windows/Linux | macOS |
| --- | --- | --- |
| Mover 1 pixel | Setas | Setas |
| Mover 10 pixels | Shift + seta | Shift + seta |
| Agrupar | Ctrl + G | Cmd + G |
| Separar | Ctrl + Shift + G | Cmd + Shift + G |
| Duplicar | Ctrl + D | Cmd + D |
| Recuar / avançar camada | Ctrl + [ / ] | Cmd + [ / ] |
| Fundo / topo | Ctrl + Shift + [ / ] | Cmd + Shift + [ / ] |

Os atalhos não interceptam digitação em campos nem edição de texto no canvas. Operações respeitam o modo de leitura, o carregamento/restauração do documento e camadas bloqueadas/ocultas.

## Implementação

`src/lib/domain/design-layout.ts` concentra geometria, espaçamento, nomes e ordem sem depender de React/Fabric. `src/features/studio/layout-operations.ts` aplica essas regras ao canvas, normaliza as coordenadas temporárias das seleções e agrupa mutações para o histórico. `position-sidebar.tsx` e `layers-panel.tsx` são carregados sob demanda. O painel de camadas foi extraído de `studio-editor.tsx`.

O editor continua usando o JSON e o backend já existentes. Não há migration, mudança de credenciais, alteração de propriedade ou edição automática de modelos oficiais. Os controles mudam a página aberta; não alteram os valores de produtos no catálogo.

## Validação

- Testes de cálculo: seis alinhamentos, limites de seleção, espaçamento entre tamanhos diferentes, entradas inválidas, ordem de seleções não contíguas, nomes e compatibilidade com cenas antigas.
- `ENCARTIVA_LAYOUT_TEST=1` no teste de proprietários/promoções: cria uma arte descartável pela interface, importa um JSON com elementos editáveis e fotografia privada, e executa medidas/rotação, alinhamento, distribuição, histórico, grupo, nomes, ordem, atalhos, duplicação, bloqueio, fotografia proporcional, recarga e exportação SVG.
- Textos de arquivos parciais recebem estilos vazios quando esse campo está ausente, evitando falha do Fabric ao salvar/reabrir; estilos existentes e valores são preservados.

O mesmo fluxo testa o painel no celular e preserva os preços da campanha de origem. `ENCARTIVA_PHOTO_TEST=1` e `ENCARTIVA_STYLE_TEST=1` cobrem as regressões das entregas anteriores.

Esta entrega amplia os fluxos de composição. Ainda não representa todos os recursos do Canva, como colaboração simultânea, vídeo, animação, máscaras avançadas ou editor completo de documentos.

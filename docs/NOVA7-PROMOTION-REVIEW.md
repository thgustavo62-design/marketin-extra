# Encartes: importação, regras e revisão inteligente

## Fluxo disponível

Promoções → **Importar e revisar** → selecionar empresa e planilha → conferir originais e ofertas lado a lado → aprovar/desagrupar/editar → confirmar revisão → Studio. O fluxo anterior continua disponível durante a transição, sem apagar campanhas existentes.

### Aproveitamento do projeto

| Estrutura existente                                  | Uso nesta etapa                                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| products / product_images                            | Catálogo e fotografias exatas por EAN; atributos comerciais confirmados adicionados ao cadastro |
| promo_items / variants                               | Oferta final com todos os SKUs do grupo e até duas fotos distintas                              |
| promo_themes / promo_theme_assets / promo_theme_arts | Layouts, grades, cores, cabeçalhos, selos, rodapés e elementos posicionáveis                    |
| promo_library                                        | Elementos gráficos em categorias próprias, incluindo mascotes, texturas, etiquetas e faixas     |
| studio_pages                                         | Projetos finais editáveis; exportações existentes PNG/JPG/SVG/PDF preservadas                   |
| promo_versions                                       | Histórico existente das peças, preservado                                                       |

Novas entidades são `promo_imports` (arquivo original, linhas, grupos, regras e revisão), `promo_grouping_rules`, `promo_grouping_memory` e `promo_theme_versions`. Linhas e membros dos grupos ficam em JSONB no rascunho, sem duplicar tabelas de produtos/campanhas. A migração é `036_promotion_review.sql`.

## Importador

- XLSX e XLS com SheetJS CE 0.20.3, distribuição oficial fixada no lockfile. O leitor antigo permanece para compatibilidade.
- Todas as abas, cabeçalhos por nome, erro VALRO APROXIMADO, REF/REFERENCIAS e coluna sem título imediatamente após Descrição.
- Valor aproximado é o padrão; promoção e venda podem ser escolhidos nas regras. O importador nunca usa custo de entrada como preço da arte. Ausência do campo escolhido gera aviso ou impede a importação.
- Moeda brasileira, GTIN textual com zero à esquerda, preços alternativos e arquivo original preservados. Fórmulas dependem do resultado já salvo no arquivo; não são executadas.
- Linhas vazias e títulos de seção são estrutura. EAN/preço inválido e duplicatas são sinalizados; o arquivo original permite conferência, sem inventar códigos ou preços.
- Limites: 4 MB de entrada, 40 MB declarados descompactados para XLSX, 40 abas, 5.000 linhas/aba e 2.000 produtos válidos. Não há chamadas de IA nesse processamento.

## Decisão comercial

Os grupos são sugestões até aprovação. Regras impedem mistura de preços, volumes, marcas identificáveis, tipos, FPS e medicamentos. Tamanhos de fraldas são uma regra própria, desligada por padrão. Atributos comerciais confirmados no catálogo também impedem misturar linhas/apresentações incompatíveis.

Referências genéricas não tornam todo o catálogo elegível. A busca usa família compatível e oferece candidatos para confirmação. Mesmo a opção administrativa de pré-selecionar compatíveis exige aprovação da oferta. Variações desconhecidas usam “Fragrâncias selecionadas” ou o texto explícito da referência para conferência; nomes nunca são fabricados.

A memória é separada por empresa e usa hash do conjunto exato de EANs, descrições e categoria. Reutiliza aprovação apenas para os mesmos produtos importados com preço atual uniforme. Rejeitar um grupo desagrupa futuras importações equivalentes. A memória não fixa preços antigos e não inclui SKUs extras silenciosamente.

Fotografias vêm de SKUs confirmados, com deduplicação pelo hash da imagem. Não são usadas embalagens de IA nem cópias da mesma foto para preencher espaço. A geração verifica se as fotos continuam vinculadas aos produtos. Se uma foto foi removida, é preciso atualizar a revisão.

## Layouts e elementos

Layouts e modelos reaproveitam temas: prévia desenhada pelo renderizador real, grades configuráveis, categoria, versão de configuração, duplicação com cópia das artes e ativação/desativação. JSON importa/exporta configuração; imagens são enviadas separadamente no editor. O versionamento novo guarda configurações e posições, não é um arquivo histórico completo dos bytes substituídos de cada imagem.

Grades de 1, 2, 4, 6 e as grades personalizadas do tema. A revisão oferece feed quadrado 1080×1080; story 1080×1920, feed vertical 1080×1350 e A4 continuam disponíveis. Elementos finais são importados no Fabric como objetos editáveis. Etiqueta de preço, textos, fotos e posições podem ser ajustados no Studio.

## Permissões e integridade

Importações, regras e memória têm empresa explícita, autenticação no servidor e controle de versão para evitar sobrescrita entre abas. Novas tabelas têm RLS e nenhum grant para PUBLIC, anon, authenticated ou service_role; o aplicativo usa sua conexão PostgreSQL no servidor. Revisões/campanhas privadas são filtradas por acesso à empresa, inclusive Studio, miniaturas, assets e ações de edição. O catálogo comum e os layouts de workspace existentes continuam compartilhados; isto não cria tenancy independente para novos assinantes.

Somente administradores salvam regras. Editores podem importar e conferir dentro das empresas autorizadas; leitores apenas consultam. Geração é idempotente, exige revisão explícita e salva a campanha na mesma transação que fecha o rascunho.

## Validação da referência real

Arquivo de referência: CORTA PREÇO MINAS FARMA (1)(2).xlsx. Contagem conferida: 8 abas e 160 EANs válidos únicos. Foram identificados dois códigos inválidos em LIMPEZA e uma repetição em DERMO; linhas de título não são tratadas como falhas. Comfort 1L preserva as três fragrâncias e preço de arte R$ 22,99; REF de sabonetes é reconhecida mesmo sem cabeçalho.

Os testes de navegador usam PostgreSQL local descartável. Nenhum preço, campanha ou fotografia de teste é gravado no banco de produção. As fotos da pasta Windows não foram recebidas; sua importação real continua dependendo do ZIP ou da seleção da pasta no navegador.

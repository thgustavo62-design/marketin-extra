# Biblioteca de farmácias, supermercados e edição rápida

## Experiência entregue

- Menu principal prioriza início, design, promoções, produtos e resultados; organização e acesso podem ser expandidos. O acesso administrativo usa a identidade real de administrador da plataforma.
- A biblioteca em `/promocoes/modelos` e `/criacao/modelos` oferece dez composições originais: Farma Essencial, Bebê & Carinho, Beleza Natural, Cuidado Diário, Energia & Equilíbrio, Ofertas de Impacto, Mercado da Economia, Hortifruti Fresco, Atacado Inteligente e Black Friday. Há busca, categorias e prévias de Feed, Stories e A4.
- O botão de cada modelo leva à importação e revisão da planilha. A escolha acompanha a revisão e pode ser alterada antes da geração. A importação direta também aceita os modelos.
- Cor principal, destaque e cores cadastradas no kit da empresa são opcionais. O servidor consulta o kit da empresa da campanha/importação, usando o banco sob RLS. O rodapé inicial usa o nome real dessa empresa.
- `/promocoes/[id]/ofertas` oferece busca, edição de descrição/preço/informação complementar/foto principal e prévia imediata. Salva os dados reais, registra o histórico existente e remove a aprovação anterior. O Studio tem um atalho para essa tela.
- Alterações de dados preservam as cenas já editadas no Studio. Ao voltar, a indicação de dados alterados permite regenerar explicitamente a página. Isso evita substituir decisões do designer sem revisão.

A biblioteca `/promocoes/etiquetas` acrescenta dez etiquetas dinâmicas: Essencial, Destaque, Contorno, Cupom, Bandeira, Faixa dinâmica, Brilho 3D, Explosão de ofertas, Gôndola e Black Premium. A escolha é salva na campanha e pode ser substituída por oferta nos modelos genéricos. Preços e fotos continuam sendo dados reais da empresa.

## Arquitetura e persistência

Os modelos públicos são definições imutáveis e versionadas em `src/lib/domain/pharmacy-models.ts`. Não contêm logotipos, fotografias, telefones, endereços ou IDs privados de empresas. Todos os usuários autenticados podem visualizar a biblioteca; somente os usuários autorizados podem gerar campanhas ou modificar ofertas.

A campanha guarda uma cópia normalizada de sua configuração em `promo_campaigns.overrides.model`, contendo chave, versão e tema. Esse JSONB já existe no banco: não há migration, mudança de RLS ou catálogo duplicado por proprietário. Atualizar uma definição global não atualiza campanhas criadas anteriormente. Os novos cabeçalhos e fundos são vetores importados pelo caminho de SVG/Fabric existente; preços e textos permanecem editáveis. As URLs locais de imagens resolvidas pelo Fabric são convertidas ao caminho relativo somente quando correspondem à mesma origem e à lista permitida do Studio. Regenerar aguarda o término da carga e só então atualiza o hash de origem; uma falha mantém o aviso de dados desatualizados.

Uma seleção explícita de modelo global não grava `theme_id` privado. Sem seleção, o fluxo de identidade automática e a seleção oficial CP-MF-006 continuam funcionando. Nenhum registro, produto, foto ou modelo oficial de Minas Farma ou Farma e Farma é reclassificado.

O endpoint de edição rápida usa sessão real, origem, perfil, vínculo campanha/item e RLS; limita a leitura a 12 KB e devolve JSON privado sem cache. A transação bloqueia primeiro a campanha e depois o item. Um token de versão detecta mudanças concorrentes em nome, preço, nota e fotos. Repetir uma gravação já confirmada com os mesmos valores é idempotente; uma edição divergente recebe 409.

As prévias da galeria carregam o renderizador somente quando entram perto da tela. As fotos geométricas e os preços da galeria são exemplos indicados como ilustrativos e nunca entram na campanha do cliente. As fotografias da campanha vêm da importação e do catálogo autorizado.

## Referências

Pesquisa pública no Pinterest: https://br.pinterest.com/pin/701717185729404616/ e pesquisas de encartes, bebê e dermocosméticos. Foi inspecionada a imagem pública desse pin para observar hierarquia de título, grade, preço e rodapé. Outros pins encontrados bloquearam o acesso. Os arquivos premium, imagens, marcas e composições prontas não foram incorporados. Os dez modelos desta entrega foram desenhados em código próprio.

## Validação

`tests/pharmacy-models.test.ts` verifica isolamento das definições, snapshot e round-trip, normalização de entradas, contraste de cores, paginação com preservação de todos os valores, identidade oficial e token de concorrência.

`ENCARTIVA_MODEL_TEST=1 NOVA7_PROMOTION_TEST=1 NOVA7_BROWSER_TEST=1 NOVA7_TEST_DB=postgres` no harness `e2e/owner-hierarchy-local.mjs` exercita a galeria, busca, celular, planilha real de teste, revisão, dez campanhas, três formatos no Studio, edição rápida, persistência, conflitos, repetição, origem inválida e acesso entre empresas. O banco é descartável e o aplicativo de teste recebe somente conexões locais.

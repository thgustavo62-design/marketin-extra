# Arquitetura — Extra Marketing

Next.js (App Router) + TypeScript + Supabase (Postgres, só pelo servidor). Regra de ouro: **cada coisa mora em um lugar só**. Antes de criar algo novo, procure se já existe aqui.

## Camadas (de baixo para cima)

| Camada | Pasta | O que faz | Pode importar |
|---|---|---|---|
| Domínio puro | `src/lib/domain/` | regras sem banco nem rede: rótulos, datas, indicadores, CSV, Reels, leitura de plano em PDF | só ele mesmo |
| Insights puros | `src/lib/insights/calc.ts` | períodos, variação, séries diárias, números compactos | domínio |
| Serviços de fluxo | `src/lib/production/stage.ts`, `src/lib/approvals/*`, `src/lib/storage/` | mudança de etapa (única entrada), aprovações com versão congelada, armazenamento de arquivos | db, domínio |
| Métricas e metas | `src/lib/domain/publication-metrics.ts`, `targets.ts`, `src/lib/publications/collect.ts`, `src/lib/targets/realized.ts` | cálculos puros (N/D, medianas, maturidade, sugestão de vínculo, progresso de metas) · coleta manual para o banco · realizado das metas (sistema → Windsor → histórico) | db, domínio, windsor |
| Alertas e relatórios | `src/lib/domain/alerts.ts`, `reports.ts`, `src/lib/alerts/sync.ts`, `src/lib/reports/*` | regras de alerta e períodos (puros) · reavaliação idempotente · montagem do retrato → blocos → HTML/CSV/PDF | db, domínio, targets |
| Endereço de publicação | `src/lib/domain/publish-url.ts` | validação do endereço da publicação (só redes conhecidas, https) e permalink comparável (puros) | — |
| Inteligência | `src/lib/domain/intelligence.ts`, `src/lib/intelligence/{analyze,objects}.ts` | estatística e regras puras (testadas) · leitura do banco por filial · grafo de objetos | db, domínio |
| Regras de acesso | `src/lib/perms.ts`, `src/lib/integrations.ts` | perfis, acesso por filial, identificação das contas do Windsor | domínio |
| Banco | `src/lib/db.ts` | pool único, com limites de tempo | — |
| Dados (leitura) | `src/lib/data/*` (importe de `@/lib/data`) | consultas por assunto: `brands`, `posts`, `campaigns`, `knowledge`, `users`, `integrations`, `dashboard` | db, domínio |
| Sessão e permissão | `src/lib/session.ts`, `src/lib/auth.ts`, `src/lib/access.ts`, `src/lib/scope.ts` | login, guardas (`requireUser`, `requireAdmin`, `writerOrError`…), acesso por filial, escopo da tela | data |
| Windsor | `src/lib/windsor.ts`, `src/lib/insights/server.ts` | cliente do Windsor + carregamento dos Insights já filtrados por filial | data, insights |
| Telas e ações | `src/app/(app)/**` | páginas (leitura) e `actions.ts` (escrita) de cada área | tudo acima |
| Componentes | `src/components/` | peças de interface reutilizáveis | domínio |

Regra: **telas não escrevem SQL** (usam `@/lib/data`); **cálculo não fica na tela** (vai para `domain` ou `insights/calc`) e ganha teste em `tests/`.

## Mapa das telas

```
(app)/page.tsx               Dashboard (getDashboard: tudo agregado em SQL)
(app)/planejamento/          calendario · conteudos (+novo, [id]) · importar-plano (upload, prévia [id], histórico)
(app)/producao/              quadro Kanban (board.tsx, task-drawer.tsx, actions.ts) — lê `posts` via `src/lib/data/production.ts`
   aprovacoes/ · biblioteca/   (cada uma com page + actions)
(app)/produtos/              catálogo de produtos + imagens (page, [id], novo, importar, conferir; actions.ts) — dados em `src/lib/catalog/` (store, erp, open-data, images) e regra de casamento em `src/lib/domain/catalog.ts`
(app)/promocoes/             promoções por planilha: page (envio), [id] (estúdio: prévia, edição, downloads), temas (artes) — dados em `src/lib/promo/` (store, xlsx, render no navegador) e regras puras em `src/lib/domain/promo.ts` (agrupamento em `promo-group.ts`, elementos livres em `promo-layers.ts`); o editor de elementos livres (texto, imagem, formas: arrastar, redimensionar, girar, camadas, desfazer/refazer, ímã, atalhos, zoom) está em `[id]/layers-ui.tsx` e salva sozinho em `promo_campaigns.layers`; a conferência "Verificar arte" é `domain/promo-check.ts` (usada pelo editor e pela aprovação no servidor); os elementos livres têm revisão otimista em `promo_campaigns.layers_rev`; o fundo da promoção (galeria) fica em `promo_campaigns.overrides.background` e é desenhado por `drawBackgroundChoice` (`background-gallery.tsx`); seleção múltipla/grupos usam as funções puras de `promo-layers.ts` (grupo = campo `group` do elemento); a biblioteca de imagens compartilhada fica em `promo_library` (`src/lib/promo/library.ts`, regras em `domain/promo-library.ts`; SVG só se autossuficiente e rasterizado no servidor) e é copiada para `promo_assets` ao usar numa promoção; as imagens enviadas ficam em `promo_assets` (`/api/promocoes/camada-imagem/[id]` envia, `/api/promocoes/asset/[assetId]` serve)
(app)/resultados/apresentacoes/  biblioteca de apresentações (PPTX/PDF): envio em partes de 3,5 MB (limite da Vercel) para `presentations`/`presentation_chunks`, visualizador com tela cheia ([id]/viewer.tsx: pdf.js para PDF, pptx-preview para PPTX); regras em `src/lib/domain/presentations.ts`, dados em `src/lib/presentations.ts`, API em `/api/apresentacoes`
(app)/campanhas/             lista de campanhas
(app)/resultados/            page = Insights (Meta, via Windsor) · instagram · meta-ads · vinculos · metas
(app)/gestao/                base · unidades
(app)/alertas/               central de alertas (a reavaliação roda no sino do layout)
(app)/inteligencia/          Central de Inteligência (page com abas, finding-card, explorar/[kind]/[id], externo/ = mercado e preços CMED)
(app)/configuracoes/         layout com abas escuras: usuarios · fluxo · integracoes · auditoria · conta
api/export/                  conteudos.csv · insights.csv
api/media/                   POST envio de arquivo · [id] GET download autorizado
```

## Como adicionar uma coisa (receita)

**Nova tela de leitura** — `page.tsx` na pasta da área; comece com `const user = await requireUser()` e `const scope = await getScope()`; busque via `@/lib/data` passando `scope.brand?.slug` / `scope.branch?.id`. Dados lentos (Windsor) vão dentro de `<Suspense>` para a página aparecer na hora.

**Nova ação de escrita** — `actions.ts` com `'use server'`:
1. guarda: `writerOrError()` (formulário) ou `writerOrRedirect()` (botão), `adminOrError()` para administração;
2. valide a entrada; confira a filial: `brandAllowed(user, brandId)` e, para registro existente, `rowAllowed(user, 'tabela', id)`;
3. grave com SQL parametrizado; `audit('acao', …)` (nunca grave senha);
4. `redirect()` ou devolva `{ error }` / `{ ok }` (`FormState`) para o `ActionForm`.

**Status de conteúdo** — a única fonte é `posts.stage` (9 etapas em `domain/labels.ts`). **Toda mudança de etapa passa por `changeStage` (`src/lib/production/stage.ts`)**: revisão farmacêutica, bloqueio, confirmação de "Publicado", aprovação exigida pela filial, checagem de `revision` e `post_status_events`. Nunca faça `update posts set stage` direto em tela nova.

**Editou conteúdo ou anexo** — chame `invalidateIfChanged(postId, userId, motivo)` (`src/lib/approvals/service.ts`) depois de gravar: se a versão aprovada/pendente não confere mais, a aprovação é invalidada e o cartão volta para revisão.


**Importação de plano em PDF** — três etapas, nunca direto: (1) `POST /api/plano/analisar` (sessão, origem, perfil, filial, 4 MB, tipo real pelos bytes) extrai o texto com `unpdf` (`lib/plan/pdf.ts`: limite de 150 páginas, tempo e volume; PDF com senha ou sem texto é recusado) e grava uma **prévia** em `plan_imports.parsed`; (2) a tela de prévia (`importar-plano/[id]`) mostra o que foi lido, avisos e o que já existe; (3) `confirmPlanImportAction` → `lib/plan/service.ts#importPlan` **lê o plano guardado** (nunca pautas vindas do navegador), valida pessoas e campos, trava a linha da importação (`for update`) e insere tudo **em lote** (`jsonb_to_recordset` + `unnest`: poucas consultas, 59 pautas em ~4 s; inserir uma a uma estourava 60 s). O leitor é lógica pura em `domain/plan-import.ts` (`parsePlan` → `buildDraft` / `buildPreviewRows`), com teste e **sem IA**: linhas do calendário por data + código + formato + horário, briefings por rótulos, lista numerada só vira item sob rótulo de lista (um título numerado encerra o briefing em texto corrido). Tudo que parece errado vira `PlanWarning`, não é corrigido em silêncio. Convenções: Story entra como Feed (como em `FORMAT_BY_TYPE`); `pharma_review` nunca é marcado; código repetido ganha sufixo (`R01-2`) por causa do índice único `(plan_import_id, plan_code)`; o mesmo arquivo só entra uma vez por filial/unidade (`plan_imports_once_idx`). Desfazer (`undoImport`) só apaga pauta em Ideia/Briefing, `revision = 1`, sem tarefa feita, comentário de pessoa, anexo ou publicação vinculada. Cuidado: texto de PDF do Word traz marcadores invisíveis (área de uso privado) e já trocou o emoji 📲 por 🐀 — o leitor normaliza os dois.

**Botão de coleta** — a ação é uma só, `resultados/collect-action.ts` (`collectAction`), e a interface é `components/collect-button.tsx` (cliente) dentro de `components/collect-panel.tsx` (servidor: última coleta + botão por papel). Para pôr o botão numa tela nova: `<CollectPanel scope={scope} />` e `export const maxDuration = 60` na página (a ação roda com o limite da página que a chama). Não há limite de intervalo entre coletas (decisão do responsável; o upsert por dia torna repetir seguro). A ação faz `revalidatePath('/resultados', 'layout')` e `('/')` para as telas lidas ao vivo (cache de 5 min) mostrarem o número novo.

**Métricas por publicação** — a tela de vínculos nunca chama o Windsor: lê `external_publications` + `publication_metric_snapshots`. Só `collectMetrics` escreve (um retrato por publicação por dia; valor ausente nunca sobrescreve valor existente; falha na leitura principal = nada gravado). Campos verificados no Windsor: media_reach, media_views, media_like_count, media_comments_count, media_saved, media_shares, media_reel_total_interactions, account_id, media_permalink. **Não usar** media_video_views/media_plays/media_impressions (vêm sempre 0). Vínculo: `linkPublicationAction` — `verified_match` é recalculado no servidor, nunca aceito do navegador. Nova métrica de meta: acrescente em `TARGET_METRICS` (`domain/targets.ts`), na CHECK de `brand_targets.metric_key` (migração nova) e em `loadRealized`.

**Alertas** — `syncAlerts` é a única que escreve em `notification_events`: faz upsert por `dedupe_key` e marca `resolved_at` no que não foi visto na rodada. `maybeSyncAlerts` usa `alert_sync_state` como trava (2 min). Novo tipo de alerta: acrescente em `ALERT_TYPES`, na CHECK da tabela (migração nova) e uma consulta em `sync.ts`; todo parâmetro de data com soma precisa de cast (`$2::int`).

**Relatórios** — `buildReport` só lê o banco e devolve um retrato JSON (gravado em `reports.snapshot`). `snapshotToBlocks` decide o conteúdo uma vez; HTML (`ReportView`), CSV e PDF (pdf-lib, fontes padrão: texto passa por `pdfSafe`) renderizam os mesmos blocos. Rotas de download usam `rowAllowed(user, 'reports', id)` → 404 sem acesso. Novo tipo de relatório: dados em `build.ts`, blocos em `blocks.ts`, tipo na CHECK de `reports.type`.

**Publicação** — `confirmPublicationAction` passa por `changeStage` (mesmas regras de aprovação) antes de gravar `published_url`; método `api` é recusado até existir prova de viabilidade.

**Inteligência** — a estatística mora em `domain/intelligence.ts` (puro): `compareGroups` devolve um `Finding` com evidência, confiança e ação; nunca devolva conclusão sem n e método. `analyzeBrand` só lê dados guardados, **uma filial por vez**. Novo achado: calcule os grupos em `analyze.ts` e passe a `compareGroups` (ou monte um `Finding` com `confidence` explícito). Decisões usam `insight_decisions` + `fingerprintOf(finding)`. Objetos novos no explorador: acrescente em `objects.ts` e cheque o acesso com `rowAllowed`. **CSS**: antes de criar uma classe genérica (`.bar`, `.card`…) procure em `globals.css` — uma colisão já quebrou o gráfico do Dashboard; o e2e agora tem checagens visuais.

**Dados externos** — fontes abertas em `src/lib/external/`: `fetch.ts` (`safeFetch`: só https, lista de domínios permitidos, sem redirecionar para fora, timeout e limite de tamanho; cabeçalhos HTTP **só ASCII** — um `User-Agent` acentuado já causou 400 no IBGE) e `run.ts` (`runSource(key, actor, {force})`: limite de 10 min por fonte, registra em `external_imports`, grava em lote com `unnest` e só apaga linhas antigas depois de importar com sucesso). A planilha da CMED é lida em streaming (`exceljs`). Regras puras em `domain/` (`calendar`, `cmed`, `external`, `advertising`) com teste; `checkPrice` nunca afirma “acima do teto” sem `brands.icms_pct`. Cruzamentos em `intelligence/market.ts` (achados) e `alerts/sync.ts` (alerta `date_uncovered`). Nova fonte: acrescente à lista de permitidos, crie o importador, registre em `external_sources` e documente licença em `docs/FONTES-EXTERNAS.md`. A importação pesada roda dentro do limite de 60 s da Vercel (`maxDuration` na página de Inteligência).

**Ações com link na tela** — não coloque link de leitura dentro de `.card-actions`: a regra `[data-readonly] .card-actions { display: none }` esconde essa área para quem só lê. Use `.finding-actions` / `.link-actions`.

**Arquivos** — envio só por `POST /api/media` (limite de 4 MB por causa do corpo de requisição da Vercel; tipo conferido pelos primeiros bytes) e leitura por `/api/media/[id]`, que confere a filial. O armazenamento é `getStorage()` (hoje Postgres, `media_blobs`); para outro serviço, implemente a interface `StorageProvider` em `src/lib/storage`.

**Nova tabela** — arquivo novo em `db/migrations/NNN_nome.sql` com `enable row level security` e **nenhuma policy**; rode `npm run db:migrate`.

**Novo indicador do Windsor** — confirme o nome do campo na API (o Windsor sugere o nome certo no erro); acrescente ao conjunto em `src/lib/insights/server.ts`; monte o cartão com `MetricCard`. Campos com limite de dias (ex.: novos seguidores, 30 dias) vão em consulta separada.

## Convenções

- **Vocabulário:** *Filial* = Minas Farma ou Farma e Farma (`brands`); *Unidade* = loja dentro da filial, opcional (`branches`).
- **Acesso:** Administrador (tudo) · Editor (cria/edita) · Leitura (só vê). Editor e Leitura podem ser limitados a certas filiais (`users.brand_ids`); a regra vale no servidor, a interface só esconde.
- **Honestidade:** nada de número inventado. Sem dado → "—" e o motivo; integração não conectada aparece como "Não conectado".
- **Segredos:** só em `.env` (ignorado pelo Git) e nas variáveis da Vercel; nunca em código, log ou commit.
- **Estilo:** tokens e componentes em `src/app/globals.css` (padrão do sistema do Grupo Extra); textos em português do Brasil; datas como texto ISO (`YYYY-MM-DD`) para não ter problema de fuso.

## Velocidade

- Função na região `pdx1` (`vercel.json`), perto do banco (Supabase em Oregon).
- Listas usam consultas leves (`listPostsLite`, paginadas); o Dashboard é calculado em SQL, em paralelo.
- Windsor: cache de 5 min no servidor, carregamento em streaming, limite de 12 s.
- Banco: limites de tempo por consulta (15 s) para uma página presa não travar o sistema.
- Arquivos estáticos (logo, JS) são cacheáveis; páginas e API nunca.

## Testes

`npm run typecheck` · `npm test` (regras puras em `tests/`, ~3 s) · `npm run e2e` (ponta a ponta, ~2 min).

**Testes de ponta a ponta (`e2e/`)** — navegador de verdade (Playwright + Edge), uma suíte por área em `e2e/suites/*.mjs`. O executor (`e2e/run.mjs`) dá a **cada suíte o seu próprio ambiente**: um *schema* novo no Postgres (migrações aplicadas em uma chamada só, usuários de teste criados) e um servidor do app (`next start`) próprio, e roda várias suítes ao mesmo tempo. Por padrão o banco é um **Postgres local embutido** (`embedded-postgres`, sem Docker; consulta em ~0,3 ms contra ~200 ms até o Supabase) e o app só recebe a URL local, então o teste **não consegue tocar nos dados reais**; `--remote` usa o banco do `.env` em schemas isolados. O build é refeito sozinho se o código mudou. Cada linha do log (`e2e/.out/<suíte>.log`) leva o tempo desde o início da suíte.

Opções: `--only a,b` · `--skip net,windsor` (sem internet) · `--jobs N` · `--keep` (mantém o schema para investigar) · `--list`. Metadados no topo de cada suíte: `// @title:` e `// @needs: net windsor`. Para criar uma suíte nova copie uma existente (login, `scope`, `ck`), use `process.env.BASE` e `process.env.DATABASE_URL` e termine imprimindo `N/M verificações passaram`. PDFs de teste são **fictícios e gerados na hora** (`plano-pdf.mjs`); a suíte `plano-pdf-real` usa um PDF de cliente só se existir na máquina (`E2E_PDF_REAL`) e nunca vai para o repositório.

Armadilhas já vividas: (1) não use dados reais nem fuso da máquina nas asserções (o executor força UTC); (2) duas suítes nunca podem compartilhar porta (o executor reserva portas e só aceita o servidor que imprimiu “Ready”); (3) esperas fixas (`wait(3000)`) escondem lentidão: prefira `waitFor`/`networkidle`; (4) o SSL do app só é desligado para `127.0.0.1`/`localhost`.
